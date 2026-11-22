import { AgentWebSocket } from './agent-ws';

export interface Env {
  DB: D1Database
  SESSIONS: KVNamespace
  AGENT_WS: DurableObjectNamespace
  FRONTEND_URL: string
}

interface Printer {
  vendor_id: number
  product_id: number
  model: string
  serial: string
  supported: boolean
}

interface Counter {
  name: string
  addresses: number[]
  values: (number | null)[]
  reset_values: number[]
}

interface AgentMessage {
  type: string
  payload: any
  request_id?: string
}

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
})

async function checkRateLimit(env: Env, key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now()
  const windowKey = `ratelimit:${key}:${Math.floor(now / windowMs)}`
  const count = parseInt(await env.SESSIONS.get(windowKey) || '0')
  if (count >= limit) return false
  await env.SESSIONS.put(windowKey, String(count + 1), { expirationTtl: Math.ceil(windowMs / 1000) + 1 })
  return true
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const origin = request.headers.get('Origin') || env.FRONTEND_URL

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) })
    }

    // WebSocket upgrade pour agents
    if (url.pathname.startsWith('/ws/agent/')) {
      const agentId = url.pathname.split('/ws/agent/')[1]
      const stub = env.AGENT_WS.get(env.AGENT_WS.idFromName(agentId))
      return stub.fetch(request)
    }

    // API REST
    try {
      let response: Response

      if (url.pathname.startsWith('/api/agents/') && url.pathname.endsWith('/printers') && request.method === 'GET') {
        const agentId = url.pathname.split('/api/agents/')[1].split('/printers')[0]
        response = await handleGetPrinters(request, env, agentId)
      } else if (url.pathname === '/api/counters' && request.method === 'POST') {
        response = await handleReadCounters(request, env)
      } else if (url.pathname === '/api/reset' && request.method === 'POST') {
        response = await handleReset(request, env)
      } else if (url.pathname === '/api/agents/register' && request.method === 'POST') {
        response = await handleRegisterAgent(request, env)
      } else {
        response = new Response('Not Found', { status: 404 })
      }

      Object.entries(corsHeaders(origin)).forEach(([k, v]) => response.headers.set(k, v))
      return response
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
      })
    }
  }
} satisfies ExportedHandler<Env>

async function handleGetPrinters(request: Request, env: Env, agentId: string): Promise<Response> {
  if (!(await checkRateLimit(env, `printers:${agentId}`, 30, 60000))) {
    return Response.json({ error: 'Rate limited' }, { status: 429 })
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM agent_printers WHERE agent_id = ? ORDER BY discovered_at DESC'
  ).bind(agentId).all()

  return Response.json(results.map(r => ({
    vendor_id: r.vendor_id,
    product_id: r.product_id,
    model: r.model,
    serial: r.serial,
    supported: r.supported === 1
  })))
}

async function handleReadCounters(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { agent_id: string; product_id: string }
  const agentId = body.agent_id
  const productId = body.product_id

  if (!(await checkRateLimit(env, `counters:${agentId}`, 20, 60000))) {
    return Response.json({ error: 'Rate limited' }, { status: 429 })
  }

  const stub = env.AGENT_WS.get(env.AGENT_WS.idFromName(agentId))
  const response = await stub.fetch('https://internal/read_counters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: productId })
  })

  return response
}

async function handleReset(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { agent_id: string; product_id: string }
  const agentId = body.agent_id

  if (!(await checkRateLimit(env, `reset:${agentId}`, 5, 3600000))) {
    return Response.json({ error: 'Rate limited (max 5 resets/heure)' }, { status: 429 })
  }

  const stub = env.AGENT_WS.get(env.AGENT_WS.idFromName(agentId))
  const response = await stub.fetch('https://internal/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ product_id: body.product_id })
  })

  // Log pour analytics
  const result = await response.json()
  await env.DB.prepare(
    'INSERT INTO reset_logs (agent_id, product_id, success, created_at) VALUES (?, ?, ?, ?)'
  ).bind(agentId, body.product_id, result.success ? 1 : 0, new Date().toISOString()).run()

  return response
}

async function handleRegisterAgent(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { agent_id: string; os: string; version: string }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO agents (agent_id, os, version, last_seen, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(body.agent_id, body.os, body.version, new Date().toISOString(), new Date().toISOString()).run()

  return Response.json({ success: true })
}

export { AgentWebSocket };