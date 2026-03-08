/**
 * Legal Move Enumerator for the Sbobuz game engine.
 *
 * Returns all valid GameAction objects for a given player in the current
 * game state. This is the inverse of the Action Validator: if the
 * enumerator returns an action, the validator must accept it, and vice
 * versa.
 *
 * The enumerator is used by the AI Opponent Module to obtain the set of
 * possible moves for strategy evaluation. It groups results by action type
 * for easy consumption.
 *
 * All functions are pure, deterministic, and free of side effects.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 9 (Action Types)
 * @see SBOBUZ_ENGINE_SPEC.md Section 10 (Action Validation Rules)
 * @see docs/specs/ai-opponent-module.md Section 8 (Legal Move Enumeration)
 */

import type { Card, Rank } from '@shared/card.js';
import type { GameAction, PlayCardsAction } from '@shared/game-action.js';
import type { GameState, PlayerState } from '@shared/game-state.js';

import { getActiveZone } from './active-zone.js';
import { isCardLegal } from './rank-comparator.js';
import type { ComparisonContext } from './rank-comparator.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * Legal moves grouped by action type for easy consumption by AI strategies.
 */
export interface LegalMoveSet {
  /** All legal PLAY_CARDS actions (single cards and same-rank combinations). */
  readonly playCards: ReadonlyArray<PlayCardsAction>;

  /** All legal PLAY_BLIND actions (one per face-down card position). */
  readonly playBlind: ReadonlyArray<GameAction>;

  /** PICK_UP_PILE action, if available (pile is non-empty). */
  readonly pickUpPile: ReadonlyArray<GameAction>;

  /** DECLARE_DIRECTION actions ('higher' and 'lower'), if in queen declaration phase. */
  readonly declareDirection: ReadonlyArray<GameAction>;

  /** Flat array of all legal actions across all types. */
  readonly all: ReadonlyArray<GameAction>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a ComparisonContext from the current game state for rank legality checks.
 */
function buildComparisonContext(state: GameState): ComparisonContext {
  const topCard =
    state.playPile.length > 0
      ? state.playPile[state.playPile.length - 1]
      : undefined;

  if (topCard === undefined) {
    return {
      pileTopRank: null,
      pileTopIsJoker: false,
      freePlay: state.freePlay,
      nextCardOverride: state.nextCardOverride,
    };
  }

  if (topCard.type === 'joker') {
    return {
      pileTopRank: null,
      pileTopIsJoker: true,
      freePlay: state.freePlay,
      nextCardOverride: state.nextCardOverride,
    };
  }

  return {
    pileTopRank: topCard.rank,
    pileTopIsJoker: false,
    freePlay: state.freePlay,
    nextCardOverride: state.nextCardOverride,
  };
}

/**
 * Groups cards by rank. Jokers are grouped under the key 'joker'.
 * Returns a Map where keys are ranks (or 'joker') and values are arrays of cards.
 */
function groupCardsByRank(cards: ReadonlyArray<Card>): ReadonlyMap<string, ReadonlyArray<Card>> {
  const groups = new Map<string, Card[]>();

  for (const card of cards) {
    const key = card.type === 'joker' ? 'joker' : card.rank;
    const existing = groups.get(key);
    if (existing !== undefined) {
      existing.push(card);
    } else {
      groups.set(key, [card]);
    }
  }

  return groups;
}

/**
 * Checks if a card with the given rank key is legal to play.
 * For 'joker', creates a joker card for the check.
 * For standard ranks, creates a representative standard card.
 */
function isRankLegal(rankKey: string, context: ComparisonContext): boolean {
  if (rankKey === 'joker') {
    // Jokers are always legal
    const jokerCard: Card = { type: 'joker', id: 'joker_1' };
    return isCardLegal(jokerCard, context).legal;
  }

  // Create a representative standard card for the rank check
  const representativeCard: Card = {
    type: 'standard',
    rank: rankKey as Rank,
    suit: 'hearts',
    id: `hearts_${rankKey}`,
  };
  return isCardLegal(representativeCard, context).legal;
}

/**
 * Generates all PLAY_CARDS actions for a set of cards grouped by rank.
 * For each legal rank, generates actions for playing 1 card, 2 cards, ...,
 * up to all cards of that rank.
 *
 * Note: Jokers can only be played one at a time (they have no shared rank),
 * so each joker generates a separate single-card action.
 */
function enumeratePlayCardsActions(
  playerId: string,
  sourceCards: ReadonlyArray<Card>,
  context: ComparisonContext,
): ReadonlyArray<PlayCardsAction> {
  const actions: PlayCardsAction[] = [];
  const groups = groupCardsByRank(sourceCards);

  for (const [rankKey, cards] of groups) {
    if (!isRankLegal(rankKey, context)) {
      continue;
    }

    if (rankKey === 'joker') {
      // Jokers are played individually -- they have no shared rank
      for (const card of cards) {
        actions.push({
          type: 'PLAY_CARDS',
          playerId,
          cardIds: [card.id],
        });
      }
    } else {
      // Standard cards: can play 1, 2, ..., up to all of this rank
      for (let count = 1; count <= cards.length; count++) {
        actions.push({
          type: 'PLAY_CARDS',
          playerId,
          cardIds: cards.slice(0, count).map((c) => c.id),
        });
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enumerates all legal moves for a player in the current game state.
 *
 * This is called by the AI module before dispatching to the worker.
 * The returned actions are guaranteed to pass validation when submitted
 * to the Action Validator.
 *
 * Behavior by game phase:
 * - `awaiting_queen_declaration`: Only DECLARE_DIRECTION actions.
 * - `playing` / `awaiting_post_clear_play`:
 *   - Active zone `hand` or `faceUp`: PLAY_CARDS + PICK_UP_PILE
 *   - Active zone `faceDown`: PLAY_BLIND + PICK_UP_PILE
 *   - Active zone `finished`: No moves (should not happen)
 * - `finished` / `cancelled` / `setup`: No moves.
 *
 * Note: PICK_UP_PILE is only available during `playing` phase (not
 * `awaiting_post_clear_play`), per validator rules.
 *
 * @param state - The current game state.
 * @param playerId - The player whose legal moves to enumerate.
 * @returns A LegalMoveSet with all legal actions grouped by type.
 *
 * @example
 * ```typescript
 * const moves = enumerateLegalMoves(gameState, 'player-1');
 * // moves.all contains every legal action
 * // moves.playCards contains PLAY_CARDS actions only
 * ```
 */
export function enumerateLegalMoves(
  state: GameState,
  playerId: string,
): LegalMoveSet {
  const emptyResult: LegalMoveSet = {
    playCards: [],
    playBlind: [],
    pickUpPile: [],
    declareDirection: [],
    all: [],
  };

  // Terminal phases: no moves possible
  if (state.phase === 'finished' || state.phase === 'cancelled' || state.phase === 'setup') {
    return emptyResult;
  }

  // Find the player
  const player = state.players.find((p) => p.id === playerId);
  if (player === undefined) {
    return emptyResult;
  }

  // Must be the current player's turn
  const currentPlayerId = state.turnOrder[state.currentPlayerIndex];
  if (playerId !== currentPlayerId) {
    return emptyResult;
  }

  // Check if player is finished
  const drawPileEmpty = state.drawPile.length === 0;
  const activeZone = getActiveZone(player, drawPileEmpty);
  if (activeZone === 'finished') {
    return emptyResult;
  }

  // Phase: awaiting_queen_declaration
  if (state.phase === 'awaiting_queen_declaration') {
    const declareDirection: GameAction[] = [
      { type: 'DECLARE_DIRECTION', playerId, direction: 'higher' },
      { type: 'DECLARE_DIRECTION', playerId, direction: 'lower' },
    ];
    return {
      playCards: [],
      playBlind: [],
      pickUpPile: [],
      declareDirection,
      all: declareDirection,
    };
  }

  // Phase: playing or awaiting_post_clear_play
  const playCards: PlayCardsAction[] = [];
  const playBlind: GameAction[] = [];
  const pickUpPile: GameAction[] = [];

  if (activeZone === 'faceDown') {
    // Blind plays: one per face-down card position
    for (let i = 0; i < player.faceDownCards.length; i++) {
      playBlind.push({ type: 'PLAY_BLIND', playerId, cardIndex: i });
    }
  } else {
    // Hand or face-up zone: enumerate all playable card groups
    const sourceCards = activeZone === 'hand' ? player.hand : player.faceUpCards;
    const context = buildComparisonContext(state);
    const cardActions = enumeratePlayCardsActions(playerId, sourceCards, context);
    playCards.push(...cardActions);
  }

  // PICK_UP_PILE: available only in 'playing' phase with non-empty pile
  if (state.phase === 'playing' && state.playPile.length > 0) {
    pickUpPile.push({ type: 'PICK_UP_PILE', playerId });
  }

  const all: GameAction[] = [...playCards, ...playBlind, ...pickUpPile];

  return {
    playCards,
    playBlind,
    pickUpPile,
    declareDirection: [],
    all,
  };
}
