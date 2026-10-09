// No request text, URLs, IP addresses or resident account identifiers enter D1.
export const operationsSchema = [
  `CREATE TABLE IF NOT EXISTS ops_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ops_leases (id TEXT PRIMARY KEY, client_key TEXT NOT NULL, expires_at INTEGER NOT NULL, outbound INTEGER NOT NULL DEFAULT 0, token TEXT)`,
  `CREATE INDEX IF NOT EXISTS ops_leases_expiry ON ops_leases(expires_at)`,
  `CREATE INDEX IF NOT EXISTS ops_leases_client ON ops_leases(client_key)`,
  `CREATE TABLE IF NOT EXISTS ops_ai_leases (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ops_ai_leases_expiry ON ops_ai_leases(expires_at)`,
  `CREATE TABLE IF NOT EXISTS ops_ai_circuit (key TEXT PRIMARY KEY, expires_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ops_ai_metrics (bucket INTEGER PRIMARY KEY, succeeded INTEGER NOT NULL DEFAULT 0, failed INTEGER NOT NULL DEFAULT 0, rejected INTEGER NOT NULL DEFAULT 0, provider_quota INTEGER NOT NULL DEFAULT 0, timeouts INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS ops_metrics (bucket INTEGER PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, limited INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, max_duration_ms INTEGER NOT NULL DEFAULT 0)`,
];
