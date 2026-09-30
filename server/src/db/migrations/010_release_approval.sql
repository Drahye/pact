-- With a co-organiser, releasing a Pact's pool to the organiser's wallet needs their
-- approval, like a large vendor payment. The request lives on the Pact until decided.
ALTER TABLE pacts ADD COLUMN release_requested_by UUID REFERENCES users(id);
ALTER TABLE pacts ADD COLUMN release_requested_at TIMESTAMPTZ;

ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer', 'release_requested'
));
