-- The demo portraits had no confirmed licence and were removed from the app.
-- Anyone still pointing at them falls back to tinted initials.
UPDATE users SET photo_url = NULL WHERE photo_url LIKE '/avatars/%';
