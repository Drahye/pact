-- Per-IP HTTP rate limit counters, shared by every API instance. Fixed windows; rows
-- expire and are swept by the worker. UNLOGGED: losing counters in a crash is fine,
-- and skipping the WAL keeps one write per request cheap.
CREATE UNLOGGED TABLE http_rate_limits (
  key          TEXT NOT NULL,
  window_start BIGINT NOT NULL,
  hits         INT NOT NULL DEFAULT 1,
  expires_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (key, window_start)
);
CREATE INDEX http_rate_limits_expiry_idx ON http_rate_limits (expires_at);

-- Platform table: no access for pact_app.
ALTER TABLE http_rate_limits ENABLE ROW LEVEL SECURITY;
