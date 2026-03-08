# Game Engine Engineer - Memory

## Current Progress
- Step 1.1 (Define Shared Types) - COMPLETE
- Step 1.2 (Seeded PRNG) - COMPLETE
- Step 1.3 (Rank Comparator) - COMPLETE (70 tests, 96.77% line coverage, 100% function coverage)
- Step 1.4 (Deck Builder and Dealer) - COMPLETE (29 tests, 100% all coverage)
- Step 1.5 (Starting Player Algorithm) - COMPLETE (32 tests, 100% lines, 93.1% branches)
- Step 1.6 (State Factory) - COMPLETE (56 tests, 100% all coverage)
- Step 1.7 (Active Zone Resolver) - COMPLETE (23 tests, 100% functions, 90%+ lines/branches -- unreachable `never` guard)
- Step 1.8 (Sbobuz Detector) - COMPLETE (23 tests, 100% functions, 91%+ lines/branches -- unreachable type guard)
- Step 1.9 (Turn Manager) - COMPLETE (30 tests, 100% all coverage)
- Step 1.10 (Action Validator) - COMPLETE (65 tests, 95.28% stmts, 95.83% branches, 100% functions)
- Step 1.11 (State Reducer) - COMPLETE (75 tests, 97.42% stmts, 90.8% branches, 100% functions)
- Step 1.12 (Win Condition Evaluator) - COMPLETE (20 tests, 100% all coverage)
- Step 1.13 (Legal Move Enumerator) - COMPLETE (42 tests, 100% all coverage)
- Step 1.14 (State Sanitizer) - COMPLETE (33 tests, 100% all coverage)
- Step 1.15 (Game Engine Module Interface) - COMPLETE (32 tests, barrel export + processAction)
- Step 1.16 (Edge Case Integration Tests) - COMPLETE (31 tests, all 20 spec edge cases)
- Step 1.17 (Full Game Simulation Tests) - COMPLETE (19 tests, 2-5 player games, 100+ simulations)
- Phase 1 COMPLETE - All game engine logic implemented and tested

## Project Structure
- Shared types: `shared/types/` (7 files + barrel index)
- Engine code goes in: `server/src/modules/game-engine/` (note: `src/` prefix)
- TypeScript strict mode with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- Module: ES2022, Target: ES2022, moduleResolution: bundler
- Imports use `.js` extension (ESM-style, required by bundler resolution)

## Type Conventions Established
- All interfaces use `readonly` on every field
- Arrays typed as `ReadonlyArray<T>` in interfaces
- Optional properties explicitly typed with `| undefined` suffix (required by `exactOptionalPropertyTypes`)
- Discriminated unions: Card (`type: 'standard' | 'joker'`), GameAction (`type:` string literal)
- `export type` used exclusively in shared/types (no runtime code)
- JSDoc on every exported type/interface

## Key Spec Details (from SBOBUZ_ENGINE_SPEC.md)
- 54-card deck: 52 standard + 2 jokers
- Rank hierarchy: 3 < 4 < 5 < 6 < 7 < 8 < 9 < 10 < J < Q < K < A (2 is special)
- Special cards: 2 (wild reset/freePlay), Q (direction override), K (clear+play again), Joker (wild+reverse)
- Sbobuz: top 4 pile cards same rank = burn pile + reverse + play again (highest priority)
- Jokers excluded from Sbobuz detection
- Active zone computed, never stored: hand > faceUp > faceDown > finished
- 6 action types: PLAY_CARDS, PLAY_BLIND, PICK_UP_PILE, DECLARE_DIRECTION, TIMEOUT_FORFEIT, CANCEL_GAME
- GamePhase: setup | playing | awaiting_queen_declaration | awaiting_post_clear_play | finished | cancelled

## Toolchain
- `npm run typecheck` = `tsc --build` (uses project references)
- `npx eslint shared/types/` for linting
- Dependencies installed via `npm install` at root
- Vitest for testing; test include pattern: `server/src/**/*.test.ts`
- Test files are excluded from `server/tsconfig.json` (build), so ESLint projectService can't lint them (known gap)
- Vitest resolves aliases via `vitest.config.ts` with `@server` and `@shared` mappings

## Gotchas
- `npx tsc` can resolve to wrong package; use `npx tsc --build` after npm install
- CancelGameAction.disconnectedPlayerId needs `string | undefined` not `string?` for exactOptionalPropertyTypes
- Vitest `toBe` and `toEqual` both use `Object.is` for primitives, which distinguishes +0 from -0. Use `f(a,b) + f(b,a) === 0` instead of `f(a,b) === -f(b,a)` for anti-symmetry tests
- Coverage tool has EIO issues with coverage dir on WSL/Windows; use `--coverage.reportsDirectory=/tmp/...` to avoid
- Starting player: Joker ordinal = 13 (above Ace=12); defensive branch for hands < 3 cards is untested (always 3 in practice)
- Deal order: per-player (all 9 to P1, then P2...), NOT round-robin; face-down first, face-up second, hand third
- Deck creation order: suits=['hearts','diamonds','clubs','spades'] x ranks=['2'..'A'] then joker_1, joker_2
- Card ID format: "{suit}_{rank}" for standard, "joker_1"/"joker_2" for jokers
- State Factory stores raw seed in `rngSeed` (not floored); RNG floors internally. Fractional seeds produce same game state but different `rngSeed` values
- Active zone: draw pile affects ALL players -- if drawPile.length > 0, everyone's zone is 'hand' (even if their hand is empty)
- Sbobuz detector: Joker anywhere in top 4 prevents detection. Only the top 4 cards matter, regardless of pile depth
- Turn manager: double-modulo `((idx + dir) % count + count) % count` handles negative wrap correctly
- Reducer phase bug: `resolveCardPlay` must reset phase to `'playing'` at the start, NOT inherit from `state.phase`. Special effects (Sbobuz/King/Queen) override to their phase. Without reset, a follow-up play from `awaiting_post_clear_play` stays in that phase forever.
- Reducer blind play: legality check uses pile state BEFORE the revealed card was placed (comparison against previous top card)
- Validator `NOT_QUEEN_PLAYER` check is unreachable in practice because the universal `NOT_YOUR_TURN` check fires first (same condition). Defensive guard only.
- CANCEL_GAME bypasses ALL universal checks (turn, player, phase, finished)
- TIMEOUT_FORFEIT bypasses turn check and finished check but NOT phase check
- Total test count at step 1.12: 472 tests (11 test files)
- Total test count at step 1.15: 579 tests (14 test files)
- Total test count at step 1.17: 629 tests (16 test files)
- Legal moves: jokers enumerated individually (no multi-joker), PICK_UP_PILE only in 'playing' phase (not post-clear)
- Sanitizer: face-down cards hidden from EVERYONE (including owner), rngSeed stripped from sanitized output
- Module index: `processAction` = validate then reduce, returns discriminated union `{accepted: true, newState, events} | {accepted: false, error}`
- Module index: `createGame` is aliased from `createInitialState`
- Full engine coverage: 97.69% stmts, 95.69% branches, 100% functions
- Edge case tests in `server/src/modules/game-engine/__tests__/edge-cases.test.ts` (31 tests)
- Full game sims in `server/src/modules/game-engine/__tests__/full-game.test.ts` (19 tests)
- Simulation gotcha: pure random move selection causes infinite loops from repeated PICK_UP_PILE; bias 90% toward card plays
- Edge case #18 (Queen lower + King clear): King is illegal under 'lower' override (K > Q), must use a 2 (always legal) to consume override first
- Edge case #4/#compound: when crafting test states, ensure player has cards in other zones (faceUp/faceDown) to prevent accidental win
