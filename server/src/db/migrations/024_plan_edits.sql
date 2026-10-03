-- Plans, part two: the organiser can close RSVPs, and meaningful edits (a new date, a new place) are remembered.
-- Additive: one column, and the activity kinds widen.

ALTER TABLE plans ADD COLUMN rsvp_open BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE plan_activity DROP CONSTRAINT plan_activity_kind_check;
ALTER TABLE plan_activity ADD CONSTRAINT plan_activity_kind_check CHECK (kind IN (
  'created', 'rsvp', 'rsvp_changed', 'task_added', 'task_done', 'ask_linked', 'confirmed', 'done', 'cancelled', 'pact',
  'date_changed', 'location_changed'
));
