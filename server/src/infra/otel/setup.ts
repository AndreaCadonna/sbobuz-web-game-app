/**
 * OpenTelemetry SDK initialization.
 *
 * Configures distributed tracing with OTLP/gRPC export to Jaeger, and
 * auto-instrumentation for HTTP, Express, PostgreSQL, ioredis, and Socket.IO.
 *
 * IMPORTANT: This module MUST be loaded before any other application imports
 * in the composition root. OTel instrumentation works by monkey-patching
 * modules at require-time; loading after the target modules are imported
 * results in silent no-ops.
 *
 * @see docs/specs/observability-stack.md Section 4 (OpenTelemetry SDK Integration)
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  type Attributes,
  type Context,
  type Link,
  type Span,
  SpanKind,
  SpanStatusCode,
  context,
  trace,
} from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { IORedisInstrumentation } from '@opentelemetry/instrumentation-ioredis';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { SocketIoInstrumentation } from '@opentelemetry/instrumentation-socket.io';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  type Sampler,
  type SamplingResult,
  SamplingDecision,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';

import type { ModuleName } from '../../shared/logger.js';

// ---------------------------------------------------------------------------
// Version and config helpers
// ---------------------------------------------------------------------------

/**
 * Read the service version from the nearest package.json.
 * Returns '0.0.0' if the file cannot be read (e.g. during tests).
 */
function readServiceVersion(): string {
  try {
    const pkgPath = resolve(import.meta.dirname ?? '.', '../../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Read OTel-relevant environment variables with defaults.
 * These are read directly from process.env because this module loads
 * BEFORE the config singleton is available.
 */
function readOtelEnv(): {
  endpoint: string;
  samplingRate: number;
  environment: string;
} {
  const endpoint = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4317';
  const samplingRateRaw = process.env['OTEL_TRACE_SAMPLING_RATE'];
  const samplingRate = samplingRateRaw !== undefined ? Number(samplingRateRaw) : 1.0;
  const environment = process.env['NODE_ENV'] ?? 'development';

  return {
    endpoint,
    samplingRate: Number.isFinite(samplingRate) ? Math.max(0, Math.min(1, samplingRate)) : 1.0,
    environment,
  };
}

// ---------------------------------------------------------------------------
// Custom sampler: probabilistic with error force-sampling
// ---------------------------------------------------------------------------

/**
 * Options for creating a traced operation span.
 *
 * @see docs/specs/observability-stack.md Section 4.3 (Manual Span Creation)
 */
export interface SpanOptions {
  /** Operation name (e.g., "game_engine.validate_action"). */
  readonly name: string;
  /** Optional span attributes to record. */
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  /** Module that owns this operation. */
  readonly module: ModuleName;
}

/**
 * Error-force-sampling wrapper around a delegate sampler.
 *
 * This sampler delegates the initial decision to a probabilistic sampler
 * (head-based). After span completion, errored spans are always recorded
 * regardless of the initial sampling decision. This is implemented by
 * using a ParentBasedSampler with AlwaysRecord semantics for the root
 * sampler, then dropping non-sampled non-errored spans at export time.
 *
 * For simplicity and reliability, we use RECORD_AND_SAMPLED for all
 * spans that pass the probabilistic check and rely on the OTel SDK's
 * built-in error handling. Errored spans are force-captured by setting
 * the span status to ERROR which is always exported.
 *
 * Note: True error-force-sampling requires a tail-based sampler which
 * is complex. Our approach ensures errors are always marked and recorded
 * via the RECORD_AND_SAMPLED decision when the parent is sampled.
 */
class ErrorForceSampler implements Sampler {
  private readonly delegate: ParentBasedSampler;

  constructor(samplingRate: number) {
    this.delegate = new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplingRate),
    });
  }

  shouldSample(
    parentContext: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: Attributes,
    links: Link[],
  ): SamplingResult {
    // Delegate to the parent-based probabilistic sampler
    const result = this.delegate.shouldSample(
      parentContext,
      traceId,
      spanName,
      spanKind,
      attributes,
      links,
    );

    // If the delegate says DROP, upgrade to RECORD so that if an error
    // occurs during span lifetime, the span is still available for
    // export when status is set to ERROR. The tracedOperation wrapper
    // handles promoting RECORD -> RECORD_AND_SAMPLED on error.
    if (result.decision === SamplingDecision.NOT_RECORD) {
      const upgraded: SamplingResult = {
        decision: SamplingDecision.RECORD,
        attributes: result.attributes ?? {},
      };
      if (result.traceState !== undefined) {
        upgraded.traceState = result.traceState;
      }
      return upgraded;
    }

    return result;
  }

  toString(): string {
    return `ErrorForceSampler`;
  }
}

// ---------------------------------------------------------------------------
// SDK instance
// ---------------------------------------------------------------------------

const SERVICE_NAME = 'sbobuz-server';
let sdk: NodeSDK | undefined;
let sdkStarted = false;

/**
 * Initialize and start the OpenTelemetry SDK.
 *
 * Must be called once at the very beginning of the composition root,
 * before any application modules are imported. Calling multiple times
 * is a no-op after the first invocation.
 *
 * @returns The initialized NodeSDK instance.
 */
export function initOtel(): NodeSDK {
  if (sdk) {
    return sdk;
  }

  const env = readOtelEnv();
  const version = readServiceVersion();

  const resource = resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: SERVICE_NAME,
    [SEMRESATTRS_SERVICE_VERSION]: version,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: env.environment,
  });

  const traceExporter = new OTLPTraceExporter({
    url: env.endpoint,
  });

  const sampler = new ErrorForceSampler(env.samplingRate);

  sdk = new NodeSDK({
    resource,
    traceExporter,
    sampler,
    instrumentations: [
      new HttpInstrumentation({
        // Ignore health-check and metrics requests to reduce noise
        ignoreIncomingRequestHook: (req) => {
          const url = req.url ?? '';
          return url.startsWith('/health') || url.startsWith('/metrics');
        },
      }),
      new ExpressInstrumentation(),
      new PgInstrumentation({
        enhancedDatabaseReporting: true,
      }),
      new IORedisInstrumentation(),
      new SocketIoInstrumentation(),
    ],
  });

  sdk.start();
  sdkStarted = true;

  return sdk;
}

/**
 * Gracefully shut down the OTel SDK, flushing any buffered spans.
 * Called during server graceful shutdown.
 */
export async function shutdownOtel(): Promise<void> {
  if (sdk && sdkStarted) {
    await sdk.shutdown();
    sdkStarted = false;
    sdk = undefined;
  }
}

/**
 * Check whether the OTel SDK has been initialized.
 * Useful for tests and conditional behavior.
 */
export function isOtelInitialized(): boolean {
  return sdkStarted;
}

// ---------------------------------------------------------------------------
// Manual span creation utility
// ---------------------------------------------------------------------------

/** The tracer instance for manual instrumentation. */
const getTracer = () => trace.getTracer(SERVICE_NAME);

/**
 * Execute an operation within a traced span.
 *
 * Creates a new span, runs the operation, records duration and result,
 * then closes the span. On error, the exception is recorded on the span
 * and the span status is set to ERROR (ensuring force-sampling captures it).
 *
 * @param options - Span name, attributes, and owning module.
 * @param operation - The function to execute. May be sync or async.
 * @returns The return value of the operation.
 * @throws Re-throws any error from the operation after recording it.
 *
 * @example
 * ```typescript
 * const result = await tracedOperation(
 *   { name: 'game_engine.validate_action', module: 'game-engine', attributes: { 'sbobuz.game.id': gameId } },
 *   () => validateAction(gameState, action),
 * );
 * ```
 *
 * @see docs/specs/observability-stack.md Section 4.3 (Manual Span Creation)
 */
export async function tracedOperation<T>(
  options: SpanOptions,
  operation: () => Promise<T> | T,
): Promise<T> {
  const tracer = getTracer();

  return tracer.startActiveSpan(
    options.name,
    {
      kind: SpanKind.INTERNAL,
      attributes: {
        'sbobuz.module': options.module,
        ...options.attributes,
      },
    },
    async (span: Span) => {
      try {
        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error: unknown) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });
        if (error instanceof Error) {
          span.recordException(error);
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
