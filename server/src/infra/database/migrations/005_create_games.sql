-- Create games table
-- One row per completed (or cancelled) game.

CREATE TABLE games (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id          UUID NOT NULL REFERENCES rooms(id),
  winner_user_id   UUID REFERENCES users(id),
  phase            VARCHAR(20) NOT NULL
                   CHECK (phase IN ('finished', 'cancelled')),
  player_ids       TEXT[] NOT NULL,
  config           JSONB NOT NULL,
  rng_seed         BIGINT NOT NULL,
  action_count     INTEGER NOT NULL,
  duration_seconds INTEGER NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL,
  ended_at         TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_games_room ON games (room_id);
CREATE INDEX idx_games_winner ON games (winner_user_id) WHERE winner_user_id IS NOT NULL;
CREATE INDEX idx_games_ended ON games (ended_at DESC);

-- DOWN

DROP TABLE IF EXISTS games;
