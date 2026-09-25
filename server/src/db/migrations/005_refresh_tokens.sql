-- Every refresh token a session has issued, so interrupted refreshes can be retried
-- briefly while real reuse (theft) is still caught, however many rotations old.
CREATE TABLE refresh_tokens (
  hash           TEXT PRIMARY KEY,
  session_id     UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  issued_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at  TIMESTAMPTZ
);
CREATE INDEX refresh_tokens_session_idx ON refresh_tokens (session_id);
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY; -- service only; pact_app has no grants

INSERT INTO refresh_tokens (hash, session_id, issued_at)
  SELECT refresh_hash, id, last_used_at FROM sessions WHERE revoked_at IS NULL;
