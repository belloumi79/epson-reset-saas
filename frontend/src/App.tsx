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

// Modèles Epson supportés avec leurs séries
const SUPPORTED_MODELS = [
  { series: 'L3110 / L3150 / L3160 / L5190', models: ['L3110', 'L3150', 'L3160', 'L5190'], status: '✅ Testé' },
  { series: 'L3210 / L3250 / L3260', models: ['L3210', 'L3250', 'L3260'], status: '✅ Testé' },
  { series: 'L120 / L130 / L220 / L310 / L360 / L365 / L565', models: ['L120', 'L130', 'L220', 'L310', 'L360', 'L365', 'L565'], status: '✅ Configuré' },
  { series: 'L210 / L350 / L355', models: ['L210', 'L350', 'L355'], status: '✅ Configuré' },
  { series: 'L375 / L380 / L385 / L395 / L405', models: ['L375', 'L380', 'L385', 'L395', 'L405'], status: '✅ Configuré' },
  { series: 'L455 / L475 / L495 / L575', models: ['L455', 'L475', 'L495', 'L575'], status: '✅ Configuré' },
  { series: 'L396 (compteurs étendus)', models: ['L396'], status: '✅ Configuré' },
  { series: 'L1300 (A3+)', models: ['L1300'], status: '✅ Configuré' },
  { series: 'Autres séries Lxxx', models: ['Voir liste complète sur GitHub'], status: '🔧 Configurable' },
]

const STEPS = [
  { 
    number: 1, 
    title: 'Vérifier la compatibilité', 
    desc: 'Votre modèle Epson doit apparaître dans la liste ci-dessous. Si ce n\'est pas le cas, l\'agent tentera quand même la détection automatique.' 
  },
  { 
    number: 2, 
    title: 'Télécharger l\'agent', 
    desc: 'Cliquez sur le lien correspondant à votre système (Linux, Windows, macOS). L\'agent est un fichier unique, sans installation.' 
  },
  { 
    number: 3, 
    title: 'Brancher l\'imprimante', 
    desc: 'Connectez l\'imprimante en USB (câble fourni), allumez-la. Fermez les autres logiciels d\'impression (CUPS, EPSON Software).' 
  },
  { 
    number: 4, 
    title: 'Lancer l\'agent', 
    desc: 'Ouvrez un terminal et lancez : <code>./epson-reset-agent-linux --backend wss://api.epson-reset.belloumi.com</code> (adaptez selon votre OS).' 
  },
  { 
    number: 5, 
    title: 'Sélectionner l\'imprimante', 
    desc: 'Revenez sur cette page, votre imprimante apparaîtra dans le tableau. Cliquez sur "Sélectionner".' 
  },
  { 
    number: 6, 
    title: 'Lire les compteurs', 
    desc: 'Les valeurs actuelles des tampons (Main pad, Platen pad) s\'affichent. Vérifiez qu\'elles sont élevées (proches de la saturation).' 
  },
  { 
    number: 7, 
    title: 'Réinitialiser', 
    desc: 'Cliquez sur "♻️ RÉINITIALISER". L\'agent écrit les valeurs zéro dans l\'EEPROM de l\'imprimante.' 
  },
  { 
    number: 8, 
    title: 'Power cycle obligatoire', 
    desc: '<strong>Éteignez l\'imprimante 10 secondes minimum, puis rallumez-la.</strong> Le clignotement orange doit cesser.' 
  },
]

function App() {
  const [agentId, setAgentId] = useState<string>(() => localStorage.getItem('epson_agent_id') || '')
  const [printers, setPrinters] = useState<Printer[]>([])
  const [selected, setSelected] = useState<Printer | null>(null)
  const [counters, setCounters] = useState<Counter[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null)
  const [showModels, setShowModels] = useState(false)
  const [showSteps, setShowSteps] = useState(true)

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
        <p style={{ color: '#6b7280' }}>Remettez à zéro les compteurs d\'encre usagée gratuitement — Open Source, sans clé d\'activation</p>
      </header>

      {/* ÉTAPES */}
      <details className="card" open={showSteps} onToggle={() => setShowSteps(!showSteps)}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.3rem' }}>📋</span>
          Étapes à suivre (cliquez pour masquer/afficher)
        </summary>
        <div style={{ marginTop: 16 }}>
          <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
            {STEPS.map((step) => (
              <li key={step.number} style={{ marginBottom: 16, paddingLeft: 8 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{ 
                    background: '#2563eb', color: 'white', 
                    width: 28, height: 28, borderRadius: '50%', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: '0.9rem', flexShrink: 0
                  }}>
                    {step.number}
                  </span>
                  <div>
                    <strong style={{ fontSize: '1rem' }}>{step.title}</strong>
                    <div dangerouslySetInnerHTML={{ __html: step.desc }} style={{ marginTop: 4, color: '#4b5563', fontSize: '0.95rem' }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 16, padding: 12, background: '#fef3c7', borderRadius: 8, border: '1px solid #f59e0b' }}>
            <strong>⚠️ Important :</strong> Le reset logiciel ne vide <strong>PAS</strong> le tampon physique. 
            Si l\'éponge est saturée, l\'encre fuira par le bas. Prévoyez le remplacement du tampon ou l\'installation d\'un bac externe.
          </div>
        </div>
      </details>

      {/* MODÈLES SUPPORTÉS */}
      <details className="card" open={showModels} onToggle={() => setShowModels(!showModels)}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.3rem' }}>🖨️</span>
          Modèles Epson supportés (cliquez pour masquer/afficher) — {SUPPORTED_MODELS.length} séries
        </summary>
        <div style={{ marginTop: 16 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Série / Famille</th>
                  <th style={{ textAlign: 'left', padding: '10px' }}>Modèles inclus</th>
                  <th style={{ textAlign: 'center', padding: '10px' }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {SUPPORTED_MODELS.map((s) => (
                  <tr key={s.series} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '10px', fontWeight: 500 }}>{s.series}</td>
                    <td style={{ padding: '10px', color: '#4b5563' }}>
                      {s.models.map((m, j) => (
                        <span key={j} style={{ 
                          display: 'inline-block', background: '#e5e7eb', 
                          padding: '2px 8px', borderRadius: 4, margin: '2px', fontSize: '0.8rem' 
                        }}>
                          {m}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>{s.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#6b7280' }}>
            📌 <strong>Votre modèle n\'est pas dans la liste ?</strong> L\'agent tente la détection automatique via l\'USB. 
            Si le reset échoue, ouvrez une issue sur <a href="https://github.com/belloumi79/epson-reset-saas/issues" target="_blank" rel="noopener" className="underline">GitHub</a> avec votre VID:PID (ex: 04b8:1142).
          </p>
        </div>
      </details>

      {/* AGENT ID & DOWNLOADS */}
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

      {/* IMPRIMANTES DÉTECTÉES */}
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
            <button onClick={loadPrinters} className="mt-4 btn btn-primary" disabled={status !== 'idle'}>Rafraîchir</button>
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

      {/* COMPTEURS & RESET */}
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

      {/* FOOTER INFO */}
      <div style={{ marginTop: 24, padding: 16, background: '#f9fafb', borderRadius: 8, textAlign: 'center', fontSize: '0.85rem', color: '#6b7280' }}>
        <p>Open Source • <a href="https://github.com/belloumi79/epson-reset-saas" target="_blank" rel="noopener" className="underline">Code sur GitHub</a> • 
        Basé sur <a href="https://codeberg.org/atufi/reinkpy" target="_blank" rel="noopener" className="underline">reinkpy</a> & 
        <a href="https://github.com/onur-kesim/epson-usb" target="_blank" rel="noopener" className="underline">epson-usb</a></p>
      </div>
    </div>
  )
}

export default App