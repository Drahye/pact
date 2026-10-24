-- A Pact's own cover photograph, uploaded by an organiser: re-encoded WebP with metadata stripped, one per Pact, readable only by people in the Pact
-- (served through the API, never from a public URL). Writes go through the API's own permission checks; pacts.cover holds 'upload-<version>'.
CREATE TABLE pact_cover_photos (
  pact_id      UUID PRIMARY KEY REFERENCES pacts(id) ON DELETE CASCADE,
  data         BYTEA NOT NULL,
  mime         TEXT NOT NULL CHECK (mime = 'image/webp'),
  bytes        INT NOT NULL CHECK (bytes BETWEEN 1 AND 2000000),
  width        INT NOT NULL,
  height       INT NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pact_cover_photos ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON pact_cover_photos TO pact_app;
CREATE POLICY cover_photo_visible ON pact_cover_photos FOR SELECT TO pact_app USING (is_in_pact(pact_id));
