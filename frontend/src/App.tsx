import { useState, useEffect } from 'react'

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

type Status = 'idle' | 'loading' | 'resetting' | 'done' | 'error'

const API_BASE = import.meta.env.VITE_API_BASE || 'https://api.epson-reset.belloumi.com'

function App() {
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem('epson_agent_id') || '')
  const [printers, setPrinters] = useState<Printer[]>([])
  const [selected, setSelected] = useState<Printer | null>(null)
  const [counters, setCounters] = useState<Counter[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)

  useEffect(() => {
    if (!agentId) {
      const id = crypto.randomUUID()
      localStorage.setItem('epson_agent_id', id)
      setAgentId(id)
    }
    loadPrinters()
  }, [agentId])

  const api = (path: string, opts: RequestInit = {}) =>
    fetch(`${API_BASE}${path}`, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...opts.headers }
    })

  const loadPrinters = async () => {
    try {
      const res = await api(`/api/agents/${agentId}/printers`)
      if (res.ok) {
        setPrinters(await res.json())
        setToast(null)
      } else {
        setToast({ type: 'info', message: '⚠️ Agent local non connecté. Téléchargez et lancez l\'agent.' })
      }
    } catch {
      setToast({ type: 'error', message: '❌ Erreur de connexion à l\'API' })
    }
  }

  const readCounters = async (pid: number) => {
    setStatus('loading')
    setToast(null)
    try {
      const res = await api('/api/counters', {
        method: 'POST',
        body: JSON.stringify({ agent_id: agentId, product_id: `0x${pid.toString(16)}` })
      })
      const data = await res.json()
      if (res.ok) {
        setCounters(data.counters || [])
        setSelected(printers.find(p => p.product_id === pid) || null)
        setStatus('idle')
      } else {
        setStatus('error')
        setToast({ type: 'error', message: data.error || 'Erreur lecture compteurs' })
      }
    } catch {
      setStatus('error')
      setToast({ type: 'error', message: '❌ Erreur réseau' })
    }
  }

  const doReset = async () => {
    if (!selected) return
    setStatus('resetting')
    setToast(null)
    try {
      const res = await api('/api/reset', {
        method: 'POST',
        body: JSON.stringify({ agent_id: agentId, product_id: `0x${selected.product_id.toString(16)}` })
      })
      const data = await res.json()
      if (data.success) {
        setStatus('done')
        setToast({ type: 'success', message: '✅ Reset OK ! Éteignez l\'imprimante 10 secondes puis rallumez-la.' })
        await readCounters(selected.product_id)
      } else {
        setStatus('error')
        setToast({ type: 'error', message: data.error || '❌ Échec du reset' })
      }
    } catch {
      setStatus('error')
      setToast({ type: 'error', message: '❌ Erreur réseau' })
    }
  }

  const copyAgentId = () => {
    navigator.clipboard.writeText(agentId)
    setToast({ type: 'info', message: 'Agent ID copié dans le presse-papiers' })
  }

  return (
    <div className="container">
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 8 }}>🖨️ Epson Waste Ink Reset</h1>
        <p style={{ color: '#6b7280' }}>Remettez à zéro les compteurs d\'encre usagée gratuitement</p>
      </header>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'block', marginBottom: 4 }}>Votre Agent ID</label>
            <code style={{ fontSize: '1rem' }}>{agentId?.slice(0, 8)}…</code>
          </div>
          <button className="btn btn-secondary" onClick={copyAgentId}>Copier</button>
        </div>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 8 }}>
          Téléchargez l'agent local :{' '}
          <a href="/agent/epson-reset-agent-linux" className="underline">Linux</a> |{' '}
          <a href="/agent/epson-reset-agent-windows.exe" className="underline">Windows</a> |{' '}
          <a href="/agent/epson-reset-agent-macos" className="underline">macOS</a>
        </p>
      </div>

      {toast && (
        <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.message}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Imprimantes détectées</h2>
          <button className="btn btn-secondary" onClick={loadPrinters} disabled={status !== 'idle'}>Rafraîchir</button>
        </div>

        {printers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0', color: '#6b7280' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🔍</div>
            <p>Aucune imprimante trouvée</p>
            <p style={{ fontSize: '0.875rem', marginTop: 8 }}>
              • USB branché ? • Imprimante allumée ? • Agent lancé ?
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Modèle</th>
                  <th>VID:PID</th>
                  <th>Série</th>
                  <th>Support</th>
                  <th style={{ width: '140px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {printers.map(p => (
                  <tr key={`${p.vendor_id}:${p.product_id}`}>
                    <td>{p.model}</td>
                    <td><code>0x{p.vendor_id.toString(16)}:0x{p.product_id.toString(16)}</code></td>
                    <td><code>{p.serial || '—'}</code></td>
                    <td>
                      <span className={`badge ${p.supported ? 'badge-green' : 'badge-red'}`}>
                        {p.supported ? '✅ Supporté' : '❌ Non supporté'}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-primary"
                        disabled={!p.supported || status !== 'idle'}
                        onClick={() => readCounters(p.product_id)}
                        style={{ width: '100%' }}
                      >
                        {selected?.product_id === p.product_id ? '✓ Sélectionné' : 'Sélectionner'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && counters.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 16 }}>
            Compteurs d'encre usagée — {selected.model}
          </h2>

          {counters.map((c, i) => (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 12 }}>{c.name}</h3>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Adresse</th>
                      <th>Valeur actuelle</th>
                      <th>Après reset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.addresses.map((addr, idx) => (
                      <tr key={addr}>
                        <td><code>0x{addr.toString(16).toUpperCase().padStart(2, '0')}</code></td>
                        <td>
                          <code>
                            {c.values[idx] !== null
                              ? `0x${c.values[idx]!.toString(16).toUpperCase().padStart(2, '0')}`
                              : 'Erreur lecture'}
                          </code>
                        </td>
                        <td><code>0x{c.reset_values[idx].toString(16).toUpperCase().padStart(2, '0')}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          <button
            className={`btn btn-danger ${status === 'resetting' ? 'opacity-50' : ''}`}
            onClick={doReset}
            disabled={status !== 'idle'}
            style={{ width: '100%', padding: '14px', fontSize: '1.1rem' }}
          >
            {status === 'resetting' ? '⏳ Reset en cours…' : '♻️ RÉINITIALISER LES COMPTEURS'}
          </button>

          <p style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'center', marginTop: 12 }}>
            ⚠️ Après reset : éteindre l'imprimante 10 secondes, puis la rallumer.<br />
            Le tampon physique n'est <strong>PAS</strong> vidé — prévoyez son remplacement si saturé.
          </p>
        </div>
      )}
    </div>
  )
}

export default App