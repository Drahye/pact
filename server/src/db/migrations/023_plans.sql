-- Plans: the bridge between a lightweight idea and a serious Pact. A Plan answers "what are we actually trying to do together?"
-- It stays light on purpose (a title, maybe a date, a place, a rough budget, who is in, a few tasks, some linked questions) and
-- may later become one Pact, without ever disappearing: it stays as the social history behind it.
--
-- Additive only. Writes go through the service after it has checked who is asking (a Circle member, or someone holding the
-- Plan's share link for RSVPs); the app role may only read, and only inside Circles it has joined.

CREATE TABLE plans (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  category      TEXT NOT NULL DEFAULT 'event' CHECK (category IN ('birthday', 'trip', 'wedding', 'gift', 'event', 'dinner', 'household', 'fund', 'other')),
  description   TEXT CHECK (description IS NULL OR char_length(description) <= 280),
  date          DATE,
  end_date      DATE,
  location      TEXT CHECK (location IS NULL OR char_length(btrim(location)) BETWEEN 1 AND 80),
  rough_budget  BIGINT CHECK (rough_budget IS NULL OR rough_budget >= 0),
  status        TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'confirmed', 'done', 'cancelled')),
  created_by    UUID NOT NULL REFERENCES users(id),
  pact_id       UUID REFERENCES pacts(id) ON DELETE SET NULL,
  share_token   TEXT NOT NULL UNIQUE CHECK (char_length(share_token) >= 32),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR date IS NULL OR end_date >= date)
);
CREATE INDEX plans_circle_idx ON plans (circle_id, status, date);
-- One Pact per Plan, and one Plan per Pact.
CREATE UNIQUE INDEX plans_pact_once ON plans (pact_id) WHERE pact_id IS NOT NULL;

CREATE TABLE plan_rsvps (
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  status      TEXT NOT NULL CHECK (status IN ('in', 'maybe', 'out')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);

CREATE TABLE plan_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  assignee_id   UUID REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ
);
CREATE INDEX plan_tasks_plan_idx ON plan_tasks (plan_id, created_at);
CREATE INDEX plan_tasks_assignee_idx ON plan_tasks (assignee_id) WHERE status = 'open';

CREATE TABLE plan_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'rsvp', 'rsvp_changed', 'task_added', 'task_done', 'ask_linked', 'confirmed', 'done', 'cancelled', 'pact')),
  status      TEXT CHECK (status IN ('in', 'maybe', 'out')),
  detail      TEXT CHECK (detail IS NULL OR char_length(detail) <= 80),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX plan_activity_plan_idx ON plan_activity (plan_id, created_at DESC);

-- Tokens that used to work: an old link can say "no longer active" and reveal nothing.
CREATE TABLE plan_revoked_links (
  token       TEXT PRIMARY KEY CHECK (char_length(token) >= 32),
  plan_id     UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A question can belong to a Plan (linked, never copied), and a Pact can come from one.
ALTER TABLE asks ADD COLUMN plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;
CREATE INDEX asks_plan_idx ON asks (plan_id) WHERE plan_id IS NOT NULL;
ALTER TABLE pacts ADD COLUMN plan_id UUID REFERENCES plans(id) ON DELETE SET NULL;
CREATE INDEX pacts_plan_idx ON pacts (plan_id) WHERE plan_id IS NOT NULL;

-- Row-level security: members of the Circle may read; everything is written by the service.
CREATE FUNCTION is_in_plan_circle(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM plans x WHERE x.id = p AND is_in_circle(x.circle_id))
$$;
GRANT EXECUTE ON FUNCTION is_in_plan_circle(uuid) TO pact_app;
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_rsvps ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_revoked_links ENABLE ROW LEVEL SECURITY; -- service only
GRANT SELECT ON plans, plan_rsvps, plan_tasks, plan_activity TO pact_app;
CREATE POLICY plans_visible ON plans FOR SELECT TO pact_app USING (is_in_circle(circle_id));
CREATE POLICY plan_rsvps_visible ON plan_rsvps FOR SELECT TO pact_app USING (is_in_plan_circle(plan_id));
CREATE POLICY plan_tasks_visible ON plan_tasks FOR SELECT TO pact_app USING (is_in_plan_circle(plan_id));
CREATE POLICY plan_activity_visible ON plan_activity FOR SELECT TO pact_app USING (is_in_plan_circle(plan_id));

-- Events: a Plan's pseudonym lets the whole path (created, shared, RSVPs, questions, tasks, confirmed, Pact) be read as one.
ALTER TABLE product_events ADD COLUMN plan TEXT;
CREATE INDEX product_events_plan_idx ON product_events (plan, occurred_at) WHERE plan IS NOT NULL;
ALTER TABLE product_events DROP CONSTRAINT product_events_name_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_name_check CHECK (name IN (
  'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
  'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
  'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created',
  'pact_execution_started', 'pact_payment_completed', 'pact_outcome_completed',
  'pact_update_posted', 'activity_commented', 'activity_reacted', 'activity_pinned',
  'onboarding_started', 'onboarding_completed', 'onboarding_intent_selected', 'demo_pact_opened', 'demo_pact_completed_view',
  'first_pact_started', 'first_pact_created', 'first_invite_created', 'first_pact_joined',
  'pwa_install_started', 'pwa_install_completed',
  'circle_created', 'circle_joined', 'circle_invite_created', 'circle_invite_opened', 'circle_invite_shared', 'universal_create_opened',
  'ask_created', 'ask_shared', 'ask_opened', 'ask_response_started', 'ask_responded', 'ask_changed_response', 'ask_closed',
  'ask_shared_link_opened', 'ask_public_response_selected', 'ask_auth_started_from_share', 'ask_auth_completed_from_share',
  'ask_response_completed_from_share', 'circle_join_prompt_shown', 'circle_joined_from_ask', 'ask_reshared',
  'plan_created', 'plan_opened', 'plan_shared', 'plan_rsvp_submitted', 'plan_rsvp_changed', 'plan_task_created',
  'plan_task_completed', 'plan_ask_linked', 'plan_confirmed', 'plan_conversion_started', 'plan_converted_to_pact'
));
