-- Ask the group: a quick question inside a Circle. Two kinds: a choice between 2 to 6 options, and "Who's in?".
--
-- Additive only. Writes go through the service after it has checked who is asking (a Circle member, or someone holding
-- the Ask's share link); the app role may only read, and only inside Circles it has joined. There is no guest identity:
-- a durable response always belongs to a signed-in person, one response per person per Ask.
--   asks            the question, its kind, open/closed, and a revocable 32-byte share token
--   ask_options     the choices (choice Asks only)
--   ask_responses   one row per person per Ask: the chosen option, or in / maybe / out
--   ask_activity    the small log behind "Sarah changed her vote" (no chat, no text)

CREATE TABLE asks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id          UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  type               TEXT NOT NULL CHECK (type IN ('choice', 'attendance')),
  title              TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  created_by         UUID NOT NULL REFERENCES users(id),
  status             TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  share_token        TEXT NOT NULL UNIQUE CHECK (char_length(share_token) >= 32),
  share_revoked_at   TIMESTAMPTZ,
  closes_at          TIMESTAMPTZ,
  closed_at          TIMESTAMPTZ,
  closed_by          UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX asks_circle_idx ON asks (circle_id, status, created_at DESC);

CREATE TABLE ask_options (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id    UUID NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  label     TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  position  INT NOT NULL CHECK (position BETWEEN 0 AND 5),
  UNIQUE (ask_id, position)
);

CREATE TABLE ask_responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id      UUID NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  option_id   UUID REFERENCES ask_options(id) ON DELETE CASCADE,
  attendance  TEXT CHECK (attendance IN ('in', 'maybe', 'out')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A person answers once; changing it updates the same row.
  UNIQUE (ask_id, user_id),
  CHECK ((option_id IS NOT NULL) <> (attendance IS NOT NULL))
);
CREATE INDEX ask_responses_option_idx ON ask_responses (option_id) WHERE option_id IS NOT NULL;

CREATE TABLE ask_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ask_id      UUID NOT NULL REFERENCES asks(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('responded', 'changed', 'closed')),
  option_id   UUID REFERENCES ask_options(id) ON DELETE SET NULL,
  attendance  TEXT CHECK (attendance IN ('in', 'maybe', 'out')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ask_activity_ask_idx ON ask_activity (ask_id, created_at DESC);

-- Row-level security: members of the Circle may read; everything is written by the service.
CREATE FUNCTION is_in_ask_circle(a uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM asks k WHERE k.id = a AND is_in_circle(k.circle_id))
$$;
GRANT EXECUTE ON FUNCTION is_in_ask_circle(uuid) TO pact_app;
ALTER TABLE asks ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ask_activity ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON asks, ask_options, ask_responses, ask_activity TO pact_app;
CREATE POLICY asks_visible ON asks FOR SELECT TO pact_app USING (is_in_circle(circle_id));
CREATE POLICY ask_options_visible ON ask_options FOR SELECT TO pact_app USING (is_in_ask_circle(ask_id));
CREATE POLICY ask_responses_visible ON ask_responses FOR SELECT TO pact_app USING (is_in_ask_circle(ask_id));
CREATE POLICY ask_activity_visible ON ask_activity FOR SELECT TO pact_app USING (is_in_ask_circle(ask_id));

-- Events: an Ask's pseudonym lets the whole funnel (created, shared, opened, started, responded, joined) be read as one path.
ALTER TABLE product_events ADD COLUMN ask TEXT;
CREATE INDEX product_events_ask_idx ON product_events (ask, occurred_at) WHERE ask IS NOT NULL;
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
  'ask_created', 'ask_shared', 'ask_opened', 'ask_response_started', 'ask_responded', 'ask_changed_response', 'ask_closed'
));
