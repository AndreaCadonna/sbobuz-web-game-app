-- Create oauth_providers table
-- Third-party auth links. Kept for forward compatibility.

CREATE TABLE oauth_providers (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 VARCHAR(20) NOT NULL
                           CHECK (provider IN ('google', 'discord')),
  provider_user_id         VARCHAR(255) NOT NULL,
  access_token_encrypted   TEXT,
  refresh_token_encrypted  TEXT,
  token_expires_at         TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oauth_providers_user_id ON oauth_providers (user_id);
CREATE UNIQUE INDEX idx_oauth_provider_identity ON oauth_providers (provider, provider_user_id);

-- Unique constraint: one link per provider per user
CREATE UNIQUE INDEX idx_oauth_user_provider ON oauth_providers (user_id, provider);

-- DOWN

DROP TABLE IF EXISTS oauth_providers;
