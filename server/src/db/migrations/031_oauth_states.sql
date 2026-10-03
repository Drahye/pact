-- Google sign-in in flight. One row per attempt: the state (hashed), the OIDC nonce, the PKCE verifier (encrypted), where to send the
-- person afterwards (validated when the attempt starts), and whether it is a sign-in or a link for a signed-in user. Single use, short
-- lived, service-only. No Google token is ever stored.

CREATE TABLE oauth_states (
  state_hash   TEXT PRIMARY KEY,
  nonce        TEXT NOT NULL,
  verifier_enc TEXT NOT NULL,
  mode         TEXT NOT NULL CHECK (mode IN ('signin', 'link')),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  return_to    TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((mode = 'link') = (user_id IS NOT NULL))
);
CREATE INDEX oauth_states_expiry_idx ON oauth_states (expires_at);
ALTER TABLE oauth_states ENABLE ROW LEVEL SECURITY;
