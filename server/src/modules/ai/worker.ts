/**
 * AI Worker Thread Script.
 *
 * Runs inside a Node.js worker thread. Receives game state and legal moves,
 * executes the requested strategy, and returns the chosen action.
 *
 * Workers are stateless -- every request includes the full game state.
 * All strategy implementations are loaded eagerly on worker startup.
 *
 * @see docs/specs/ai-opponent-module.md Section 4 (Worker Thread Architecture)
 */

import { parentPort } from 'node:worker_threads';

import type {
  WorkerRequest,
  WorkerResponse,
  AIStrategy,
  AIStrategyId,
} from './ai.types.js';
import { createRandomStrategy } from './strategies/random.js';
import { createHeuristicStrategy } from './strategies/heuristic.js';

// ---------------------------------------------------------------------------
// Strategy Registry
// ---------------------------------------------------------------------------

const strategies: Map<AIStrategyId, AIStrategy> = new Map();

function loadStrategies(): void {
  const random = createRandomStrategy();
  const heuristic = createHeuristicStrategy();

  strategies.set(random.id, random);
  strategies.set(heuristic.id, heuristic);
}

// Load all strategies eagerly at worker startup
loadStrategies();

// ---------------------------------------------------------------------------
// Message Handler
// ---------------------------------------------------------------------------

if (parentPort) {
  parentPort.on('message', (request: WorkerRequest) => {
    const response = handleRequest(request);
    parentPort!.postMessage(response);
  });
}

function handleRequest(request: WorkerRequest): WorkerResponse {
  try {
    const strategy = strategies.get(request.strategyId);
    if (!strategy) {
      return {
        requestId: request.requestId,
        success: false,
        error: `Unknown strategy: ${request.strategyId}`,
      };
    }

    if (request.legalMoves.length === 0) {
      return {
        requestId: request.requestId,
        success: false,
        error: 'No legal moves available',
      };
    }

    const evaluation = strategy.evaluateMove(
      request.gameState,
      request.playerId,
      request.legalMoves,
    );

    return {
      requestId: request.requestId,
      success: true,
      evaluation,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      requestId: request.requestId,
      success: false,
      error: `Strategy execution error: ${message}`,
    };
  }
}

/**
 * Exported for direct testing without worker threads.
 */
export { handleRequest, strategies, loadStrategies };
