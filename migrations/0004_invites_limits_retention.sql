-- 0004: invitations, administrators, age and guardian confirmations, daily usage, retention
-- (spec 002). Additive only: new tables, nullable columns, and NOT NULL columns with defaults.
CREATE TABLE invites (
  id uuid PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  token_hash text NOT NULL UNIQUE,
  created_by uuid REFERENCES users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users (id) ON DELETE CASCADE,
  revoked_at timestamptz
);
-- One live invitation per email. Expiry can't be in a partial index, so creating an invitation
-- first revokes that email's expired, unused ones.
CREATE UNIQUE INDEX invites_live_email_key ON invites (lower(email)) WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN age_confirmed_at timestamptz;
-- One administrator (spec 002 section 6); also makes the setup code safe against simultaneous sign-ups.
CREATE UNIQUE INDEX users_single_admin ON users (is_admin) WHERE is_admin;

CREATE TABLE usage_daily (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day date NOT NULL,
  script_generations integer NOT NULL DEFAULT 0 CHECK (script_generations >= 0),
  panels integer NOT NULL DEFAULT 0 CHECK (panels >= 0),
  PRIMARY KEY (user_id, day)
);

ALTER TABLE character_images ADD COLUMN subject_minor boolean;
ALTER TABLE character_images ADD COLUMN guardian_confirmed_at timestamptz;
ALTER TABLE character_images ADD CONSTRAINT character_images_minor_guardian
  CHECK (subject_minor IS NOT TRUE OR guardian_confirmed_at IS NOT NULL);

-- Existing projects start their 90 days now, so nothing can be deleted early.
ALTER TABLE projects ADD COLUMN last_activity_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE projects ADD COLUMN retention_warned_at timestamptz;
CREATE INDEX projects_last_activity_idx ON projects (last_activity_at);

ALTER TABLE render_jobs ADD COLUMN usage_day date;
