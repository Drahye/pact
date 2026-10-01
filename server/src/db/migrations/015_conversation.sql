-- Conversation around meaningful activity, not a chat app.
--
-- History stays authoritative: system activity (contributions, payments, tasks...) is only ever
-- appended to, and nothing here can change it. Conversation is attached to it:
--   * comments and reactions belong to one activity item;
--   * an organiser's update is a manual item in the same activity stream (an `activities` row of
--     type 'update' pointing at a pact_updates row that holds its text), so it can be discussed,
--     reacted to and pinned exactly like automatic activity;
--   * one pinned item per Pact lives on the Pact. Pinning replaces, never deletes.
-- All of it is written by the service after it has checked membership; the app role may only read,
-- and only within Pacts the person has joined (is_in_pact).

CREATE TABLE pact_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id     UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX pact_updates_pact_idx ON pact_updates (pact_id, created_at DESC);

ALTER TABLE activities ADD COLUMN update_id UUID REFERENCES pact_updates(id) ON DELETE CASCADE;
ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added',
  'guest_contribution', 'vendor_paid', 'co_organizer', 'release_requested', 'pledged', 'pledge_kept', 'ordered', 'orders_closed',
  'pact_completed', 'update'
));
-- An update row and its stream item always go together.
ALTER TABLE activities ADD CONSTRAINT activities_update_link CHECK ((type = 'update') = (update_id IS NOT NULL));

CREATE TABLE activity_comments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id      UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  activity_id  UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  body         TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX activity_comments_item_idx ON activity_comments (activity_id, created_at);

-- A small fixed set. One of each kind per person per item, so a duplicate tap is a no-op.
CREATE TABLE activity_reactions (
  pact_id      UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  activity_id  UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  reaction     TEXT NOT NULL CHECK (reaction IN ('thumbs_up', 'heart', 'celebrate', 'raised_hands')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (activity_id, user_id, reaction)
);

-- One pinned item per Pact. If the item disappears the pin clears itself.
ALTER TABLE pacts ADD COLUMN pinned_activity_id UUID REFERENCES activities(id) ON DELETE SET NULL;
ALTER TABLE pacts ADD COLUMN pinned_by UUID REFERENCES users(id);
ALTER TABLE pacts ADD COLUMN pinned_at TIMESTAMPTZ;

-- Several comments on one thread become one notification instead of a pile.
ALTER TABLE notifications ADD COLUMN ref_id UUID;
CREATE INDEX notifications_ref_idx ON notifications (user_id, type, ref_id) WHERE read_at IS NULL;

ALTER TABLE pact_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_reactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON pact_updates, activity_comments, activity_reactions TO pact_app;
CREATE POLICY pact_updates_visible ON pact_updates FOR SELECT TO pact_app USING (is_in_pact(pact_id));
CREATE POLICY activity_comments_visible ON activity_comments FOR SELECT TO pact_app USING (is_in_pact(pact_id));
CREATE POLICY activity_reactions_visible ON activity_reactions FOR SELECT TO pact_app USING (is_in_pact(pact_id));

ALTER TABLE product_events DROP CONSTRAINT product_events_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_name_check CHECK (name IN (
  'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
  'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
  'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created',
  'pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed',
  'pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned'
));
