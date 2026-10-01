-- First-party product funnel events for the closed beta. Pseudonymous by design:
-- people and Pacts appear only as keyed hashes (HMAC of the id with a server secret), never as ids,
-- phone numbers or names, and `props` holds a few coarse values per event (see server/src/lib/events.ts).
-- Written by the service role only; the restricted app role has no access.
CREATE TABLE product_events (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL CHECK (name IN (
    'pact_created', 'invite_created', 'invite_previewed', 'signup_completed', 'pact_joined',
    'participation_selected', 'contribution_completed', 'task_claimed', 'task_completed',
    'pact_funded', 'pact_completed', 'memory_added', 'second_pact_created'
  )),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor       TEXT,                       -- pseudonym of the person (for previews: a per-day visitor pseudonym)
  pact        TEXT,                       -- pseudonym of the Pact
  props       JSONB NOT NULL DEFAULT '{}',
  once_key    TEXT                        -- set for events that must only ever be recorded once per person or Pact
);
CREATE UNIQUE INDEX product_events_once ON product_events (name, once_key) WHERE once_key IS NOT NULL;
CREATE INDEX product_events_name_time ON product_events (name, occurred_at);
CREATE INDEX product_events_pact ON product_events (pact) WHERE pact IS NOT NULL;
CREATE INDEX product_events_actor ON product_events (actor) WHERE actor IS NOT NULL;
-- Nothing is granted to pact_app: the table is invisible to user-scoped queries.
