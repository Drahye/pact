-- Plans and Circles can wear a cover photograph from the app's library too (a short key; null means the default).
ALTER TABLE plans ADD COLUMN cover TEXT CHECK (cover IS NULL OR cover ~ '^[a-z0-9-]{3,40}$');
ALTER TABLE circles ADD COLUMN cover TEXT CHECK (cover IS NULL OR cover ~ '^[a-z0-9-]{3,40}$');
