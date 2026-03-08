---
name: observability-monitoring
description: Observability stack patterns for Node.js/TypeScript applications using OpenTelemetry, Prometheus, Jaeger, and Grafana Loki. Covers distributed tracing, metrics instrumentation, structured logging, alerting rules, and dashboard design. Use this skill whenever instrumenting code with traces or metrics, setting up OpenTelemetry, defining Prometheus metrics, configuring structured logging with Pino, designing alerting rules, or when the user asks about observability architecture, the three pillars (logs, metrics, traces), dashboard design, or incident investigation tooling. Also activate when correlating logs with traces, implementing custom spans, or setting up Grafana dashboards.
origin: ECC
---

# Observability & Monitoring

Production patterns for the three pillars of observability — traces, metrics, and logs — unified through OpenTelemetry. These conventions ensure you can understand, debug, and operate your system in production.

## When to Activate

- Instrumenting code with traces or metrics
- Setting up OpenTelemetry SDK
- Defining Prometheus metrics
- Configuring structured logging
- Designing alerting rules
- Building Grafana dashboards
- Investigating production incidents

## The Three Pillars

| Pillar | Tool | What It Answers |
|--------|------|-----------------|
| **Traces** | Jaeger (via OpenTelemetry) | Where did this request spend its time? |
| **Metrics** | Prometheus (via OpenTelemetry) | How is the system performing over time? |
| **Logs** | Grafana Loki (via Pino) | What exactly happened in this specific request? |

They work together: a metric alert fires → you find the trace → you read the logs for that trace ID. The trace ID is the thread that connects all three.

## OpenTelemetry Setup

Initialize OpenTelemetry before any other imports. The SDK must be loaded first to instrument HTTP, Express, PostgreSQL, Redis, and Socket.IO.

```typescript
// src/instrumentation.ts — loaded FIRST via --require or --import
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-grpc';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]: 'sbobuz-server',
    [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4317',
    }),
    exportIntervalMillis: 15_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => {
  sdk.shutdown().then(() => process.exit(0));
});
```

Load with:
```bash
node --import ./src/instrumentation.ts dist/main.js
```

### Auto-Instrumented Libraries

The auto-instrumentations package automatically creates spans for:
- HTTP incoming requests (`@opentelemetry/instrumentation-http`)
- Express route matching and middleware (`@opentelemetry/instrumentation-express`)
- PostgreSQL queries (`@opentelemetry/instrumentation-pg`)
- Redis commands (`@opentelemetry/instrumentation-ioredis`)
- Socket.IO events (`@opentelemetry/instrumentation-socket.io`)

You get distributed tracing across these boundaries without writing any span code.

## Custom Spans

Add manual spans for business logic that auto-instrumentation doesn't cover.

```typescript
import { trace, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('game-engine');

export function applyAction(state: GameState, action: GameAction): GameState {
  return tracer.startActiveSpan('game_engine.apply_action', (span) => {
    try {
      span.setAttribute('game.id', state.id);
      span.setAttribute('game.action_type', action.type);
      span.setAttribute('game.player_id', action.playerId);

      const newState = reducer(state, action);

      span.setAttribute('game.phase', newState.phase);
      span.setStatus({ code: SpanStatusCode.OK });
      return newState;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
```

### When to Add Custom Spans

- Game engine actions (validate, apply, resolve effects)
- Business logic operations (create room, start game, calculate ratings)
- External service calls not auto-instrumented
- Long-running operations you want to profile

### When NOT to Add Custom Spans

- Simple getters or trivial logic
- Every function call — spans have overhead, use them for meaningful operations
- Anything auto-instrumentation already covers

## Metrics

### Metric Types

| Type | Use For | Example |
|------|---------|---------|
| **Counter** | Things that only go up | Requests total, errors total, games completed |
| **Histogram** | Distribution of values | Request duration, game duration, AI move latency |
| **Gauge** | Current value (can go up/down) | Active connections, active games, pool size |

### Defining Metrics

```typescript
// src/shared/metrics.ts
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('sbobuz-server');

// System metrics
export const httpRequestDuration = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request duration in milliseconds',
  unit: 'ms',
});

export const httpRequestsTotal = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
});

export const wsConnectionsActive = meter.createUpDownCounter('ws_connections_active', {
  description: 'Currently active WebSocket connections',
});

// Business metrics
export const gamesActive = meter.createUpDownCounter('sbobuz_games_active', {
  description: 'Currently active games',
});

export const gamesCompletedTotal = meter.createCounter('sbobuz_games_completed_total', {
  description: 'Total completed games',
});

export const gameDuration = meter.createHistogram('sbobuz_game_duration_seconds', {
  description: 'Game duration in seconds',
  unit: 's',
});

export const gameActionDuration = meter.createHistogram('sbobuz_game_action_duration_ms', {
  description: 'Time to process a game action',
  unit: 'ms',
});

// Error metrics
export const errorsTotal = meter.createCounter('sbobuz_errors_total', {
  description: 'Total errors by module and code',
});
```

### Recording Metrics

```typescript
// In middleware
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = performance.now();

  res.on('finish', () => {
    const duration = performance.now() - start;
    httpRequestDuration.record(duration, {
      method: req.method,
      route: req.route?.path ?? 'unknown',
      status: String(res.statusCode),
    });
    httpRequestsTotal.add(1, {
      method: req.method,
      status: String(res.statusCode),
    });
  });

  next();
}

// In game engine
gamesActive.add(1);
// ... later when game ends:
gamesActive.add(-1);
gamesCompletedTotal.add(1, { outcome: 'finished' });
gameDuration.record(durationSeconds);
```

### Metric Naming Conventions

- Use snake_case: `http_request_duration_ms`, not `httpRequestDurationMs`
- Include unit in name: `_ms`, `_seconds`, `_bytes`, `_total`
- Prefix business metrics with app name: `sbobuz_games_active`
- Use labels for dimensions (method, status, module), not separate metrics

## Structured Logging

See the `typescript-node-backend` skill for Pino setup. Key additions for observability:

### Trace Context in Logs

Inject trace ID and span ID into every log line. This lets you jump from a log entry to the corresponding trace in Jaeger.

```typescript
import { trace, context } from '@opentelemetry/api';
import pino from 'pino';

// Custom Pino mixin that adds trace context
export const logger = pino({
  mixin() {
    const span = trace.getSpan(context.active());
    if (span) {
      const ctx = span.spanContext();
      return {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
      };
    }
    return {};
  },
});
```

Now every log line automatically includes `traceId` and `spanId`:
```json
{
  "level": "info",
  "msg": "game_started",
  "traceId": "abc123...",
  "spanId": "def456...",
  "gameId": "game-789",
  "playerCount": 3
}
```

### Log Levels

| Level | Use For | Alert? |
|-------|---------|--------|
| `debug` | Development-only detail (variable values, flow tracing) | No |
| `info` | Business events (user registered, game started, game ended) | No |
| `warn` | Recoverable problems (rate limited, invalid token, reconnection) | Maybe |
| `error` | Failures needing investigation (unhandled error, DB timeout) | Yes |

## Alerting Rules

### Critical (Page Immediately)

```yaml
# prometheus/rules/critical.yml
groups:
  - name: critical
    rules:
      - alert: HighErrorRate
        expr: rate(sbobuz_errors_total[5m]) > 10
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate exceeds 10/min for 5 minutes"

      - alert: GameEngineError
        expr: increase(sbobuz_errors_total{module="game-engine"}[1m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Game engine error detected — investigate immediately"

      - alert: DatabaseDown
        expr: pg_up == 0
        for: 1m
        labels:
          severity: critical

      - alert: RedisDown
        expr: redis_up == 0
        for: 1m
        labels:
          severity: critical
```

### Warning (Investigate Soon)

```yaml
      - alert: HighRequestLatency
        expr: histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m])) > 500
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "p99 request latency exceeds 500ms"

      - alert: EventLoopLag
        expr: histogram_quantile(0.99, rate(nodejs_eventloop_lag_seconds_bucket[2m])) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Event loop lag exceeds 100ms — possible CPU saturation"
```

### Alerting Rules

- Alert on symptoms (high latency, error rate), not causes (CPU usage alone)
- Include runbook links in annotations
- Set appropriate `for` duration to avoid flapping alerts
- Critical alerts must page. Warning alerts can go to a channel.

## Sampling Strategy

| Environment | Trace Sample Rate | Rationale |
|-------------|-------------------|-----------|
| Development | 100% (1.0) | See every trace for debugging |
| Staging | 100% (1.0) | Full visibility for testing |
| Production | 10% (0.1) | Balance visibility vs cost |

Force-sample all errored traces regardless of rate — you always want traces for failures.

## Dashboard Design

### System Overview Dashboard

- Request rate (requests/sec) over time
- Request latency (p50, p95, p99) over time
- Error rate (errors/sec) over time
- Active WebSocket connections
- Event loop lag
- Database connection pool utilization

### Game Activity Dashboard

- Active games (gauge)
- Games started/completed per minute
- Game duration distribution
- Actions per game
- Room creation rate
- Sbobuz events (pile clears, direction changes)

## Checklist

Before shipping observable code:

- [ ] OpenTelemetry SDK initialized before all other imports
- [ ] Auto-instrumentation covers HTTP, Express, PostgreSQL, Redis, Socket.IO
- [ ] Custom spans for business logic operations
- [ ] Metrics defined for system health and business KPIs
- [ ] Trace context (traceId, spanId) injected into all log lines
- [ ] Structured JSON logging via Pino — no `console.log`
- [ ] Alerting rules for critical and warning conditions
- [ ] Sampling rate configured per environment
- [ ] Error spans recorded with exception details
- [ ] Dashboard for system overview and game activity
