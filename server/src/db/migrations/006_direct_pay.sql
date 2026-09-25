-- Paying straight into a Pact: the top-up carries the Pact it's for. The money still
-- passes through the payer's wallet in the ledger, in the same transaction.
ALTER TABLE topups ADD COLUMN pact_id UUID REFERENCES pacts(id);
