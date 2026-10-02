-- A few safe facts about what a notification is about (who, how much, for what), so the app can show the right
-- communication template instead of re-reading the message text. Never holds account numbers, BVNs or PINs:
-- the keys are a fixed list (see NotificationMeta in shared/contracts.ts) and the service writes only those.
ALTER TABLE notifications ADD COLUMN meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(meta) = 'object' AND pg_column_size(meta) < 2048);
