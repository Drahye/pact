-- Security hardening: purpose-bound OTPs, PIN reset with a withdrawal hold, account closure.

ALTER TABLE otp_challenges ADD COLUMN purpose TEXT NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'pin_reset'));
DROP INDEX IF EXISTS otp_phone_created_idx;
CREATE INDEX otp_phone_purpose_idx ON otp_challenges (phone, purpose, created_at DESC);

-- After a PIN reset, withdrawals and bank changes pause for 24 hours: a stolen phone
-- plus a reset shouldn't empty the wallet before the owner notices.
ALTER TABLE users ADD COLUMN pin_reset_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN closed_at TIMESTAMPTZ;

-- Audit rows are append-only, like the ledger.
CREATE FUNCTION audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit log is append-only'; END $$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_immutable();
