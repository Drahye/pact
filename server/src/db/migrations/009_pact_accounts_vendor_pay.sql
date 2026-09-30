-- Paying a Pact by plain bank transfer, and paying vendors straight from a Pact.
--
-- A Pact can have its own account number. Transfers into it land in the Pact's pool;
-- the sender is matched to a member by bank name, or shown as a named guest. Money
-- leaves the pool only to a verified vendor account (or back to a guest on a refund),
-- never through anyone's personal account.

-- A co-organiser approves large vendor payments. One per Pact.
ALTER TABLE pact_members DROP CONSTRAINT pact_members_role_check;
ALTER TABLE pact_members ADD CONSTRAINT pact_members_role_check CHECK (role IN ('organizer', 'co_organizer', 'member'));
CREATE UNIQUE INDEX pact_members_one_co_organizer ON pact_members (pact_id) WHERE role = 'co_organizer';

ALTER TABLE ledger_transactions DROP CONSTRAINT ledger_transactions_kind_check;
ALTER TABLE ledger_transactions ADD CONSTRAINT ledger_transactions_kind_check CHECK (kind IN (
  'topup', 'contribution', 'pact_release', 'withdrawal', 'withdrawal_reversal', 'refund', 'fee', 'adjustment',
  'bank_transfer_in', 'transfer_return', 'vendor_payment', 'vendor_payment_reversal', 'guest_refund', 'payout_settled'
));

ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer'
));

-- Money we received but can't place (a return with no known sender account, a failed
-- guest refund). Ops resolves these by hand; an alert is raised every time.
INSERT INTO accounts (kind, code, allow_negative) VALUES ('system', 'suspense', false);

CREATE TABLE pact_bank_accounts (
  pact_id         UUID PRIMARY KEY REFERENCES pacts(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  provider_ref    TEXT NOT NULL,
  account_number  TEXT NOT NULL UNIQUE,                     -- shared publicly by design
  bank_name       TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ
);

CREATE TABLE pact_transfers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id             UUID NOT NULL REFERENCES pacts(id),
  provider_ref        TEXT NOT NULL UNIQUE,                  -- a redelivered event is credited once
  amount              BIGINT NOT NULL CHECK (amount > 0),
  sender_name         TEXT NOT NULL CHECK (char_length(sender_name) BETWEEN 1 AND 100),
  sender_bank         TEXT,
  sender_account_enc  TEXT,                                  -- AES-256-GCM; needed to send money back
  sender_last4        TEXT,
  user_id             UUID REFERENCES users(id),             -- the member it counts for; null = guest
  matched_by          TEXT CHECK (matched_by IN ('name', 'organizer')),
  status              TEXT NOT NULL DEFAULT 'credited' CHECK (status IN ('credited', 'returned', 'refunded', 'held')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pact_transfers_pact_idx ON pact_transfers (pact_id, created_at);

-- Money leaving a Pact to a bank account: vendor payments, and money returned to guests.
CREATE TABLE pact_payouts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id             UUID NOT NULL REFERENCES pacts(id),
  reference           TEXT NOT NULL UNIQUE,
  kind                TEXT NOT NULL CHECK (kind IN ('vendor', 'guest_refund', 'transfer_return')),
  amount              BIGINT NOT NULL CHECK (amount > 0),
  fee                 BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),
  bank_code           TEXT,
  bank_name           TEXT NOT NULL,
  account_number_enc  TEXT NOT NULL,
  last4               TEXT NOT NULL,
  account_name        TEXT NOT NULL,
  purpose             TEXT CHECK (purpose IS NULL OR char_length(purpose) <= 80),
  budget_item_id      UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  transfer_id         UUID REFERENCES pact_transfers(id),
  status              TEXT NOT NULL CHECK (status IN ('awaiting_approval', 'pending', 'processing', 'succeeded', 'failed', 'rejected', 'cancelled')),
  requested_by        UUID REFERENCES users(id),
  decided_by          UUID REFERENCES users(id),
  decided_at          TIMESTAMPTZ,
  recipient_code      TEXT,
  provider_ref        TEXT,
  failure_reason      TEXT,
  receipt             BYTEA,                                 -- re-encoded WebP, metadata stripped
  receipt_bytes       INT CHECK (receipt_bytes IS NULL OR receipt_bytes BETWEEN 1 AND 2000000),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX pact_payouts_pact_idx ON pact_payouts (pact_id, created_at);
CREATE INDEX pact_payouts_open_idx ON pact_payouts (status) WHERE status IN ('awaiting_approval', 'pending', 'processing');

-- Row-level security: members see the account, the transfers and the payments (that is
-- the point: every naira is visible), but never account numbers or receipt bytes directly.
ALTER TABLE pact_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pact_payouts ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON pact_bank_accounts TO pact_app;
CREATE POLICY pact_bank_accounts_visible ON pact_bank_accounts FOR SELECT TO pact_app USING (can_see_pact(pact_id));

GRANT SELECT (id, pact_id, amount, sender_name, sender_bank, user_id, matched_by, status, created_at) ON pact_transfers TO pact_app;
CREATE POLICY pact_transfers_visible ON pact_transfers FOR SELECT TO pact_app USING (is_in_pact(pact_id));

GRANT SELECT (id, pact_id, kind, amount, fee, bank_name, last4, account_name, purpose, budget_item_id, status,
              requested_by, decided_by, decided_at, failure_reason, receipt_bytes, created_at, completed_at) ON pact_payouts TO pact_app;
CREATE POLICY pact_payouts_visible ON pact_payouts FOR SELECT TO pact_app USING (is_in_pact(pact_id));
