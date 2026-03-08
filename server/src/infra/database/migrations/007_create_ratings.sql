-- Create ratings table
-- ELO-style rating per player. One row per player.

CREATE TABLE ratings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL DEFAULT 1200,
  peak_rating     INTEGER NOT NULL DEFAULT 1200,
  games_played    INTEGER NOT NULL DEFAULT 0,
  games_won       INTEGER NOT NULL DEFAULT 0,
  games_lost      INTEGER NOT NULL DEFAULT 0,
  win_streak      INTEGER NOT NULL DEFAULT 0,
  best_win_streak INTEGER NOT NULL DEFAULT 0,
  last_game_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ratings_user ON ratings (user_id);
CREATE INDEX idx_ratings_ranking ON ratings (rating DESC);

-- DOWN

DROP TABLE IF EXISTS ratings;
