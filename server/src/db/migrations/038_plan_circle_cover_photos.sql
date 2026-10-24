-- Own cover photographs for Plans and Circles, like Pacts: re-encoded WebP with metadata stripped, one each, served through the API only to people
-- who are in the Circle. No grants to the app role and no policy: only the API's own checks can read or write them.
CREATE TABLE plan_cover_photos (
  plan_id      UUID PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
  data         BYTEA NOT NULL,
  mime         TEXT NOT NULL CHECK (mime = 'image/webp'),
  bytes        INT NOT NULL CHECK (bytes BETWEEN 1 AND 2000000),
  width        INT NOT NULL,
  height       INT NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE circle_cover_photos (
  circle_id    UUID PRIMARY KEY REFERENCES circles(id) ON DELETE CASCADE,
  data         BYTEA NOT NULL,
  mime         TEXT NOT NULL CHECK (mime = 'image/webp'),
  bytes        INT NOT NULL CHECK (bytes BETWEEN 1 AND 2000000),
  width        INT NOT NULL,
  height       INT NOT NULL,
  uploaded_by  UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE plan_cover_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_cover_photos ENABLE ROW LEVEL SECURITY;
