-- PACT schema v1
-- Money is stored as BIGINT kobo (1 naira = 100 kobo). Never floats.
-- Balances only change through ledger_transactions + ledger_entries (double entry).

-- ---------------------------------------------------------------------------
-- People and access
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               TEXT NOT NULL UNIQUE,                 -- E.164, e.g. +2348012345678
  first_name          TEXT NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 40),
  last_name           TEXT NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 40),
  color               TEXT NOT NULL,                        -- identity colour in rings and bars
  tint                TEXT NOT NULL DEFAULT 'mint',
  photo_url           TEXT,
  pin_hash            TEXT,                                 -- scrypt, null until set
  pin_failed_attempts INT NOT NULL DEFAULT 0,
  pin_locked_until    TIMESTAMPTZ,
  kyc_tier            SMALLINT NOT NULL DEFAULT 1 CHECK (kyc_tier BETWEEN 1 AND 3),
  bvn_hash            TEXT UNIQUE,                          -- keyed hash: one identity per account
  bvn_last4           TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  referral_code       TEXT NOT NULL UNIQUE,
  referred_by         UUID REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_challenges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone        TEXT NOT NULL,
  code_hash    TEXT NOT NULL,
  attempts     INT NOT NULL DEFAULT 0,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  ip           TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_phone_created_idx ON otp_challenges (phone, created_at DESC);

CREATE TABLE sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash      TEXT NOT NULL UNIQUE,                   -- rotated on every refresh
  prev_refresh_hash TEXT,                                   -- presenting this again = token theft: session is revoked
  device            TEXT NOT NULL DEFAULT 'Unknown device',
  ip                TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;
CREATE INDEX sessions_prev_idx ON sessions (prev_refresh_hash);

-- ---------------------------------------------------------------------------
-- Ledger
-- ---------------------------------------------------------------------------
CREATE TABLE accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('user_wallet', 'pact_pool', 'system')),
  owner_id        UUID,                                     -- user id or pact id; null for system
  code            TEXT UNIQUE,                              -- system accounts: 'provider_clearing', 'fee_revenue', 'payout_clearing'
  currency        TEXT NOT NULL DEFAULT 'NGN',
  balance         BIGINT NOT NULL DEFAULT 0,
  allow_negative  BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT balance_not_negative CHECK (allow_negative OR balance >= 0),
  CONSTRAINT one_account_per_owner UNIQUE (kind, owner_id)
);

CREATE TABLE ledger_transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         TEXT NOT NULL CHECK (kind IN ('topup', 'contribution', 'pact_release', 'withdrawal', 'withdrawal_reversal', 'refund', 'fee', 'adjustment')),
  reference    TEXT NOT NULL UNIQUE,                        -- idempotency at the money layer
  description  TEXT NOT NULL,
  user_id      UUID REFERENCES users(id),                   -- who initiated it
  pact_id      UUID,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_tx_pact_idx ON ledger_transactions (pact_id, created_at DESC);

CREATE TABLE ledger_entries (
  id              BIGSERIAL PRIMARY KEY,
  transaction_id  UUID NOT NULL REFERENCES ledger_transactions(id),
  account_id      UUID NOT NULL REFERENCES accounts(id),
  amount          BIGINT NOT NULL CHECK (amount <> 0),       -- + credit, - debit
  balance_after   BIGINT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ledger_entries_account_idx ON ledger_entries (account_id, id DESC);
CREATE INDEX ledger_entries_tx_idx ON ledger_entries (transaction_id);

-- Every transaction must balance to zero. Checked at commit so multi-entry
-- postings can be inserted one row at a time.
CREATE FUNCTION ledger_assert_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total BIGINT; n INT;
BEGIN
  SELECT COALESCE(SUM(amount), 0), COUNT(*) INTO total, n FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
  IF total <> 0 OR n < 2 THEN
    RAISE EXCEPTION 'Unbalanced ledger transaction % (sum %, entries %)', NEW.transaction_id, total, n;
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION ledger_assert_balanced();

-- Entries are append-only.
CREATE FUNCTION ledger_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ledger entries are append-only'; END $$;
CREATE TRIGGER ledger_entries_no_update BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION ledger_immutable();

-- ---------------------------------------------------------------------------
-- Pacts
-- ---------------------------------------------------------------------------
CREATE TABLE pacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT NOT NULL UNIQUE,
  invite_code       TEXT NOT NULL UNIQUE,
  title             TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 60),
  note              TEXT CHECK (note IS NULL OR char_length(note) <= 280),
  category          TEXT NOT NULL,
  target_amount     BIGINT NOT NULL CHECK (target_amount >= 100000),     -- at least ₦1,000
  deadline          DATE NOT NULL,
  organizer_id      UUID NOT NULL REFERENCES users(id),
  account_id        UUID NOT NULL REFERENCES accounts(id),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'funded', 'released', 'refunded', 'cancelled')),
  -- What happens if the deadline passes before the goal is met.
  missed_goal_policy TEXT NOT NULL DEFAULT 'refund' CHECK (missed_goal_policy IN ('refund', 'release')),
  split_mode        TEXT NOT NULL DEFAULT 'flexible' CHECK (split_mode IN ('flexible', 'equal')),
  raised_amount     BIGINT NOT NULL DEFAULT 0,               -- lifetime contributions, mirrors the pool
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  funded_at         TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ
);
CREATE INDEX pacts_status_deadline_idx ON pacts (status, deadline);

CREATE TABLE pact_members (
  pact_id       UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('organizer', 'member')),
  status        TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('invited', 'joined', 'left')),
  contributed   BIGINT NOT NULL DEFAULT 0,
  invited_by    UUID REFERENCES users(id),
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_nudged_at TIMESTAMPTZ,
  PRIMARY KEY (pact_id, user_id)
);
CREATE INDEX pact_members_user_idx ON pact_members (user_id, status);

-- Invites to phone numbers that are not on PACT yet; claimed at sign up.
CREATE TABLE pact_phone_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id     UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  phone       TEXT NOT NULL,
  invited_by  UUID NOT NULL REFERENCES users(id),
  claimed_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (pact_id, phone)
);
CREATE INDEX pact_phone_invites_phone_idx ON pact_phone_invites (phone) WHERE claimed_at IS NULL;

CREATE TABLE activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id     UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES users(id),
  type        TEXT NOT NULL CHECK (type IN ('created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left')),
  amount      BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activities_pact_idx ON activities (pact_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Money in and out
-- ---------------------------------------------------------------------------
CREATE TABLE topups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  reference     TEXT NOT NULL UNIQUE,
  provider      TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('card', 'bank_transfer')),
  amount        BIGINT NOT NULL CHECK (amount > 0),         -- credited to the wallet
  fee           BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0), -- charged on top
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'abandoned')),
  checkout_url  TEXT,
  failure_reason TEXT,
  ledger_tx_id  UUID REFERENCES ledger_transactions(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX topups_user_idx ON topups (user_id, created_at DESC);

CREATE TABLE bank_accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bank_code          TEXT NOT NULL,
  bank_name          TEXT NOT NULL,
  account_number_enc TEXT NOT NULL,                         -- AES-256-GCM
  account_number_hash TEXT NOT NULL,                        -- for duplicate detection
  last4              TEXT NOT NULL,
  account_name       TEXT NOT NULL,
  recipient_code     TEXT,                                  -- provider transfer recipient
  is_default         BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ,
  UNIQUE (user_id, account_number_hash, bank_code)
);

CREATE TABLE withdrawals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  bank_account_id UUID NOT NULL REFERENCES bank_accounts(id),
  reference       TEXT NOT NULL UNIQUE,
  amount          BIGINT NOT NULL CHECK (amount > 0),
  fee             BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  provider_ref    TEXT,
  failure_reason  TEXT,
  ledger_tx_id    UUID REFERENCES ledger_transactions(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX withdrawals_user_idx ON withdrawals (user_id, created_at DESC);

CREATE TABLE webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL,
  event_key    TEXT NOT NULL,                               -- provider event + reference: deduplicates redelivery
  event_type   TEXT NOT NULL,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error        TEXT,
  UNIQUE (provider, event_key)
);

-- ---------------------------------------------------------------------------
-- Platform
-- ---------------------------------------------------------------------------
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  pact_id     UUID,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE idempotency_keys (
  user_id        UUID NOT NULL,
  key            TEXT NOT NULL,
  route          TEXT NOT NULL,
  request_hash   TEXT NOT NULL,
  status_code    INT,
  response       JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE audit_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_id    UUID,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  ip          TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_actor_idx ON audit_log (actor_id, created_at DESC);

-- Transactional outbox / job queue, drained with SELECT ... FOR UPDATE SKIP LOCKED
-- so any number of workers can run side by side.
CREATE TABLE jobs (
  id          BIGSERIAL PRIMARY KEY,
  type        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key  TEXT UNIQUE,
  run_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts    INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 8,
  locked_until TIMESTAMPTZ,
  last_error  TEXT,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE done_at IS NULL;

-- System accounts
INSERT INTO accounts (kind, code, allow_negative) VALUES
  ('system', 'provider_clearing', true),   -- money held at the payment provider / partner bank
  ('system', 'payout_clearing', true),     -- money in flight to customers' banks
  ('system', 'fee_revenue', false);        -- PACT's fee income
