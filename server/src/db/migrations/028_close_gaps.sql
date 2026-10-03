-- Post-audit: a removed Circle member stays removed (the invite link no longer lets them back in), and a Plan whose Pact was
-- called off says so. Additive: one nullable column, and the Plan activity kinds widen.

ALTER TABLE circle_members ADD COLUMN removed_at TIMESTAMPTZ;

ALTER TABLE plan_activity DROP CONSTRAINT plan_activity_kind_check;
ALTER TABLE plan_activity ADD CONSTRAINT plan_activity_kind_check CHECK (kind IN (
  'created', 'rsvp', 'rsvp_changed', 'task_added', 'task_done', 'ask_linked', 'confirmed', 'done', 'cancelled', 'pact',
  'date_changed', 'location_changed', 'pact_closed'
));
