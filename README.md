# Epson Waste Ink Reset SaaS

Service gratuit pour réinitialiser les compteurs d'encre usagée des imprimantes Epson (L3110, L3150, L3250, etc.) via USB.

## Architecture

```
┌─────────────┐     HTTPS/WSS      ┌──────────────────┐
│  Frontend   │ ◄─────────────────► │   Cloudflare     │
│  (Pages)    │   API + WebSocket   │   Workers        │
└─────────────┘                     └────────┬─────────┘
                                              │
                    ┌─────────────────────────┼─────────────────────┐
                    ▼                         ▼                     ▼
            ┌──────────────┐         ┌──────────────┐       ┌──────────────┐
            │  D1 (SQLite) │         │     KV       │       │     R2       │
            │  (users,     │         │  (sessions,  │       │  (agent      │
            │   printers,  │         │   rate limit)│       │   binaries)  │
            │   logs)      │         └──────────────┘       └──────────────┘
            └──────────────┘
                                              │
                                              ▼
                                    ┌──────────────────┐
                                    │  Agent Local     │
                                    │  (Python)        │
                                    │  - USB access    │
                                    │  - epson-usb     │
                                    └──────────────────┘
```

## Composants

| Composant | Technologie | Déploiement |
|-----------|-------------|-------------|
| **Frontend** | React + Vite + TS | Cloudflare Pages |
| **API/WS** | Workers + Durable Objects | Cloudflare Workers |
| **Base de données** | D1 (SQLite) | Cloudflare D1 |
| **Cache/Sessions** | KV | Cloudflare KV |
| **Agent local** | Python + PyInstaller | GitHub Actions → R2 |

## Prérequis

- Compte Cloudflare (gratuit)
- Compte GitHub (gratuit)
- Node.js 18+ (pour frontend)
- Python 3.11+ (pour agent)

## Déploiement

### 1. Frontend → Cloudflare Pages

```bash
cd frontend
npm install
npm run build
# Connecter repo GitHub → Cloudflare Pages
# Build: npm run build | Output: dist
# Custom domain: epson-reset.votredomaine.com
```

### 2. Workers API

```bash
cd workers
npm install
# Créer ressources Cloudflare:
wrangler d1 create epson-reset-db
wrangler d1 execute epson-reset-db --file=schema.sql
wrangler kv:namespace create SESSIONS
# Mettre à jour wrangler.toml avec les IDs
wrangler deploy
# Custom domain: api.epson-reset.votredomaine.com
```

### 3. Agent builds (GitHub Actions)

```bash
# Les builds se font automatiquement à chaque push sur main
# Les artefacts sont uploadés en tant qu'artifacts GitHub
# Pour release: créer un tag (ex: v1.0.0) → release auto avec binaires
```

## Utilisation

1. **Utilisateur** va sur `https://epson-reset.votredomaine.com`
2. **Génère** son Agent ID (copié dans presse-papiers)
3. **Télécharge** l'agent pour son OS (Linux/Windows/macOS)
4. **Lance** l'agent: `./epson-reset-agent-linux --backend wss://api.epson-reset.votredomaine.com`
4. **Sélectionne** son imprimante dans l'interface web
5. **Lit** les compteurs → **Reset** → **Power cycle** imprimante (10s off)

## Modèles supportés

- L3110 / L3150 / L3160 / L5190 (clés: rkey=0x0797, wkey=Nbsjcbzb)
- L3210 / L3250 / L3260 (clés: rkey=0x364A, wkey=Nbsjcbzb)
- Extensible via base de données modèles

## Coûts

**0€/mois** - Tout sur Free Tier Cloudflare :
- Pages: illimité
- Workers: 100k req/jour
- D1: 5 GB
- KV: 100k lectures/jour
- R2: 10 GB
- GitHub Actions: 2000 min/mois

## Développement local

```bash
# Frontend
cd frontend && npm run dev

# Workers
cd workers && wrangler dev

# Agent
cd agent && pip install -r requirements.txt
python main.py --backend wss://localhost:8787
```

## Licence

MIT