/**
 * Action Validator for the Sbobuz game engine.
 *
 * The gate between player intent and state mutation. Takes the current
 * GameState and a GameAction, and returns either a validation success
 * (the action may proceed to the State Reducer) or a validation failure
 * with a specific reason code.
 *
 * Rejected actions never touch the state. Every rule that says "you can't
 * do that" lives here. The validator is exhaustive -- if an action passes
 * validation, the State Reducer can assume all preconditions are met.
 *
 * This is a pure function. It reads the state but never modifies it.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 10 (Action Validation Rules)
 * @see docs/specs/engine/action-validator.md
 */

import type { Card } from '@shared/card.js';
import type {
  GameAction,
  PlayCardsAction,
  PlayBlindAction,
  PickUpPileAction,
  DeclareDirectionAction,
} from '@shared/game-action.js';
import type { GameState, PlayerState, GamePhase } from '@shared/game-state.js';

import { getActiveZone, getActiveZoneCards } from './active-zone.js';
import { isCardLegal } from './rank-comparator.js';
import type { ComparisonContext } from './rank-comparator.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * Structured validation error with a code for programmatic handling
 * and a message for human-readable debugging.
 */
export interface ValidationError {
  readonly code: ValidationErrorCode;
  readonly message: string;
}

/**
 * All possible validation error codes.
 */
export type ValidationErrorCode =
  // Universal checks
  | 'GAME_NOT_ACTIVE'
  | 'WRONG_PHASE'
  | 'NOT_YOUR_TURN'
  | 'PLAYER_NOT_FOUND'
  | 'PLAYER_FINISHED'
  // PLAY_CARDS specific
  | 'CARDS_NOT_IN_ZONE'
  | 'CARDS_NOT_SAME_RANK'
  | 'CARD_NOT_LEGAL'
  | 'EMPTY_CARD_LIST'
  // PLAY_BLIND specific
  | 'NOT_IN_FACEDOWN_ZONE'
  | 'CARD_INDEX_OUT_OF_BOUNDS'
  // PICK_UP_PILE specific
  | 'PILE_EMPTY'
  // DECLARE_DIRECTION specific
  | 'INVALID_DIRECTION'
  | 'NOT_QUEEN_PLAYER';

/**
 * Result of validating a game action.
 */
export type ValidationResult =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: ValidationError };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Creates a valid result. */
function valid(): ValidationResult {
  return { valid: true };
}

/** Creates an invalid result with the given error code and message. */
function invalid(code: ValidationErrorCode, message: string): ValidationResult {
  return { valid: false, reason: { code, message } };
}

/**
 * The valid phases for each action type.
 * CANCEL_GAME is not listed because it is always valid.
 */
const VALID_PHASES: Readonly<Record<string, ReadonlyArray<GamePhase>>> = {
  PLAY_CARDS: ['playing', 'awaiting_post_clear_play'],
  PLAY_BLIND: ['playing', 'awaiting_post_clear_play'],
  PICK_UP_PILE: ['playing'],
  DECLARE_DIRECTION: ['awaiting_queen_declaration'],
  TIMEOUT_FORFEIT: ['playing', 'awaiting_queen_declaration', 'awaiting_post_clear_play'],
};

/**
 * Checks if the given phase is a terminal phase.
 */
function isTerminalPhase(phase: GamePhase): boolean {
  return phase === 'finished' || phase === 'cancelled';
}

/**
 * Finds a player by ID in the players array.
 */
function findPlayer(
  players: ReadonlyArray<PlayerState>,
  playerId: string,
): PlayerState | undefined {
  return players.find((p) => p.id === playerId);
}

/**
 * Gets the current player ID from the turn order.
 */
function getCurrentPlayerId(state: GameState): string | undefined {
  return state.turnOrder[state.currentPlayerIndex];
}

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

// ---------------------------------------------------------------------------
// Action-specific validators
// ---------------------------------------------------------------------------

/**
 * Validates a PLAY_CARDS action.
 */
function validatePlayCards(
  state: GameState,
  action: PlayCardsAction,
  player: PlayerState,
): ValidationResult {
  // 3a. Are card IDs non-empty?
  if (action.cardIds.length === 0) {
    return invalid('EMPTY_CARD_LIST', 'Must play at least one card');
  }

  // 3b. Determine player's active zone
  const drawPileEmpty = state.drawPile.length === 0;
  const activeZone = getActiveZone(player, drawPileEmpty);

  // faceDown zone cannot use PLAY_CARDS -- must use PLAY_BLIND
  if (activeZone === 'faceDown') {
    return invalid(
      'CARDS_NOT_IN_ZONE',
      'Cannot PLAY_CARDS from face-down zone; use PLAY_BLIND',
    );
  }

  // 3c. Are all specified cards in the player's active zone?
  const zoneCards = getActiveZoneCards(player, activeZone);

  for (const cardId of action.cardIds) {
    const found = zoneCards.some((c) => c.id === cardId);
    if (!found) {
      return invalid(
        'CARDS_NOT_IN_ZONE',
        `Card ${cardId} not in ${activeZone}`,
      );
    }
  }

  // 3d. Are all specified cards the same rank?
  // Resolve the actual card objects
  const playedCards: Card[] = [];
  for (const cardId of action.cardIds) {
    const foundCard = zoneCards.find((c) => c.id === cardId);
    if (foundCard === undefined) {
      return invalid('CARDS_NOT_IN_ZONE', `Card ${cardId} not in ${activeZone}`);
    }
    playedCards.push(foundCard);
  }

  // Check same-rank constraint
  // Jokers have no rank -- a Joker can only be played alone, not with other cards
  // Two Jokers cannot be played together because they have no shared rank
  if (playedCards.length > 1) {
    // If any card is a joker, multi-play is invalid (jokers have no rank)
    if (playedCards.some((c) => c.type === 'joker')) {
      return invalid(
        'CARDS_NOT_SAME_RANK',
        'All cards must share the same rank',
      );
    }

    // All standard cards must share the same rank
    const firstRank = (playedCards[0] as { type: 'standard'; rank: string }).rank;
    for (let i = 1; i < playedCards.length; i++) {
      const card = playedCards[i]!;
      if (card.type !== 'standard' || card.rank !== firstRank) {
        return invalid(
          'CARDS_NOT_SAME_RANK',
          'All cards must share the same rank',
        );
      }
    }
  }

  // 3e. Is the rank legal given the current context?
  const context = buildComparisonContext(state);
  const firstCard = playedCards[0]!;
  const legalityResult = isCardLegal(firstCard, context);

  if (!legalityResult.legal) {
    return invalid('CARD_NOT_LEGAL', legalityResult.reason);
  }

  return valid();
}

/**
 * Validates a PLAY_BLIND action.
 */
function validatePlayBlind(
  state: GameState,
  action: PlayBlindAction,
  player: PlayerState,
): ValidationResult {
  // 3a. Is the player's active zone 'faceDown'?
  const drawPileEmpty = state.drawPile.length === 0;
  const activeZone = getActiveZone(player, drawPileEmpty);

  if (activeZone !== 'faceDown') {
    return invalid(
      'NOT_IN_FACEDOWN_ZONE',
      'Can only blind play from face-down zone',
    );
  }

  // 3b. Is cardIndex within bounds?
  if (action.cardIndex < 0 || action.cardIndex >= player.faceDownCards.length) {
    return invalid(
      'CARD_INDEX_OUT_OF_BOUNDS',
      `Card index ${String(action.cardIndex)} out of bounds (0-${String(player.faceDownCards.length - 1)})`,
    );
  }

  return valid();
}

/**
 * Validates a PICK_UP_PILE action.
 */
function validatePickUpPile(state: GameState, _action: PickUpPileAction): ValidationResult {
  // 3a. Is the play pile non-empty?
  if (state.playPile.length === 0) {
    return invalid('PILE_EMPTY', 'Cannot pick up an empty pile');
  }

  return valid();
}

/**
 * Validates a DECLARE_DIRECTION action.
 */
function validateDeclareDirection(
  state: GameState,
  action: DeclareDirectionAction,
): ValidationResult {
  // 3a. Is the direction valid?
  if (action.direction !== 'higher' && action.direction !== 'lower') {
    return invalid('INVALID_DIRECTION', 'Direction must be higher or lower');
  }

  // 3b. Is this the player who played the Queen?
  // The current player during awaiting_queen_declaration is the Queen player
  const currentPlayerId = getCurrentPlayerId(state);
  if (action.playerId !== currentPlayerId) {
    return invalid(
      'NOT_QUEEN_PLAYER',
      'Only the Queen player can declare direction',
    );
  }

  return valid();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a game action against the current state.
 *
 * Returns a ValidationResult indicating success or failure with a reason.
 * The validator checks:
 * 1. Universal checks (game active, player exists, turn order, player status)
 * 2. Phase compatibility
 * 3. Action-specific rules
 *
 * @param state - The current game state.
 * @param action - The action to validate.
 * @returns ValidationResult -- { valid: true } or { valid: false, reason }.
 *
 * @example
 * ```typescript
 * const result = validateAction(gameState, {
 *   type: 'PLAY_CARDS',
 *   playerId: 'alice',
 *   cardIds: ['hearts_7'],
 * });
 *
 * if (!result.valid) {
 *   console.log(result.reason.code); // e.g. 'CARD_NOT_LEGAL'
 * }
 * ```
 */
export function validateAction(
  state: GameState,
  action: GameAction,
): ValidationResult {
  // -------------------------------------------------------------------------
  // STEP 1 -- UNIVERSAL CHECKS
  // -------------------------------------------------------------------------

  // CANCEL_GAME bypasses ALL checks -- always valid
  if (action.type === 'CANCEL_GAME') {
    return valid();
  }

  // 1a. Is the game active?
  if (isTerminalPhase(state.phase)) {
    return invalid('GAME_NOT_ACTIVE', 'Game is already over');
  }

  // 1b. Is the player in the game?
  const player = findPlayer(state.players, action.playerId);
  if (player === undefined) {
    return invalid('PLAYER_NOT_FOUND', 'Player not in this game');
  }

  // 1c. Is it this player's turn?
  // Exceptions: CANCEL_GAME (handled above), TIMEOUT_FORFEIT (system action, no turn check)
  if (action.type !== 'TIMEOUT_FORFEIT') {
    // For DECLARE_DIRECTION, the "current player" is the Queen player
    // which is state.turnOrder[state.currentPlayerIndex]
    const currentPlayerId = getCurrentPlayerId(state);
    if (action.playerId !== currentPlayerId) {
      return invalid('NOT_YOUR_TURN', 'It is not your turn');
    }
  }

  // 1d. Has this player already finished?
  // Exceptions: TIMEOUT_FORFEIT (system action)
  if (action.type !== 'TIMEOUT_FORFEIT') {
    const drawPileEmpty = state.drawPile.length === 0;
    const activeZone = getActiveZone(player, drawPileEmpty);
    if (activeZone === 'finished') {
      return invalid('PLAYER_FINISHED', 'Player has already finished');
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2 -- PHASE CHECK
  // -------------------------------------------------------------------------

  const validPhases = VALID_PHASES[action.type];
  if (validPhases !== undefined) {
    const phaseValid = validPhases.includes(state.phase);
    if (!phaseValid) {
      return invalid(
        'WRONG_PHASE',
        `Action ${action.type} not valid in ${state.phase} phase`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3 -- ACTION-SPECIFIC CHECKS
  // -------------------------------------------------------------------------

  switch (action.type) {
    case 'PLAY_CARDS':
      return validatePlayCards(state, action, player);

    case 'PLAY_BLIND':
      return validatePlayBlind(state, action, player);

    case 'PICK_UP_PILE':
      return validatePickUpPile(state, action);

    case 'DECLARE_DIRECTION':
      return validateDeclareDirection(state, action);

    case 'TIMEOUT_FORFEIT':
      // No action-specific checks beyond universal and phase checks
      return valid();

    default: {
      // Exhaustive check -- if a new action type is added, TypeScript will error here
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
