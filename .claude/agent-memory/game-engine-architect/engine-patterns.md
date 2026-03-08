# Engine Patterns and Conventions

## Reducer Patterns
- Flags (freePlay, nextCardOverride) consumed at step 4 of PLAY_CARDS, BEFORE Sbobuz check.
- Sbobuz detection at step 5, before individual card effects.
- Queen STOPS processing — no draw phase, no turn advance. Separate DECLARE_DIRECTION action.
- King: burn pile, enter 'awaiting_post_clear_play', then draw phase, then win check.
- Win check after draw phase (step 8). King edge case: win checked before requiring post-clear play.
- PLAY_BLIND: legality checked post-reveal. Illegal = pile pickup (not action rejection).
- TIMEOUT_FORFEIT: mapped internally to equivalent actions (auto-pickup, auto-declare 'higher', skip turn).

## Data Conventions
- Card IDs: `{suit}_{rank}` for standard (e.g., 'hearts_7'), `joker_1` / `joker_2` for jokers.
- drawPile: index 0 = top (draw from front).
- playPile: last element = top (push to back).
- Rank hierarchy: RANK_ORDER = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'].
- Jokers: no rank, no suit. Cannot contribute to Sbobuz. Cannot be multi-played.
- Multi-play: only same-rank standard cards. Jokers played alone.

## File Naming
- Spec files: kebab-case in `docs/specs/engine/{component-name}.md`.
- All 12 files written: README, rng-module, rank-comparator, turn-manager, sbobuz-detector,
  active-zone-resolver, win-condition-evaluator, state-factory, action-validator,
  state-reducer, game-clock, action-logger.

## Cross-Module Integration
- Realtime Module spec: `docs/specs/realtime-module.md` — defines Socket.IO event contracts.
- Data Layer spec: `docs/specs/data-layer.md` — defines Redis keys and PostgreSQL tables.
- Lobby Module spec: `docs/specs/lobby-module.md` — defines room lifecycle and game start trigger.
- AI Opponent Module spec: `docs/specs/ai-opponent-module.md` — bypasses Realtime, calls engine directly.
