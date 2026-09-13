CREATE TABLE IF NOT EXISTS ops_counters (key TEXT PRIMARY KEY, value INTEGER NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ops_leases (id TEXT PRIMARY KEY, client_key TEXT NOT NULL, expires_at INTEGER NOT NULL, outbound INTEGER NOT NULL DEFAULT 0, token TEXT);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ops_leases_expiry ON ops_leases(expires_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ops_leases_client ON ops_leases(client_key);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ops_metrics (bucket INTEGER PRIMARY KEY, requests INTEGER NOT NULL DEFAULT 0, errors INTEGER NOT NULL DEFAULT 0, limited INTEGER NOT NULL DEFAULT 0, duration_ms INTEGER NOT NULL DEFAULT 0, max_duration_ms INTEGER NOT NULL DEFAULT 0);
