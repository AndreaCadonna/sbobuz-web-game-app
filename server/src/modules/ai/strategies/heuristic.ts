/**
 * Heuristic Strategy (MEDIUM difficulty).
 *
 * Scores all legal moves using a weighted heuristic function, then picks
 * the highest-scoring move with small random variance for unpredictability.
 *
 * @see docs/specs/ai-opponent-module.md Section 3.2 (Heuristic Strategy)
 */

import type { Card, Rank } from '@shared/card.js';
import type { GameAction, PlayCardsAction } from '@shared/game-action.js';
import type { GameState, PlayerState } from '@shared/game-state.js';

import { createRng, nextFloat } from '../../game-engine/rng.js';
import { getActiveZone } from '../../game-engine/active-zone.js';
import type { AIStrategy, MoveEvaluation } from '../ai.types.js';

// ---------------------------------------------------------------------------
// Heuristic Weights
// ---------------------------------------------------------------------------

const WEIGHTS = {
  cardValueConservation: 10,
  cardValueHighPenalty: -5,
  specialCard2LargePile: 8,
  specialCard2SmallPile: -3,
  specialCardJokerBenefit: 15,
  pileClearKingLargePile: 25,
  pileClearKingSmallPile: 5,
  sbobuzSetup: 20,
  sbobuzCompletion: 40,
  avoidLargePickupPerCard: -3,
  avoidSmallPickup: -2,
  handSizeReduction: 8,
  opponentPressure: 5,
  faceDownZoneEntry: 12,
  multiCardBonus: 6,
} as const;

// ---------------------------------------------------------------------------
// Rank Helpers
// ---------------------------------------------------------------------------

const RANK_VALUES: Record<Rank, number> = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
  '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

function rankValue(rank: Rank): number {
  return RANK_VALUES[rank] ?? 0;
}

function isLowCard(rank: Rank): boolean {
  return rankValue(rank) <= 7;
}

function isHighCard(rank: Rank): boolean {
  return rankValue(rank) >= 11; // J, Q, K, A
}

function isSpecialCard(rank: Rank): boolean {
  return rank === '2' || rank === 'K' || rank === 'Q';
}

/**
 * Get the rank of cards being played, if applicable.
 */
function getPlayedRank(action: GameAction, state: GameState): Rank | null {
  if (action.type !== 'PLAY_CARDS') return null;
  const playAction = action as PlayCardsAction;
  const player = state.players.find((p) => p.id === action.playerId);
  if (!player) return null;

  const drawPileEmpty = state.drawPile.length === 0;
  const zone = getActiveZone(player, drawPileEmpty);
  const sourceCards = zone === 'hand' ? player.hand : player.faceUpCards;

  const card = sourceCards.find((c) => c.id === playAction.cardIds[0]);
  if (!card || card.type === 'joker') return null;
  return card.rank;
}

/**
 * Count how many of the same rank are on top of the pile.
 */
function countTopOfPileRank(pile: ReadonlyArray<Card>): { rank: Rank | null; count: number } {
  if (pile.length === 0) return { rank: null, count: 0 };

  const topCard = pile[pile.length - 1]!;
  if (topCard.type === 'joker') return { rank: null, count: 0 };
  const topRank = topCard.rank;

  let count = 0;
  for (let i = pile.length - 1; i >= 0; i--) {
    const card = pile[i]!;
    if (card.type === 'joker') break;
    if (card.rank === topRank) {
      count++;
    } else {
      break;
    }
  }

  return { rank: topRank, count };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function scoreAction(
  action: GameAction,
  state: GameState,
  playerId: string,
): number {
  let score = 0;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 0;

  const pileSize = state.playPile.length;
  const drawPileEmpty = state.drawPile.length === 0;
  const zone = getActiveZone(player, drawPileEmpty);

  if (action.type === 'PICK_UP_PILE') {
    // Penalize picking up based on pile size
    if (pileSize <= 2) {
      score += WEIGHTS.avoidSmallPickup;
    } else {
      score += WEIGHTS.avoidLargePickupPerCard * pileSize;
    }
    return score;
  }

  if (action.type === 'DECLARE_DIRECTION') {
    // Score direction declaration based on hand composition
    return scoreDirectionDeclaration(action.direction, player, state);
  }

  if (action.type === 'PLAY_BLIND') {
    // All face-down positions are equally unknown
    return 0;
  }

  if (action.type !== 'PLAY_CARDS') return 0;

  const playAction = action as PlayCardsAction;
  const cardCount = playAction.cardIds.length;
  const rank = getPlayedRank(action, state);

  // Check if a card is a joker
  const sourceCards = zone === 'hand' ? player.hand : player.faceUpCards;
  const playedCards = playAction.cardIds.map((id) => sourceCards.find((c) => c.id === id)).filter(Boolean) as Card[];
  const isJoker = playedCards.some((c) => c.type === 'joker');

  if (isJoker) {
    // Joker scoring - special card timing
    score += WEIGHTS.specialCardJokerBenefit;
  } else if (rank) {
    // Card value conservation
    if (isLowCard(rank)) {
      score += WEIGHTS.cardValueConservation * cardCount;
    }
    if (isHighCard(rank) && !isSpecialCard(rank)) {
      score += WEIGHTS.cardValueHighPenalty * cardCount;
    }

    // Special card timing
    if (rank === '2') {
      if (pileSize >= 5) {
        score += WEIGHTS.specialCard2LargePile;
      } else if (pileSize < 3) {
        score += WEIGHTS.specialCard2SmallPile;
      }
    }

    // King pile clear
    if (rank === 'K') {
      if (pileSize >= 4) {
        score += WEIGHTS.pileClearKingLargePile;
      } else {
        score += WEIGHTS.pileClearKingSmallPile;
      }
    }

    // Sbobuz setup/completion
    const pileTop = countTopOfPileRank(state.playPile);
    if (pileTop.rank === rank) {
      const totalSameRank = pileTop.count + cardCount;
      if (totalSameRank >= 4) {
        score += WEIGHTS.sbobuzCompletion;
      } else if (totalSameRank === 3) {
        score += WEIGHTS.sbobuzSetup;
      }
    }
  }

  // Multi-card bonus
  if (cardCount > 1) {
    score += WEIGHTS.multiCardBonus * (cardCount - 1);
  }

  // Hand size reduction
  score += WEIGHTS.handSizeReduction * cardCount;

  // Opponent pressure: bonus when any opponent is close to winning
  for (const opponent of state.players) {
    if (opponent.id === playerId) continue;
    const totalCards = opponent.hand.length + opponent.faceUpCards.length + opponent.faceDownCards.length;
    if (totalCards <= 3) {
      score += WEIGHTS.opponentPressure;
    }
  }

  // Face-down zone entry bonus
  if (zone === 'faceUp') {
    const remainingFaceUp = sourceCards.length - cardCount;
    if (remainingFaceUp === 0 && drawPileEmpty) {
      score += WEIGHTS.faceDownZoneEntry;
    }
  }

  return score;
}

function scoreDirectionDeclaration(
  direction: 'higher' | 'lower',
  player: PlayerState,
  _state: GameState,
): number {
  // Count low vs high cards in hand to determine which direction benefits the AI
  let lowCount = 0;
  let highCount = 0;

  for (const card of player.hand) {
    if (card.type === 'joker') continue;
    if (isLowCard(card.rank)) lowCount++;
    else if (isHighCard(card.rank)) highCount++;
  }

  if (direction === 'lower') {
    // Prefer lower if we hold mostly low cards
    return lowCount > highCount ? 10 : -5;
  } else {
    // Prefer higher if we hold mostly high cards, or default
    return highCount >= lowCount ? 5 : -3;
  }
}

// ---------------------------------------------------------------------------
// Strategy Implementation
// ---------------------------------------------------------------------------

/**
 * Evaluate all legal moves with heuristic scoring and select the best.
 */
export function selectHeuristicMove(
  gameState: GameState,
  playerId: string,
  legalMoves: ReadonlyArray<GameAction>,
): MoveEvaluation {
  const startTime = performance.now();

  if (legalMoves.length === 0) {
    throw new Error('No legal moves available for heuristic strategy');
  }

  if (legalMoves.length === 1) {
    return {
      action: legalMoves[0]!,
      score: 50,
      reasoning: 'Only one legal move available',
      evaluationTimeMs: performance.now() - startTime,
      movesConsidered: 1,
    };
  }

  // Score all moves
  const scored = legalMoves.map((action) => ({
    action,
    score: scoreAction(action, gameState, playerId),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Add random variance to top 3 moves
  const seed = gameState.rngSeed + gameState.actionCount + 1000;
  let rng = createRng(seed);
  const topN = Math.min(3, scored.length);

  for (let i = 0; i < topN; i++) {
    const result = nextFloat(rng);
    rng = result.nextRng;
    // Variance in [-5, +5]
    const variance = (result.value * 10) - 5;
    scored[i]!.score += variance;
  }

  // Re-sort after variance
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0]!;

  // Normalize score to 0-100 range for logging
  const normalizedScore = Math.max(0, Math.min(100, best.score + 50));

  return {
    action: best.action,
    score: normalizedScore,
    reasoning: `Heuristic score: ${best.score.toFixed(1)} (${scored.length} moves evaluated)`,
    evaluationTimeMs: performance.now() - startTime,
    movesConsidered: scored.length,
  };
}

/**
 * Create the Heuristic strategy instance.
 */
export function createHeuristicStrategy(): AIStrategy {
  return {
    id: 'heuristic',
    name: 'Heuristic Strategy',
    difficulty: 'MEDIUM',
    evaluateMove: selectHeuristicMove,
  };
}
