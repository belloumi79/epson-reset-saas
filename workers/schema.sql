-- Schema D1 pour epson-reset-saas
-- Appliquer: wrangler d1 execute epson-reset-db --file=schema.sql

CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  os TEXT,
  version TEXT,
  connected INTEGER DEFAULT 0,
  last_seen TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  vendor_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  model TEXT,
  serial TEXT,
  supported INTEGER DEFAULT 1,
  discovered_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
);

CREATE TABLE IF NOT EXISTS reset_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_printers_agent ON agent_printers(agent_id);
CREATE INDEX IF NOT EXISTS idx_reset_logs_agent ON reset_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_reset_logs_date ON reset_logs(created_at);