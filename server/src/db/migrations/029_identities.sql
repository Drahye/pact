-- Sign-in identities. A user is one account; Google, email and phone are verified ways to reach it.
-- Staged and additive: users.phone stays as a compatibility mirror (still unique) while reads move onto this table.
-- Service-only: pact_app has no grant and RLS is on, so identities are never readable from a person-scoped request.

CREATE TABLE user_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL CHECK (provider IN ('google', 'email', 'phone')),
  -- google: the OIDC `sub`; email: the normalised address; phone: E.164. Never the Google email.
  provider_subject TEXT NOT NULL CHECK (char_length(provider_subject) BETWEEN 3 AND 320),
  email            TEXT,
  phone            TEXT,
  verified_at      TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject)
);
CREATE INDEX user_identities_user_idx ON user_identities (user_id);
ALTER TABLE user_identities ENABLE ROW LEVEL SECURITY;

-- Every real account was created by /auth/signup, which needs a signup token that only a successful phone OTP can mint, so each
-- existing phone was verified when the account was made. (The demo seed inserts fixtures directly; they sign in through the same OTP.)
-- Closed accounts have their number erased ('closed:<id>') and get no identity.
INSERT INTO user_identities (user_id, provider, provider_subject, phone, verified_at, created_at)
SELECT id, 'phone', phone, phone, created_at, created_at FROM users WHERE phone NOT LIKE 'closed:%' AND status <> 'closed';
