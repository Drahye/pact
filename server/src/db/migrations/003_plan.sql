-- A Pact is a plan, not just a target: what the money covers, who is doing what,
-- how each person is showing up, and what the group did in the end.

-- How each member is taking part, their colour inside this Pact, and any "split the rest" ask.
ALTER TABLE pact_members ADD COLUMN participation TEXT CHECK (participation IN ('money', 'task', 'both', 'later'));
ALTER TABLE pact_members ADD COLUMN color TEXT;
ALTER TABLE pact_members ADD COLUMN requested_amount BIGINT CHECK (requested_amount IS NULL OR requested_amount > 0);
ALTER TABLE pact_members ADD COLUMN requested_at TIMESTAMPTZ;
UPDATE pact_members m SET color = u.color FROM users u WHERE u.id = m.user_id AND m.color IS NULL;
UPDATE pact_members SET participation = 'both' WHERE role = 'organizer' AND participation IS NULL;
UPDATE pact_members SET participation = 'money' WHERE contributed > 0 AND participation IS NULL;

-- What the money covers. Raised money fills items in order, so the plan shows which
-- parts are funded without anyone having to allocate their contribution by hand.
CREATE TABLE budget_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id       UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  amount        BIGINT NOT NULL CHECK (amount > 0),
  position      INT NOT NULL DEFAULT 0,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX budget_items_pact_idx ON budget_items (pact_id, position);

-- Deliberately small: a title, an owner, a status, optionally the budget line it handles.
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id         UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  budget_item_id  UUID REFERENCES budget_items(id) ON DELETE SET NULL,
  assignee_id     UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES users(id)
);
CREATE INDEX tasks_pact_idx ON tasks (pact_id, created_at);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id) WHERE status <> 'done';

-- The record of what happened. One per Pact; photos are stored privately and served
-- only to members through the API, never from a public URL.
CREATE TABLE pact_memories (
  pact_id      UUID PRIMARY KEY REFERENCES pacts(id) ON DELETE CASCADE,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  happened_on  DATE,
  updated_by   UUID NOT NULL REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE memory_photos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pact_id      UUID NOT NULL REFERENCES pacts(id) ON DELETE CASCADE,
  data         BYTEA NOT NULL,                         -- re-encoded WebP, metadata stripped
  mime         TEXT NOT NULL CHECK (mime = 'image/webp'),
  bytes        INT NOT NULL CHECK (bytes BETWEEN 1 AND 2000000),
  width        INT NOT NULL,
  height       INT NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX memory_photos_pact_idx ON memory_photos (pact_id, created_at);

-- New activity kinds for the plan.
ALTER TABLE activities DROP CONSTRAINT activities_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_type_check CHECK (type IN (
  'created', 'join', 'contribution', 'completed', 'released', 'refunded', 'cancelled', 'nudge', 'left',
  'committed', 'task_added', 'task_claimed', 'task_done', 'milestone', 'split_requested', 'memory_added'
));
ALTER TABLE activities ADD COLUMN detail TEXT CHECK (detail IS NULL OR char_length(detail) <= 120);
