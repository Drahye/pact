-- A Pact can wear a cover photograph chosen from the app's library (a short key, never a URL or an upload). Null means the default for its kind.
ALTER TABLE pacts ADD COLUMN cover TEXT CHECK (cover IS NULL OR cover ~ '^[a-z0-9-]{3,40}$');
