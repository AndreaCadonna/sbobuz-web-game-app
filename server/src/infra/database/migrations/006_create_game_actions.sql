-- Create game_actions table
-- Event-sourced action log. One row per action in a game.

CREATE TABLE game_actions (
  id                         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id                    UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  index                      INTEGER NOT NULL,
  action_type                VARCHAR(30) NOT NULL
                             CHECK (action_type IN (
                               'PLAY_CARDS', 'PLAY_BLIND', 'PICK_UP_PILE',
                               'DECLARE_DIRECTION', 'TIMEOUT_FORFEIT', 'CANCEL_GAME'
                             )),
  action_payload             JSONB NOT NULL,
  resulting_state_snapshot   JSONB,
  player_id                  UUID NOT NULL REFERENCES users(id),
  "timestamp"                TIMESTAMPTZ NOT NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_game_actions_sequence ON game_actions (game_id, index);
CREATE INDEX idx_game_actions_game ON game_actions (game_id);

-- DOWN

DROP TABLE IF EXISTS game_actions;
