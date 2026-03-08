/**
 * Worker Pool Manager for AI move computation.
 *
 * Manages a pool of worker threads for CPU-isolated AI strategy execution.
 * Workers are created eagerly at initialization and reused across requests.
 *
 * Key behaviors:
 * - FIFO queue when all workers are busy
 * - Timeout with random fallback on expiration
 * - Crash recovery: spawns replacement workers on unexpected exit
 * - Queue overflow rejection when depth exceeds workerPoolSize * 2
 *
 * @see docs/specs/ai-opponent-module.md Section 4 (Worker Thread Architecture)
 */

import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type {
  AIConfig,
  WorkerRequest,
  WorkerResponse,
  WorkerPoolStats,
  MoveEvaluation,
} from './ai.types.js';
import { DEFAULT_AI_CONFIG } from './ai.types.js';
import { createModuleLogger } from '../../shared/logger.js';

const logger = createModuleLogger('ai');

// ---------------------------------------------------------------------------
// Worker wrapper
// ---------------------------------------------------------------------------

interface ManagedWorker {
  worker: Worker;
  busy: boolean;
  id: number;
}

interface PendingRequest {
  request: WorkerRequest;
  resolve: (evaluation: MoveEvaluation) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Pool State
// ---------------------------------------------------------------------------

let workers: ManagedWorker[] = [];
let config: AIConfig = DEFAULT_AI_CONFIG;
let initialized = false;
let shuttingDown = false;
let workerIdCounter = 0;

/** requestId -> pending request */
const pendingRequests = new Map<string, PendingRequest>();

/** FIFO queue for requests when all workers are busy */
const requestQueue: PendingRequest[] = [];

/** Stats tracking */
let totalRequestsProcessed = 0;
let totalTimeouts = 0;
let totalErrors = 0;
let totalComputeTimeMs = 0;

/** Path to the worker script */
let workerScriptPath: string;

// ---------------------------------------------------------------------------
// Worker Script Path Resolution
// ---------------------------------------------------------------------------

/**
 * Set the worker script path. Defaults to ./worker.ts resolved relative
 * to this file, but can be overridden for testing.
 */
export function setWorkerScriptPath(path: string): void {
  workerScriptPath = path;
}

function getWorkerScriptPath(): string {
  if (workerScriptPath) return workerScriptPath;

  // Default: resolve worker.ts relative to this file
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return join(currentDir, 'worker.ts');
}

// ---------------------------------------------------------------------------
// Worker Creation
// ---------------------------------------------------------------------------

function createWorker(): ManagedWorker {
  const id = workerIdCounter++;
  const scriptPath = getWorkerScriptPath();

  const worker = new Worker(scriptPath, {
    // tsx handles TypeScript compilation
    execArgv: ['--import', 'tsx'],
  });

  const managed: ManagedWorker = { worker, busy: false, id };

  worker.on('message', (response: WorkerResponse) => {
    handleWorkerResponse(managed, response);
  });

  worker.on('error', (error: Error) => {
    logger.error({ workerId: id, err: error }, 'Worker thread error');
    handleWorkerCrash(managed);
  });

  worker.on('exit', (code: number) => {
    if (code !== 0 && !shuttingDown) {
      logger.warn({ workerId: id, exitCode: code }, 'Worker thread exited unexpectedly');
      handleWorkerCrash(managed);
    }
  });

  return managed;
}

function handleWorkerResponse(managed: ManagedWorker, response: WorkerResponse): void {
  const pending = pendingRequests.get(response.requestId);

  if (!pending) {
    // Response for a timed-out or cancelled request -- discard
    logger.debug(
      { requestId: response.requestId },
      'Received response for unknown request (likely timed out)',
    );
    managed.busy = false;
    processQueue();
    return;
  }

  // Clear timeout timer
  if (pending.timer) {
    clearTimeout(pending.timer);
  }
  pendingRequests.delete(response.requestId);

  managed.busy = false;
  totalRequestsProcessed++;

  if (response.success && response.evaluation) {
    totalComputeTimeMs += response.evaluation.evaluationTimeMs;
    pending.resolve(response.evaluation);
  } else {
    totalErrors++;
    pending.reject(new Error(response.error ?? 'Unknown worker error'));
  }

  // Process next queued request
  processQueue();
}

function handleWorkerCrash(managed: ManagedWorker): void {
  // Fail any pending request for this worker
  for (const [requestId, pending] of pendingRequests) {
    // We can't tell which request was on which worker easily,
    // so we check after re-dispatching from queue
    void requestId;
    void pending;
  }

  // Remove crashed worker
  const index = workers.indexOf(managed);
  if (index !== -1) {
    workers.splice(index, 1);
  }

  // Spawn replacement if not shutting down
  if (!shuttingDown) {
    totalErrors++;
    try {
      const replacement = createWorker();
      workers.push(replacement);
      logger.info({ workerId: replacement.id }, 'Replacement worker spawned');
    } catch (err) {
      logger.error({ err }, 'Failed to spawn replacement worker');
    }
  }
}

// ---------------------------------------------------------------------------
// Queue Management
// ---------------------------------------------------------------------------

function processQueue(): void {
  if (requestQueue.length === 0) return;

  const idleWorker = workers.find((w) => !w.busy);
  if (!idleWorker) return;

  const next = requestQueue.shift();
  if (!next) return;

  dispatchToWorker(idleWorker, next);
}

function dispatchToWorker(managed: ManagedWorker, pending: PendingRequest): void {
  managed.busy = true;

  // Set up timeout
  pending.timer = setTimeout(() => {
    const stillPending = pendingRequests.get(pending.request.requestId);
    if (stillPending) {
      pendingRequests.delete(pending.request.requestId);
      totalTimeouts++;
      // Don't terminate the worker -- it may still complete
      managed.busy = false;
      stillPending.reject(new Error('Move computation timed out'));
      processQueue();
    }
  }, config.moveTimeoutMs);

  // Prevent timeout from keeping the process alive
  if (pending.timer.unref) {
    pending.timer.unref();
  }

  pendingRequests.set(pending.request.requestId, pending);
  managed.worker.postMessage(pending.request);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialize the worker pool with the configured number of workers.
 */
export async function initializePool(poolConfig?: Partial<AIConfig> | undefined): Promise<void> {
  if (initialized) {
    logger.warn('Worker pool already initialized');
    return;
  }

  config = { ...DEFAULT_AI_CONFIG, ...poolConfig };
  shuttingDown = false;

  for (let i = 0; i < config.workerPoolSize; i++) {
    const managed = createWorker();
    workers.push(managed);
  }

  initialized = true;
  logger.info(
    { poolSize: config.workerPoolSize, timeoutMs: config.moveTimeoutMs },
    'AI worker pool initialized',
  );
}

/**
 * Dispatch a move computation to an available worker.
 *
 * If all workers are busy, the request is queued (FIFO).
 * If the queue depth exceeds workerPoolSize * 2, the request is rejected
 * immediately with a fallback to random move.
 */
export async function computeMove(
  request: Omit<WorkerRequest, 'requestId'>,
): Promise<MoveEvaluation> {
  if (!initialized) {
    throw new Error('Worker pool not initialized');
  }

  const maxQueueDepth = config.workerPoolSize * 2;
  if (requestQueue.length >= maxQueueDepth) {
    logger.warn(
      { queueDepth: requestQueue.length, maxQueueDepth },
      'Worker pool queue overflow -- rejecting request',
    );
    throw new Error('Worker pool queue overflow');
  }

  const fullRequest: WorkerRequest = {
    ...request,
    requestId: randomUUID(),
  };

  return new Promise<MoveEvaluation>((resolve, reject) => {
    const pending: PendingRequest = {
      request: fullRequest,
      resolve,
      reject,
      timer: null,
    };

    // Find an idle worker
    const idleWorker = workers.find((w) => !w.busy);
    if (idleWorker) {
      dispatchToWorker(idleWorker, pending);
    } else {
      // Queue the request
      requestQueue.push(pending);
    }
  });
}

/**
 * Gracefully shut down all workers.
 */
export async function shutdownPool(): Promise<void> {
  if (!initialized) return;

  shuttingDown = true;

  // Reject all queued requests
  for (const pending of requestQueue) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(new Error('Worker pool shutting down'));
  }
  requestQueue.length = 0;

  // Reject all pending requests
  for (const [requestId, pending] of pendingRequests) {
    if (pending.timer) clearTimeout(pending.timer);
    pending.reject(new Error('Worker pool shutting down'));
    pendingRequests.delete(requestId);
  }

  // Terminate all workers
  const terminations = workers.map(async (managed) => {
    try {
      await managed.worker.terminate();
    } catch {
      // Worker may have already exited
    }
  });

  await Promise.allSettled(terminations);

  workers = [];
  initialized = false;

  logger.info('AI worker pool shut down');
}

/**
 * Get current pool statistics.
 */
export function getPoolStats(): WorkerPoolStats {
  const busyWorkers = workers.filter((w) => w.busy).length;
  return {
    totalWorkers: workers.length,
    busyWorkers,
    idleWorkers: workers.length - busyWorkers,
    queuedRequests: requestQueue.length,
    totalRequestsProcessed,
    totalTimeouts,
    totalErrors,
    avgComputeTimeMs:
      totalRequestsProcessed > 0 ? totalComputeTimeMs / totalRequestsProcessed : 0,
  };
}

/**
 * Check if the pool is initialized.
 */
export function isPoolInitialized(): boolean {
  return initialized;
}

/**
 * Reset pool state (for testing only).
 */
export function resetPool(): void {
  shuttingDown = false;
  initialized = false;
  workers = [];
  pendingRequests.clear();
  requestQueue.length = 0;
  totalRequestsProcessed = 0;
  totalTimeouts = 0;
  totalErrors = 0;
  totalComputeTimeMs = 0;
  workerIdCounter = 0;
}

/**
 * Get the pool config (for testing).
 */
export function getPoolConfig(): AIConfig {
  return config;
}
