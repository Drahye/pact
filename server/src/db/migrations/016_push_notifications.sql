-- Web Push subscriptions (one per browser) and grouped notifications.
--
-- A subscription is private to its owner: it is read and written only by the service after it has
-- identified the person, and the app role gets no access at all. It holds just what Web Push needs
-- (the push service's endpoint and the two keys that encrypt messages to this browser). Expired
-- subscriptions are disabled when the push service says they are gone and deleted by the sweep.
CREATE TABLE push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE CHECK (char_length(endpoint) BETWEEN 20 AND 1000),
  p256dh        TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 20 AND 200),
  auth          TEXT NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 100),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  disabled_at   TIMESTAMPTZ
);
CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id) WHERE disabled_at IS NULL;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- How many events a notification stands for ("3 new contributions"). Unread repeats of the same
-- thing update one row instead of piling up.
ALTER TABLE notifications ADD COLUMN merged_count INT NOT NULL DEFAULT 1 CHECK (merged_count >= 1);
