/**
 * State Reducer -- Core Game State Transition Engine for Sbobuz.
 *
 * Pure function: (currentState, validatedAction) => ReducerResult.
 * No mutations. No side effects. Deterministic.
 *
 * Every state transition in the game flows through this single function.
 * It orchestrates all sub-components: Sbobuz detection, rank comparison
 * (for blind plays), turn advancement, zone recomputation, and win
 * condition checking.
 *
 * The reducer receives only validated actions. The Action Validator has
 * already confirmed that the action is legal. The reducer does not
 * re-validate -- it processes.
 *
 * Exception: blind play card legality is checked inside the reducer after
 * the card is revealed. An illegal blind play results in pile pickup, not
 * action rejection.
 *
 * @see SBOBUZ_ENGINE_SPEC.md Section 11 (State Reducer)
 * @see SBOBUZ_ENGINE_SPEC.md Section 7 (Effect Priority)
 * @see docs/specs/engine/state-reducer.md
 */

import type { ActiveZone } from '@shared/active-zone.js';
import type { Card, Rank } from '@shared/card.js';
import type {
  GameAction,
  PlayCardsAction,
  PlayBlindAction,
  PickUpPileAction,
  DeclareDirectionAction,
  TimeoutForfeitAction,
  CancelGameAction,
} from '@shared/game-action.js';
import type { GameState, PlayerState } from '@shared/game-state.js';

import { getActiveZone } from './active-zone.js';
import { isCardLegal } from './rank-comparator.js';
import type { ComparisonContext } from './rank-comparator.js';
import { checkSbobuz } from './sbobuz-detector.js';
import { advanceTurn } from './turn-manager.js';
import { checkWinCondition } from './win-condition.js';

// ---------------------------------------------------------------------------
// Types owned by this component
// ---------------------------------------------------------------------------

/**
 * Events emitted by the reducer to describe what happened.
 * Used for logging, animation triggers, and client-side feedback.
 */
export type GameEvent =
  | { readonly type: 'CARDS_PLAYED'; readonly playerId: string; readonly cards: ReadonlyArray<Card>; readonly fromZone: ActiveZone }
  | { readonly type: 'BLIND_CARD_REVEALED'; readonly playerId: string; readonly card: Card; readonly legal: boolean }
  | { readonly type: 'PILE_PICKED_UP'; readonly playerId: string; readonly cardCount: number }
  | { readonly type: 'CARDS_DRAWN'; readonly playerId: string; readonly count: number }
  | { readonly type: 'SBOBUZ_TRIGGERED'; readonly playerId: string; readonly rank: Rank }
  | { readonly type: 'PILE_BURNED'; readonly cardCount: number; readonly reason: 'sbobuz' | 'king' }
  | { readonly type: 'DIRECTION_REVERSED'; readonly newDirection: 1 | -1 }
  | { readonly type: 'FREE_PLAY_SET'; readonly byCard: '2' | 'joker' }
  | { readonly type: 'QUEEN_AWAITING_DECLARATION'; readonly playerId: string }
  | { readonly type: 'DIRECTION_DECLARED'; readonly playerId: string; readonly direction: 'higher' | 'lower' }
  | { readonly type: 'TURN_ADVANCED'; readonly newPlayerIndex: number; readonly newPlayerId: string }
  | { readonly type: 'PLAYER_WON'; readonly playerId: string }
  | { readonly type: 'GAME_CANCELLED'; readonly reason: string }
  | { readonly type: 'PLAYER_TIMED_OUT'; readonly playerId: string };

/**
 * The result of reducing an action. Contains the new state and metadata
 * about what happened during the reduction.
 */
export interface ReducerResult {
  /** The new game state after applying the action. */
  readonly newState: GameState;

  /**
   * Events that occurred during reduction, for the Action Logger and
   * Realtime Module to broadcast.
   */
  readonly events: ReadonlyArray<GameEvent>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Replaces a single player's state in the players array immutably.
 */
function updatePlayer(
  players: ReadonlyArray<PlayerState>,
  playerId: string,
  updater: (player: PlayerState) => PlayerState,
): ReadonlyArray<PlayerState> {
  return players.map((p) => (p.id === playerId ? updater(p) : p));
}

/**
 * Finds a player by ID. Throws if not found (caller must ensure validity).
 */
function getPlayer(players: ReadonlyArray<PlayerState>, playerId: string): PlayerState {
  const player = players.find((p) => p.id === playerId);
  if (player === undefined) {
    throw new Error(`Player ${playerId} not found in game state`);
  }
  return player;
}

/**
 * Removes cards from a zone by their IDs.
 */
function removeCardsFromArray(
  zoneCards: ReadonlyArray<Card>,
  cardIds: ReadonlyArray<string>,
): ReadonlyArray<Card> {
  const idsToRemove = new Set(cardIds);
  return zoneCards.filter((c) => !idsToRemove.has(c.id));
}

/**
 * Removes a card at a specific index from an array.
 */
function removeCardAtIndex(
  zoneCards: ReadonlyArray<Card>,
  index: number,
): { readonly remaining: ReadonlyArray<Card>; readonly removed: Card } {
  const removed = zoneCards[index];
  if (removed === undefined) {
    throw new Error(`Card index ${String(index)} out of bounds`);
  }
  const remaining = [...zoneCards.slice(0, index), ...zoneCards.slice(index + 1)];
  return { remaining, removed };
}

/**
 * Resolves card objects from the player's active zone by their IDs.
 */
function resolveCards(
  zoneCards: ReadonlyArray<Card>,
  cardIds: ReadonlyArray<string>,
): ReadonlyArray<Card> {
  return cardIds.map((id) => {
    const card = zoneCards.find((c) => c.id === id);
    if (card === undefined) {
      throw new Error(`Card ${id} not found in zone`);
    }
    return card;
  });
}

/**
 * Builds a ComparisonContext from pile state and flags.
 */
function buildContext(
  playPile: ReadonlyArray<Card>,
  freePlay: boolean,
  nextCardOverride: 'lower' | null,
): ComparisonContext {
  const topCard = playPile.length > 0 ? playPile[playPile.length - 1] : undefined;

  if (topCard === undefined) {
    return { pileTopRank: null, pileTopIsJoker: false, freePlay, nextCardOverride };
  }

  if (topCard.type === 'joker') {
    return { pileTopRank: null, pileTopIsJoker: true, freePlay, nextCardOverride };
  }

  return { pileTopRank: topCard.rank, pileTopIsJoker: false, freePlay, nextCardOverride };
}

/**
 * Gets the rank played from a set of cards.
 * For standard cards: returns the rank.
 * For jokers: returns null (joker has no rank).
 */
function getPlayedRank(cards: ReadonlyArray<Card>): Rank | null {
  const first = cards[0];
  if (first === undefined) {
    return null;
  }
  return first.type === 'standard' ? first.rank : null;
}

/**
 * Determines if the played cards are a joker.
 */
function isJokerPlay(cards: ReadonlyArray<Card>): boolean {
  return cards.length === 1 && cards[0]!.type === 'joker';
}

// ---------------------------------------------------------------------------
// Draw phase helper
// ---------------------------------------------------------------------------

interface DrawResult {
  readonly updatedHand: ReadonlyArray<Card>;
  readonly updatedDrawPile: ReadonlyArray<Card>;
  readonly drawCount: number;
}

/**
 * Draws cards from the draw pile until the hand has 3 cards or the draw pile
 * is exhausted.
 *
 * Draw pile convention: index 0 = top card.
 */
function performDraw(
  hand: ReadonlyArray<Card>,
  drawPile: ReadonlyArray<Card>,
): DrawResult {
  let drawCount = 0;
  const newHand = [...hand];
  let drawIndex = 0;

  while (newHand.length < 3 && drawIndex < drawPile.length) {
    const card = drawPile[drawIndex];
    if (card === undefined) break;
    newHand.push(card);
    drawIndex++;
    drawCount++;
  }

  return {
    updatedHand: newHand,
    updatedDrawPile: drawPile.slice(drawIndex),
    drawCount,
  };
}

// ---------------------------------------------------------------------------
// Shared card play resolution (steps 4-10 of PLAY_CARDS)
// ---------------------------------------------------------------------------

interface CardPlayResolutionInput {
  readonly state: GameState;
  readonly playerId: string;
  readonly playedCards: ReadonlyArray<Card>;
  readonly newPlayPile: ReadonlyArray<Card>;
  readonly updatedPlayers: ReadonlyArray<PlayerState>;
  readonly fromZone: ActiveZone;
  readonly precedingEvents: ReadonlyArray<GameEvent>;
}

/**
 * Shared resolution logic after cards have been placed on the pile.
 * Used by both PLAY_CARDS and the legal branch of PLAY_BLIND.
 *
 * Steps:
 * 4. Consume single-use flags
 * 5. Sbobuz check (highest priority)
 *    5f. Individual card effect
 * 6. Draw phase
 * 7. Zone recomputation (implicit via win check)
 * 8. Win check
 * 9. Check for same-player-plays-again
 * 10. Advance turn
 */
function resolveCardPlay(input: CardPlayResolutionInput): ReducerResult {
  const { state, playerId, playedCards, updatedPlayers } = input;
  const events: GameEvent[] = [...input.precedingEvents];

  // Step 4: Consume single-use flags
  let newFreePlay = false;
  let newNextCardOverride: 'lower' | null = null;
  let newPlayPile: ReadonlyArray<Card> = input.newPlayPile;
  let newBurnPile: ReadonlyArray<Card> = state.burnPile;
  let newTurnDirection: 1 | -1 = state.turnDirection;
  let newPlayers: ReadonlyArray<PlayerState> = updatedPlayers;
  let newDrawPile: ReadonlyArray<Card> = state.drawPile;
  // Reset phase to 'playing' — the act of playing a card fulfills any
  // pending phase (e.g., 'awaiting_post_clear_play'). Special effects
  // (Sbobuz, King, Queen) will set their own phase below.
  let phase: GameState['phase'] = 'playing';

  // Step 5: SBOBUZ CHECK (highest priority)
  const sbobuzResult = checkSbobuz(newPlayPile);

  if (sbobuzResult.triggered) {
    // 5a. Move entire playPile to burnPile
    newBurnPile = [...newBurnPile, ...newPlayPile];
    const burnCount = newPlayPile.length;
    newPlayPile = [];

    // 5b. Flip turn direction
    newTurnDirection = (newTurnDirection * -1) as 1 | -1;

    // 5c. Set phase = 'awaiting_post_clear_play'
    phase = 'awaiting_post_clear_play';

    // 5d. Emit events
    events.push({ type: 'SBOBUZ_TRIGGERED', playerId, rank: sbobuzResult.rank! });
    events.push({ type: 'PILE_BURNED', cardCount: burnCount, reason: 'sbobuz' });
    events.push({ type: 'DIRECTION_REVERSED', newDirection: newTurnDirection });

    // 5e. SKIP individual card effects -- go to step 6
  } else {
    // Step 5f: Resolve individual card effect
    const playedRank = getPlayedRank(playedCards);
    const isJoker = isJokerPlay(playedCards);

    if (playedRank === '2') {
      newFreePlay = true;
      events.push({ type: 'FREE_PLAY_SET', byCard: '2' });
    } else if (isJoker) {
      newFreePlay = true;
      newTurnDirection = (newTurnDirection * -1) as 1 | -1;
      events.push({ type: 'FREE_PLAY_SET', byCard: 'joker' });
      events.push({ type: 'DIRECTION_REVERSED', newDirection: newTurnDirection });
    } else if (playedRank === 'Q') {
      // Queen: enter awaiting_queen_declaration phase
      // STOP here -- no draw, no turn advance
      phase = 'awaiting_queen_declaration';
      events.push({ type: 'QUEEN_AWAITING_DECLARATION', playerId });

      return {
        newState: {
          ...state,
          players: newPlayers,
          playPile: newPlayPile,
          burnPile: newBurnPile,
          drawPile: newDrawPile,
          turnDirection: newTurnDirection,
          freePlay: newFreePlay,
          nextCardOverride: newNextCardOverride,
          phase,
          actionCount: state.actionCount + 1,
        },
        events,
      };
    } else if (playedRank === 'K') {
      // King: burn pile, play again
      newBurnPile = [...newBurnPile, ...newPlayPile];
      const burnCount = newPlayPile.length;
      newPlayPile = [];
      phase = 'awaiting_post_clear_play';
      events.push({ type: 'PILE_BURNED', cardCount: burnCount, reason: 'king' });
    }
    // Other ranks: no special effect
  }

  // Step 6: DRAW PHASE
  const currentPlayer = getPlayer(newPlayers, playerId);
  const drawResult = performDraw(currentPlayer.hand, newDrawPile);
  newDrawPile = drawResult.updatedDrawPile;

  if (drawResult.drawCount > 0) {
    newPlayers = updatePlayer(newPlayers, playerId, (p) => ({
      ...p,
      hand: drawResult.updatedHand,
    }));
    events.push({ type: 'CARDS_DRAWN', playerId, count: drawResult.drawCount });
  }

  // Step 7: Recompute active zone (implicit -- used by win check)

  // Step 8: WIN CHECK
  const updatedCurrentPlayer = getPlayer(newPlayers, playerId);
  const drawPileEmpty = newDrawPile.length === 0;
  const winResult = checkWinCondition(updatedCurrentPlayer, drawPileEmpty);

  if (winResult.won) {
    phase = 'finished';
    events.push({ type: 'PLAYER_WON', playerId });

    return {
      newState: {
        ...state,
        players: newPlayers,
        playPile: newPlayPile,
        burnPile: newBurnPile,
        drawPile: newDrawPile,
        turnDirection: newTurnDirection,
        freePlay: newFreePlay,
        nextCardOverride: newNextCardOverride,
        phase,
        actionCount: state.actionCount + 1,
      },
      events,
    };
  }

  // Step 9: Check for same-player-plays-again
  if (phase === 'awaiting_post_clear_play') {
    return {
      newState: {
        ...state,
        players: newPlayers,
        playPile: newPlayPile,
        burnPile: newBurnPile,
        drawPile: newDrawPile,
        turnDirection: newTurnDirection,
        freePlay: newFreePlay,
        nextCardOverride: newNextCardOverride,
        phase,
        actionCount: state.actionCount + 1,
      },
      events,
    };
  }

  // Step 10: ADVANCE TURN
  const newCurrentPlayerIndex = advanceTurn(
    state.currentPlayerIndex,
    newTurnDirection,
    state.turnOrder.length,
  );
  phase = 'playing';

  const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
  if (newPlayerId !== undefined) {
    events.push({
      type: 'TURN_ADVANCED',
      newPlayerIndex: newCurrentPlayerIndex,
      newPlayerId,
    });
  }

  return {
    newState: {
      ...state,
      players: newPlayers,
      playPile: newPlayPile,
      burnPile: newBurnPile,
      drawPile: newDrawPile,
      currentPlayerIndex: newCurrentPlayerIndex,
      turnDirection: newTurnDirection,
      freePlay: newFreePlay,
      nextCardOverride: newNextCardOverride,
      phase,
      actionCount: state.actionCount + 1,
    },
    events,
  };
}

// ---------------------------------------------------------------------------
// Action-specific reducers
// ---------------------------------------------------------------------------

/**
 * Reduces a PLAY_CARDS action.
 */
function reducePlayCards(state: GameState, action: PlayCardsAction): ReducerResult {
  const player = getPlayer(state.players, action.playerId);
  const drawPileEmpty = state.drawPile.length === 0;
  const activeZone = getActiveZone(player, drawPileEmpty);

  // Step 1: Resolve cards from active zone
  let zoneCards: ReadonlyArray<Card>;
  switch (activeZone) {
    case 'hand':
      zoneCards = player.hand;
      break;
    case 'faceUp':
      zoneCards = player.faceUpCards;
      break;
    default:
      // faceDown and finished should not reach here (validator prevents it)
      throw new Error(`Cannot PLAY_CARDS from zone: ${activeZone}`);
  }

  const playedCards = resolveCards(zoneCards, action.cardIds);

  // Step 2: Remove cards from zone
  const updatedZoneCards = removeCardsFromArray(zoneCards, action.cardIds);
  const updatedPlayers = updatePlayer(state.players, action.playerId, (p) => {
    if (activeZone === 'hand') {
      return { ...p, hand: updatedZoneCards };
    }
    return { ...p, faceUpCards: updatedZoneCards };
  });

  // Step 3: Place cards on pile
  const newPlayPile: ReadonlyArray<Card> = [...state.playPile, ...playedCards];

  // Emit CARDS_PLAYED event
  const events: GameEvent[] = [
    { type: 'CARDS_PLAYED', playerId: action.playerId, cards: playedCards, fromZone: activeZone },
  ];

  // Steps 4-10: Shared resolution
  return resolveCardPlay({
    state,
    playerId: action.playerId,
    playedCards,
    newPlayPile,
    updatedPlayers,
    fromZone: activeZone,
    precedingEvents: events,
  });
}

/**
 * Reduces a PLAY_BLIND action.
 */
function reducePlayBlind(state: GameState, action: PlayBlindAction): ReducerResult {
  const player = getPlayer(state.players, action.playerId);

  // Step 1: Remove card from faceDownCards
  const { remaining, removed: revealedCard } = removeCardAtIndex(
    player.faceDownCards,
    action.cardIndex,
  );

  // Step 2: Update player state (card removed from faceDown)
  let updatedPlayers = updatePlayer(state.players, action.playerId, (p) => ({
    ...p,
    faceDownCards: remaining,
  }));

  // Step 3: Place card on pile
  const newPlayPile: ReadonlyArray<Card> = [...state.playPile, revealedCard];

  // Step 4: Check legality of revealed card against PREVIOUS pile top
  // Build context from state BEFORE the revealed card was placed
  const context = buildContext(state.playPile, state.freePlay, state.nextCardOverride);
  const legalityResult = isCardLegal(revealedCard, context);

  if (legalityResult.legal) {
    // Legal blind play: continue with standard PLAY_CARDS resolution from step 4
    const events: GameEvent[] = [
      { type: 'BLIND_CARD_REVEALED', playerId: action.playerId, card: revealedCard, legal: true },
      { type: 'CARDS_PLAYED', playerId: action.playerId, cards: [revealedCard], fromZone: 'faceDown' },
    ];

    return resolveCardPlay({
      state,
      playerId: action.playerId,
      playedCards: [revealedCard],
      newPlayPile,
      updatedPlayers,
      fromZone: 'faceDown',
      precedingEvents: events,
    });
  }

  // Illegal blind play
  const events: GameEvent[] = [
    { type: 'BLIND_CARD_REVEALED', playerId: action.playerId, card: revealedCard, legal: false },
  ];

  // Move entire playPile (including the revealed card) into player's hand
  const pileCards = newPlayPile;
  updatedPlayers = updatePlayer(updatedPlayers, action.playerId, (p) => ({
    ...p,
    hand: [...p.hand, ...pileCards],
  }));

  events.push({ type: 'PILE_PICKED_UP', playerId: action.playerId, cardCount: pileCards.length });

  // Clear pile and flags
  const clearedPlayPile: ReadonlyArray<Card> = [];
  const newFreePlay = false;
  const newNextCardOverride: 'lower' | null = null;

  // Advance turn
  const newCurrentPlayerIndex = advanceTurn(
    state.currentPlayerIndex,
    state.turnDirection,
    state.turnOrder.length,
  );

  const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
  if (newPlayerId !== undefined) {
    events.push({
      type: 'TURN_ADVANCED',
      newPlayerIndex: newCurrentPlayerIndex,
      newPlayerId,
    });
  }

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      playPile: clearedPlayPile,
      freePlay: newFreePlay,
      nextCardOverride: newNextCardOverride,
      currentPlayerIndex: newCurrentPlayerIndex,
      phase: 'playing',
      actionCount: state.actionCount + 1,
    },
    events,
  };
}

/**
 * Reduces a PICK_UP_PILE action.
 */
function reducePickUpPile(state: GameState, action: PickUpPileAction): ReducerResult {
  const events: GameEvent[] = [];

  // Step 1: Move pile to hand
  const pileCards = state.playPile;
  const updatedPlayers = updatePlayer(state.players, action.playerId, (p) => ({
    ...p,
    hand: [...p.hand, ...pileCards],
  }));

  events.push({ type: 'PILE_PICKED_UP', playerId: action.playerId, cardCount: pileCards.length });

  // Step 2: Clear pile and flags
  const newPlayPile: ReadonlyArray<Card> = [];
  const newFreePlay = false;
  const newNextCardOverride: 'lower' | null = null;

  // Step 3: Advance turn
  const newCurrentPlayerIndex = advanceTurn(
    state.currentPlayerIndex,
    state.turnDirection,
    state.turnOrder.length,
  );

  const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
  if (newPlayerId !== undefined) {
    events.push({
      type: 'TURN_ADVANCED',
      newPlayerIndex: newCurrentPlayerIndex,
      newPlayerId,
    });
  }

  return {
    newState: {
      ...state,
      players: updatedPlayers,
      playPile: newPlayPile,
      freePlay: newFreePlay,
      nextCardOverride: newNextCardOverride,
      currentPlayerIndex: newCurrentPlayerIndex,
      phase: 'playing',
      actionCount: state.actionCount + 1,
    },
    events,
  };
}

/**
 * Reduces a DECLARE_DIRECTION action.
 */
function reduceDeclareDirection(state: GameState, action: DeclareDirectionAction): ReducerResult {
  const events: GameEvent[] = [];

  // Step 1: Set direction override
  const newNextCardOverride: 'lower' | null =
    action.direction === 'lower' ? 'lower' : null;

  events.push({
    type: 'DIRECTION_DECLARED',
    playerId: action.playerId,
    direction: action.direction,
  });

  // Step 2: Set phase = 'playing'
  let phase: GameState['phase'] = 'playing';

  // Step 3: DRAW PHASE (for the Queen player)
  let newPlayers = state.players;
  let newDrawPile = state.drawPile;

  const currentPlayer = getPlayer(state.players, action.playerId);
  const drawResult = performDraw(currentPlayer.hand, state.drawPile);
  newDrawPile = drawResult.updatedDrawPile;

  if (drawResult.drawCount > 0) {
    newPlayers = updatePlayer(state.players, action.playerId, (p) => ({
      ...p,
      hand: drawResult.updatedHand,
    }));
    events.push({ type: 'CARDS_DRAWN', playerId: action.playerId, count: drawResult.drawCount });
  }

  // Step 4: Recompute active zone (implicit)

  // Step 5: WIN CHECK
  const updatedPlayer = getPlayer(newPlayers, action.playerId);
  const drawPileEmpty = newDrawPile.length === 0;
  const winResult = checkWinCondition(updatedPlayer, drawPileEmpty);

  if (winResult.won) {
    phase = 'finished';
    events.push({ type: 'PLAYER_WON', playerId: action.playerId });

    return {
      newState: {
        ...state,
        players: newPlayers,
        drawPile: newDrawPile,
        nextCardOverride: newNextCardOverride,
        phase,
        actionCount: state.actionCount + 1,
      },
      events,
    };
  }

  // Step 6: Advance turn
  const newCurrentPlayerIndex = advanceTurn(
    state.currentPlayerIndex,
    state.turnDirection,
    state.turnOrder.length,
  );

  const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
  if (newPlayerId !== undefined) {
    events.push({
      type: 'TURN_ADVANCED',
      newPlayerIndex: newCurrentPlayerIndex,
      newPlayerId,
    });
  }

  return {
    newState: {
      ...state,
      players: newPlayers,
      drawPile: newDrawPile,
      nextCardOverride: newNextCardOverride,
      currentPlayerIndex: newCurrentPlayerIndex,
      phase,
      actionCount: state.actionCount + 1,
    },
    events,
  };
}

/**
 * Reduces a TIMEOUT_FORFEIT action.
 */
function reduceTimeoutForfeit(state: GameState, action: TimeoutForfeitAction): ReducerResult {
  const events: GameEvent[] = [
    { type: 'PLAYER_TIMED_OUT', playerId: action.playerId },
  ];

  if (state.phase === 'awaiting_queen_declaration') {
    // Auto-declare 'higher' (the default, no-op direction)
    const declareAction: DeclareDirectionAction = {
      type: 'DECLARE_DIRECTION',
      playerId: action.playerId,
      direction: 'higher',
    };
    const declareResult = reduceDeclareDirection(state, declareAction);
    return {
      newState: declareResult.newState,
      events: [...events, ...declareResult.events],
    };
  }

  if (state.phase === 'awaiting_post_clear_play') {
    // Player had to play but timed out. Skip and advance turn.
    const newCurrentPlayerIndex = advanceTurn(
      state.currentPlayerIndex,
      state.turnDirection,
      state.turnOrder.length,
    );

    const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
    if (newPlayerId !== undefined) {
      events.push({
        type: 'TURN_ADVANCED',
        newPlayerIndex: newCurrentPlayerIndex,
        newPlayerId,
      });
    }

    return {
      newState: {
        ...state,
        currentPlayerIndex: newCurrentPlayerIndex,
        phase: 'playing',
        actionCount: state.actionCount + 1,
      },
      events,
    };
  }

  // phase === 'playing'
  if (state.playPile.length > 0) {
    // Auto-pickup pile
    const pickupAction: PickUpPileAction = {
      type: 'PICK_UP_PILE',
      playerId: action.playerId,
    };
    const pickupResult = reducePickUpPile(state, pickupAction);
    return {
      newState: pickupResult.newState,
      events: [...events, ...pickupResult.events],
    };
  }

  // Pile is empty -- just advance turn
  const newCurrentPlayerIndex = advanceTurn(
    state.currentPlayerIndex,
    state.turnDirection,
    state.turnOrder.length,
  );

  const newPlayerId = state.turnOrder[newCurrentPlayerIndex];
  if (newPlayerId !== undefined) {
    events.push({
      type: 'TURN_ADVANCED',
      newPlayerIndex: newCurrentPlayerIndex,
      newPlayerId,
    });
  }

  return {
    newState: {
      ...state,
      currentPlayerIndex: newCurrentPlayerIndex,
      phase: 'playing',
      actionCount: state.actionCount + 1,
    },
    events,
  };
}

/**
 * Reduces a CANCEL_GAME action.
 */
function reduceCancelGame(state: GameState, action: CancelGameAction): ReducerResult {
  return {
    newState: {
      ...state,
      phase: 'cancelled',
      actionCount: state.actionCount + 1,
    },
    events: [{ type: 'GAME_CANCELLED', reason: action.reason }],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The core reducer function. Takes the current state and a validated action,
 * returns the new state and a list of events describing what happened.
 *
 * PRECONDITION: The action has passed validation (Action Validator returned
 * { valid: true }). The reducer does not re-validate. It processes.
 *
 * POSTCONDITION: The returned state is a complete, valid GameState.
 * The input state is not modified.
 *
 * @param state - The current game state (immutable).
 * @param action - The validated action to apply.
 * @returns ReducerResult with the new state and events.
 *
 * @example
 * ```typescript
 * const result = reduce(gameState, {
 *   type: 'PLAY_CARDS',
 *   playerId: 'alice',
 *   cardIds: ['hearts_7'],
 * });
 * // result.newState is the updated game state
 * // result.events describes what happened
 * ```
 */
export function reduce(state: GameState, action: GameAction): ReducerResult {
  switch (action.type) {
    case 'PLAY_CARDS':
      return reducePlayCards(state, action);

    case 'PLAY_BLIND':
      return reducePlayBlind(state, action);

    case 'PICK_UP_PILE':
      return reducePickUpPile(state, action);

    case 'DECLARE_DIRECTION':
      return reduceDeclareDirection(state, action);

    case 'TIMEOUT_FORFEIT':
      return reduceTimeoutForfeit(state, action);

    case 'CANCEL_GAME':
      return reduceCancelGame(state, action);

    default: {
      // Exhaustive check
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
