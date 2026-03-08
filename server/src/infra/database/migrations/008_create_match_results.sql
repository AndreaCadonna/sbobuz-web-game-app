-- Create match_results table
-- One row per player per completed game. Denormalized for leaderboard queries.

CREATE TABLE match_results (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id               UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result                VARCHAR(10) NOT NULL
                        CHECK (result IN ('win', 'loss')),
  rating_before         INTEGER NOT NULL,
  rating_after          INTEGER NOT NULL,
  rating_change         INTEGER NOT NULL,
  placement             INTEGER NOT NULL,
  opponents             TEXT[] NOT NULL,
  game_duration_seconds INTEGER NOT NULL,
  played_at             TIMESTAMPTZ NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_match_results_game_user ON match_results (game_id, user_id);
CREATE INDEX idx_match_results_user_history ON match_results (user_id, played_at DESC);
CREATE INDEX idx_match_results_recent ON match_results (played_at DESC);

-- DOWN

DROP TABLE IF EXISTS match_results;
