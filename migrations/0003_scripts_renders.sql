-- 0003: scripts (one per project, versioned), latest panel images, and render jobs.
CREATE TABLE scripts (
  project_id uuid PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  content jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The latest rendered image for each panel; character_ids lists the characters it shows, so
-- deleting a character's photo can delete every derived image (FR-012).
CREATE TABLE panel_images (
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  panel_id uuid NOT NULL,
  storage_key text NOT NULL,
  content_type text NOT NULL,
  character_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, panel_id)
);

CREATE TABLE render_jobs (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  panel_ids jsonb NOT NULL,
  results jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX render_jobs_status_idx ON render_jobs (status, created_at);
CREATE INDEX render_jobs_project_id_idx ON render_jobs (project_id, created_at DESC);
