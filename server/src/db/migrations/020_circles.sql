-- Circles: the people I regularly make things happen with. A small persistent social layer around Pacts.
--
-- Additive only. Writes go through the service after it has checked who is asking; the app role may only read,
-- and only inside Circles it has joined (is_in_circle). Invite tokens are never readable by the app role at all.
--   circles          name, emoji, tint. No images, no uploads.
--   circle_members   owner or member; invited / joined / left (invited is reserved: links join directly for now).
--   circle_invites   one revocable link token per row. 32 random bytes, never a sequential or guessable id.
-- Pacts may optionally belong to a Circle (nullable, SET NULL if the Circle row ever goes away).

CREATE TABLE circles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  emoji       TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  tint        TEXT NOT NULL DEFAULT 'mint' CHECK (tint IN ('mint', 'sun', 'sky', 'lilac', 'pink', 'coral')),
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX circles_created_by_idx ON circles (created_by);

CREATE TABLE circle_members (
  circle_id   UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  status      TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('invited', 'joined', 'left')),
  joined_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);
CREATE INDEX circle_members_user_idx ON circle_members (user_id, status);
-- One owner per Circle.
CREATE UNIQUE INDEX circle_one_owner ON circle_members (circle_id) WHERE role = 'owner';

CREATE TABLE circle_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   UUID NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE CHECK (char_length(token) >= 32),
  created_by  UUID NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX circle_invites_circle_idx ON circle_invites (circle_id) WHERE revoked_at IS NULL;

ALTER TABLE pacts ADD COLUMN circle_id UUID REFERENCES circles(id) ON DELETE SET NULL;
CREATE INDEX pacts_circle_idx ON pacts (circle_id) WHERE circle_id IS NOT NULL;

-- Row-level security, same shape as Pacts.
CREATE FUNCTION is_in_circle(c uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = c AND user_id = app_user_id() AND status = 'joined')
$$;
GRANT EXECUTE ON FUNCTION is_in_circle(uuid) TO pact_app;

ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_invites ENABLE ROW LEVEL SECURITY; -- service only: pact_app has no grants, so tokens never leave through it
GRANT SELECT ON circles, circle_members TO pact_app;
CREATE POLICY circles_visible ON circles FOR SELECT TO pact_app USING (is_in_circle(id));
CREATE POLICY circle_members_visible ON circle_members FOR SELECT TO pact_app USING (is_in_circle(circle_id));

-- People who share a Circle can see each other's name and photo, as people who share a Pact already can.
CREATE OR REPLACE FUNCTION shares_pact_with(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pact_members a JOIN pact_members b ON b.pact_id = a.pact_id
     WHERE a.user_id = app_user_id() AND a.status IN ('joined', 'invited')
       AND b.user_id = u AND b.status <> 'left')
  OR EXISTS (
    SELECT 1 FROM circle_members a JOIN circle_members b ON b.circle_id = a.circle_id
     WHERE a.user_id = app_user_id() AND a.status = 'joined'
       AND b.user_id = u AND b.status = 'joined')
$$;

-- Product events for Circles (names only; no Circle names, emoji, tokens or text).
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
  'circle_created', 'circle_joined', 'circle_invite_created', 'circle_invite_opened', 'circle_invite_shared', 'universal_create_opened'
));
