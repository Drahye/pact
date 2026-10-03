-- Split an expense: who paid, who owes what, and who has settled. A record only: no money moves through PACT.
-- "Settled" means the group says it was settled outside PACT.
--
-- Additive only. Writes go through the service after it has checked who is asking; the app role may only read, and only
-- inside Circles it has joined. Amounts are integer kobo. A Split always belongs to a Circle and its people are Circle
-- members, so every share maps to a real PACT user (no claiming someone else's row).

CREATE TABLE splits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  title         TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  total_amount  BIGINT NOT NULL CHECK (total_amount > 0),
  currency      TEXT NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  split_mode    TEXT NOT NULL CHECK (split_mode IN ('equal', 'custom')),
  paid_by       UUID NOT NULL REFERENCES users(id),
  created_by    UUID NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  share_token   TEXT NOT NULL UNIQUE CHECK (char_length(share_token) >= 32),
  settled_at    TIMESTAMPTZ,
  cancelled_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX splits_circle_idx ON splits (circle_id, status, created_at DESC);

-- One row per person included. The payer's own row (if included) is born settled: they already paid it.
CREATE TABLE split_shares (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id    UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  amount      BIGINT NOT NULL CHECK (amount > 0),
  status      TEXT NOT NULL DEFAULT 'owed' CHECK (status IN ('owed', 'settled')),
  settled_at  TIMESTAMPTZ,
  settled_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (split_id, user_id)
);
CREATE INDEX split_shares_user_idx ON split_shares (user_id) WHERE status = 'owed';

CREATE TABLE split_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id    UUID NOT NULL REFERENCES splits(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  kind        TEXT NOT NULL CHECK (kind IN ('created', 'settled', 'unsettled', 'completed', 'reopened', 'cancelled')),
  target_id   UUID REFERENCES users(id),
  amount      BIGINT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX split_activity_split_idx ON split_activity (split_id, created_at DESC);

CREATE FUNCTION is_in_split_circle(s uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM splits x WHERE x.id = s AND is_in_circle(x.circle_id))
$$;
GRANT EXECUTE ON FUNCTION is_in_split_circle(uuid) TO pact_app;
ALTER TABLE splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE split_activity ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON splits, split_shares, split_activity TO pact_app;
CREATE POLICY splits_visible ON splits FOR SELECT TO pact_app USING (is_in_circle(circle_id));
CREATE POLICY split_shares_visible ON split_shares FOR SELECT TO pact_app USING (is_in_split_circle(split_id));
CREATE POLICY split_activity_visible ON split_activity FOR SELECT TO pact_app USING (is_in_split_circle(split_id));

-- Events: a Split's pseudonym lets its whole path (created, shared, opened, settled, completed) be read as one.
ALTER TABLE product_events ADD COLUMN split TEXT;
CREATE INDEX product_events_split_idx ON product_events (split, occurred_at) WHERE split IS NOT NULL;
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
  'plan_task_completed', 'plan_ask_linked', 'plan_confirmed', 'plan_conversion_started', 'plan_converted_to_pact',
  'split_created', 'split_opened', 'split_shared', 'split_share_opened', 'split_settlement_marked', 'split_settlement_undone',
  'split_completed', 'split_cancelled', 'circle_joined_from_split'
));
