-- Pledges: "I'll pay ₦20,000 by Friday". PACT reminds the person on the day and once the
-- day after, then stops; the organiser sees who is on track and who is late, without
-- having to chase anyone. A pledge is kept once the person's total paid into the Pact
-- reaches `goal_total`, whichever way they paid (wallet, card, bank transfer).
CREATE TABLE pact_pledges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id     UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      BIGINT NOT NULL CHECK (amount > 0),        -- what they said they'd add
  goal_total  BIGINT NOT NULL CHECK (goal_total > 0),     -- their contributed total once kept
  due_on      DATE NOT NULL,
  source      TEXT NOT NULL DEFAULT 'member' CHECK (source IN ('member', 'orders')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'kept', 'cancelled', 'closed')),
  reminders   INT NOT NULL DEFAULT 0,
  kept_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pact_pledges_one_open ON pact_pledges (pact_id, user_id) WHERE status = 'open';
CREATE INDEX pact_pledges_due_idx ON pact_pledges (due_on) WHERE status = 'open';

ALTER TABLE pact_pledges ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON pact_pledges TO pact_app;
CREATE POLICY pact_pledges_visible ON pact_pledges FOR SELECT TO pact_app USING (is_in_pact(pact_id));

ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer', 'release_requested', 'pledged', 'pledge_kept'
));
