-- Funded is not finished. Reaching the target (status 'funded', funded_at) means the group has
-- the money. The Pact is COMPLETED when the organiser says the plan actually happened.
--
-- That is a separate fact from the money: completing does not move any, and releasing what is
-- left in the pool (status 'released') does not claim the outcome happened. So completion gets
-- its own timestamp rather than a new status, and every status, ledger rule and refund path
-- keeps working unchanged. A Pact that was already 'released' before this migration counts as
-- completed (it was the end of the old lifecycle), so nothing needs back-filling.
ALTER TABLE pacts ADD COLUMN completed_at TIMESTAMPTZ;
ALTER TABLE pacts ADD COLUMN completed_by UUID REFERENCES users(id);

ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer', 'release_requested', 'pledged', 'pledge_kept', 'ordered', 'orders_closed',
  'pact_completed'
));

-- Three execution events join the product funnel (see docs/ANALYTICS.md). 'pact_completed' keeps
-- its old meaning (the pool was released) so earlier numbers still line up.
ALTER TABLE product_events DROP CONSTRAINT product_events_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_name_check CHECK (name IN (
  'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
  'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
  'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created',
  'pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed'
));
