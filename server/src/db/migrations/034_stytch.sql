-- Stytch email OTP as the beta's email sign-in. Stytch proves who holds an address; PACT stays the account system.
-- A Stytch user is one more identity on a PACT user (provider 'stytch', subject = Stytch's stable user_id), never the account itself.

ALTER TABLE user_identities DROP CONSTRAINT user_identities_provider_check;
ALTER TABLE user_identities ADD CONSTRAINT user_identities_provider_check CHECK (provider IN ('google', 'email', 'phone', 'stytch'));

-- The code Stytch emailed is tied to a method_id that only the server holds: the browser sends an address and a code, never a Stytch
-- credential, so a client can never claim "Stytch said yes". Service-only.
CREATE TABLE stytch_email_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('login', 'link', 'pin_reset')),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  method_id    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX stytch_challenges_email_idx ON stytch_email_challenges (email, purpose, created_at DESC);
CREATE INDEX stytch_challenges_ip_idx ON stytch_email_challenges (ip, created_at DESC);
ALTER TABLE stytch_email_challenges ENABLE ROW LEVEL SECURITY;
