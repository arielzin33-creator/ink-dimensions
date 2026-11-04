-- 0002: projects, characters and character images.
-- The path is fixed at creation (spec FR-006); photos must carry a consent time (FR-008).
CREATE TABLE projects (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  path text NOT NULL CHECK (path IN ('photo', 'invented')),
  style_preset text NOT NULL DEFAULT 'manga',
  plot text NOT NULL DEFAULT '' CHECK (length(plot) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_user_id_idx ON projects (user_id, updated_at DESC);

CREATE TABLE characters (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX characters_project_id_idx ON characters (project_id, created_at);

CREATE TABLE character_images (
  id uuid PRIMARY KEY,
  character_id uuid NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('photo', 'reference')),
  storage_key text NOT NULL UNIQUE,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  consent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT character_images_photo_consent CHECK (kind <> 'photo' OR consent_at IS NOT NULL)
);
CREATE INDEX character_images_character_id_idx ON character_images (character_id);
CREATE INDEX character_images_project_id_idx ON character_images (project_id);
