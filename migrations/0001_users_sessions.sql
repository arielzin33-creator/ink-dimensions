-- 0001: accounts and sessions (load-bearing; see src/auth/**).
-- Emails are stored lower-cased; the unique index on lower(email) also guards direct writes.
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

-- Only the SHA-256 of a session token is stored, never the token itself.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_expires_at_idx ON sessions (expires_at);
