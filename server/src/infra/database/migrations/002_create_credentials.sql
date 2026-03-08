-- Create credentials table
-- Authentication secrets. Separated from users for security.

CREATE TABLE credentials (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash            TEXT NOT NULL,
  refresh_token_hash       TEXT,
  refresh_token_expires_at TIMESTAMPTZ,
  password_changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  failed_login_attempts    INTEGER NOT NULL DEFAULT 0,
  locked_until             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_credentials_user_id ON credentials (user_id);

-- DOWN

DROP TABLE IF EXISTS credentials;
