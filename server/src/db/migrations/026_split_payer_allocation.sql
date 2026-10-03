-- A payer who is also in a Split has an allocation (their own portion) but owes nobody: it is 'not_applicable', never 'settled'.
-- No settlement is faked for them.
ALTER TABLE split_shares DROP CONSTRAINT split_shares_status_check;
ALTER TABLE split_shares ADD CONSTRAINT split_shares_status_check CHECK (status IN ('not_applicable', 'owed', 'settled'));
UPDATE split_shares sh SET status = 'not_applicable', settled_at = NULL, settled_by = NULL
  FROM splits s WHERE s.id = sh.split_id AND sh.user_id = s.paid_by;
