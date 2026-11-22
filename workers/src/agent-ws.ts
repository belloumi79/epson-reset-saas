export class AgentWebSocket {
  private state: DurableObjectState
  private env: Env
  private ws: WebSocket | null = null
  private pendingRequests = new Map<string, { resolve: Function; reject: Function; timestamp: number }>()

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.state.blockConcurrencyWhile(async () => {
      const existing = this.state.getWebSockets()
      if (existing.length > 0) this.ws = existing[0]
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair())
      this.ws = server
      this.ws.accept()

      this.ws.addEventListener('message', (msg) => this.handleAgentMessage(msg.data))
      this.ws.addEventListener('close', () => { this.ws = null })
      this.ws.addEventListener('error', (e) => console.error('WS error:', e))

      const agentId = url.pathname.split('/ws/agent/')[1]
      await this.env.DB.prepare(
        'UPDATE agents SET last_seen = ?, connected = 1 WHERE agent_id = ?'
      ).bind(new Date().toISOString(), agentId).run()

      return new Response(null, { status: 101, webSocket: client })
    }

    if (url.pathname === '/read_counters') {
      return this.forwardToAgent(request, 'read_counters')
    }
    if (url.pathname === '/reset') {
      return this.forwardToAgent(request, 'reset')
    }

    return new Response('Not Found', { status: 404 })
  }

  private async forwardToAgent(request: Request, type: string): Promise<Response> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Response.json({ success: false, error: 'Agent non connecté' }, { status: 503 })
    }

    const requestId = crypto.randomUUID()
    const body = await request.json()

    const result = await new Promise<any>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject, timestamp: Date.now() })
      this.ws!.send(JSON.stringify({ type, payload: body, request_id: requestId }))

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Timeout agent (30s)'))
        }
      }, 30000)
    })

    return Response.json(result)
  }

  private async handleAgentMessage(data: string) {
    try {
      const msg = JSON.parse(data) as { type: string; request_id?: string; payload: any }

      if (msg.type === 'printers_discovered') {
        const agentId = this.state.id.toString()
        for (const p of msg.payload.printers) {
          await this.env.DB.prepare(`
            INSERT OR REPLACE INTO agent_printers (agent_id, vendor_id, product_id, model, serial, supported, discovered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(agentId, p.vendor_id, p.product_id, p.model, p.serial, p.supported ? 1 : 0, new Date().toISOString()).run()
        }
      } else if (msg.type === 'response' && msg.request_id) {
        const pending = this.pendingRequests.get(msg.request_id)
        if (pending) {
          this.pendingRequests.delete(msg.request_id)
          pending.resolve(msg.payload)
        }
      } else if (msg.type === 'heartbeat') {
        const agentId = this.state.id.toString()
        await this.env.DB.prepare(
          'UPDATE agents SET last_seen = ? WHERE agent_id = ?'
        ).bind(new Date().toISOString(), agentId).run()
      }
    } catch (e) {
      console.error('WS message error:', e)
    }
  }
}