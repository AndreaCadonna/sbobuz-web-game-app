-- Create rooms table
-- Archived room metadata. Written when a game starts from a room.

CREATE TABLE rooms (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  host_user_id             UUID NOT NULL REFERENCES users(id),
  room_code                VARCHAR(6) NOT NULL,
  visibility               VARCHAR(10) NOT NULL
                           CHECK (visibility IN ('public', 'private')),
  max_players              INTEGER NOT NULL CHECK (max_players BETWEEN 2 AND 5),
  turn_timer_seconds       INTEGER NOT NULL,
  disconnect_grace_seconds INTEGER NOT NULL,
  player_ids               TEXT[] NOT NULL,
  status                   VARCHAR(20) NOT NULL
                           CHECK (status IN ('game_started', 'expired', 'disbanded')),
  created_at               TIMESTAMPTZ NOT NULL,
  game_started_at          TIMESTAMPTZ,
  archived_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_host ON rooms (host_user_id);
CREATE INDEX idx_rooms_created ON rooms (created_at DESC);

-- DOWN

DROP TABLE IF EXISTS rooms;
