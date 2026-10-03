-- Passwordless email sign-in. Codes are keyed hashes, never stored raw; separate from the SMS table because the key is an address,
-- and because link / pin_reset challenges are bound to a signed-in user. Service-only.
-- Also: an account no longer needs a phone number (Google and email accounts have none until one is verified).

CREATE TABLE email_otp_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL,
  purpose      TEXT NOT NULL CHECK (purpose IN ('login', 'link', 'pin_reset')),
  user_id      UUID REFERENCES users(id) ON DELETE CASCADE,
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX email_otp_email_idx ON email_otp_challenges (email, purpose, created_at DESC);
CREATE INDEX email_otp_ip_idx ON email_otp_challenges (ip, created_at DESC);
ALTER TABLE email_otp_challenges ENABLE ROW LEVEL SECURITY;

ALTER TABLE users ALTER COLUMN phone DROP NOT NULL; -- stays UNIQUE: NULLs do not collide
