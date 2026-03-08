# Observability Stack -- Traces, Metrics, Logs, and Alerting

> **Document Type:** Architecture Spec
> **Status:** Draft
> **Last Updated:** March 2026

---

## 1. Overview

The Observability Stack provides three pillars of system insight -- distributed traces (Jaeger), quantitative metrics (Prometheus), and structured logs (Grafana Loki) -- unified through a single instrumentation layer (OpenTelemetry SDK) and visualized in Grafana dashboards. Observability is wired in from the first deployment, not bolted on after an incident.

The stack serves a dual purpose. Operationally, it enables detection and diagnosis of system failures, latency regressions, and capacity saturation. Analytically, it provides business visibility into player engagement, game throughput, matchmaking efficiency, and AI performance. Every observable signal carries correlation context -- traceId, userId, roomId, gameId -- enabling a single player action to be followed from WebSocket receipt through game engine processing to broadcast completion.

The OpenTelemetry SDK is the sole instrumentation API in application code. Traces, metrics, and log context all flow through OTel, which exports to each backend. This vendor-neutral approach allows swapping any backend (e.g., replacing Jaeger with Tempo, or Loki with Elasticsearch) without changing application instrumentation.

---

## 2. Data Model

### 2.1 Structured Log Entry

Every log line in the application follows this exact shape. No unstructured logging is permitted. `console.log` is banned in production code; a linting rule enforces this.

```typescript
interface LogEntry {
  // --- Required fields (present on every log line) ---
  timestamp: string;             // ISO 8601 with millisecond precision
  level: LogLevel;               // severity classification
  msg: string;                   // human-readable event name, snake_case
  service: string;               // always "sbobuz-server"
  module: ModuleName;            // which module emitted this log
  traceId: string;               // W3C Trace Context trace ID (32 hex chars)
  spanId: string;                // W3C Trace Context span ID (16 hex chars)

  // --- Contextual fields (present when applicable) ---
  userId?: string;               // authenticated user performing the action
  roomId?: string;               // active room context
  gameId?: string;               // active game context
  requestId?: string;            // unique ID for HTTP requests
  socketId?: string;             // Socket.IO connection ID

  // --- Error fields (present on error/warn logs) ---
  error?: {
    name: string;                // error class name
    message: string;             // error message
    stack?: string;              // stack trace (only in non-production or when level=error)
    code?: string;               // application error code (e.g., "INVALID_MOVE", "AUTH_EXPIRED")
  };

  // --- Performance fields (present on operation completion logs) ---
  durationMs?: number;           // operation latency in milliseconds

  // --- Extensible (event-specific fields) ---
  [key: string]: unknown;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type ModuleName = 'auth' | 'lobby' | 'game-engine' | 'realtime' | 'ai' | 'infra' | 'gateway';
```

### 2.2 Log Level Guidelines

| Level | When to Use | Examples |
|---|---|---|
| **debug** | Verbose operational detail. Disabled in production by default. Enabled per-module via env var. | Card played details, Redis key operations, connection pool checkout |
| **info** | Normal operational events. The narrative of the system operating correctly. | User registered, game started, room created, player joined, action validated |
| **warn** | Unexpected but recoverable situations. Something is off but the system continues. | Rate limit triggered, failed login attempt, WebSocket reconnection, Redis connection retry |
| **error** | Failures requiring attention. Data loss risk, unhandled exceptions, broken invariants. | Database connection failure, game state corruption detected, unhandled exception in request handler |

### 2.3 Metric Types

```typescript
// All metrics follow the OpenTelemetry semantic conventions where applicable.
// Custom metrics use the sbobuz.* namespace.

interface MetricDefinition {
  name: string;                  // dot-separated metric name
  type: 'counter' | 'gauge' | 'histogram';
  unit: string;                  // e.g., "ms", "connections", "games", "1" (dimensionless)
  description: string;
  labels: string[];              // dimension labels
  buckets?: number[];            // histogram bucket boundaries (only for histograms)
}
```

### 2.4 Trace Span Attributes

```typescript
// Standard span attributes applied to all spans
interface BaseSpanAttributes {
  'service.name': 'sbobuz-server';
  'service.version': string;     // from package.json version
  'deployment.environment': 'development' | 'staging' | 'production';
}

// Module-specific span attributes
interface GameEngineSpanAttributes extends BaseSpanAttributes {
  'sbobuz.game.id': string;
  'sbobuz.game.phase': string;
  'sbobuz.game.action_type': string;
  'sbobuz.game.player_count': number;
  'sbobuz.game.action_index': number;
}

interface RealtimeSpanAttributes extends BaseSpanAttributes {
  'sbobuz.ws.room_id': string;
  'sbobuz.ws.event_type': string;
  'sbobuz.ws.client_count': number;
}

interface AuthSpanAttributes extends BaseSpanAttributes {
  'sbobuz.auth.method': 'jwt' | 'refresh' | 'login' | 'register';
  'sbobuz.auth.result': 'success' | 'failure';
}
```

### 2.5 Health Check Response Types

```typescript
// GET /health/live -- Kubernetes liveness probe
// Returns 200 if the process is running. No dependency checks.
interface LivenessResponse {
  status: 'ok';
  uptime: number;                // process uptime in seconds
  timestamp: string;             // ISO 8601
}

// GET /health/ready -- Kubernetes readiness probe
// Returns 200 if all dependencies are connected. Returns 503 if any dependency is down.
interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: {
    postgres: DependencyCheck;
    redis: DependencyCheck;
  };
  timestamp: string;
}

interface DependencyCheck {
  status: 'up' | 'down';
  latencyMs: number;             // ping latency to the dependency
  error?: string;                // error message if status is 'down'
}

// GET /health/capacity -- Load balancer / autoscaler decision support
// Returns 200 with current load metrics. Returns 503 if at capacity.
interface CapacityResponse {
  status: 'accepting' | 'at_capacity';
  activeGames: number;
  activeConnections: number;
  maxGamesPerInstance: number;    // configured limit
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  eventLoopLagMs: number;
  timestamp: string;
}
```

---

## 3. Metrics Catalog

### 3.1 System Metrics

| Metric Name | Type | Unit | Labels | Description | Alert Threshold |
|---|---|---|---|---|---|
| `http_request_duration_ms` | Histogram | ms | `method`, `route`, `status_code` | HTTP request latency distribution | p99 > 500ms for 5 min |
| `http_requests_total` | Counter | requests | `method`, `route`, `status_code` | Total HTTP requests processed | N/A (used for rate calculation) |
| `ws_connections_active` | Gauge | connections | `server_id` | Currently open WebSocket connections | > 5000 per instance |
| `ws_messages_total` | Counter | messages | `event_type`, `direction` | WebSocket messages sent/received | N/A |
| `db_pool_active_connections` | Gauge | connections | `pool_name` | Active PostgreSQL connections in pool | > 80% of max |
| `db_pool_waiting_count` | Gauge | requests | `pool_name` | Requests waiting for a database connection | > 0 for 30 seconds |
| `db_query_duration_ms` | Histogram | ms | `operation`, `table` | PostgreSQL query latency | p99 > 100ms for 5 min |
| `redis_command_duration_ms` | Histogram | ms | `command` | Redis command latency | p99 > 10ms for 5 min |
| `redis_connections_active` | Gauge | connections | `purpose` | Active Redis connections | N/A |
| `event_loop_lag_ms` | Histogram | ms | none | Node.js event loop lag | p99 > 100ms for 2 min |
| `process_memory_bytes` | Gauge | bytes | `type` (rss, heap_used, heap_total) | Process memory usage | heap_used > 80% of heap_total |
| `process_cpu_usage_percent` | Gauge | percent | none | Process CPU usage | > 80% for 5 min |

**Histogram buckets for latency metrics:** `[1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]` milliseconds.

### 3.2 Business Metrics

| Metric Name | Type | Unit | Labels | Description | Alert Threshold |
|---|---|---|---|---|---|
| `sbobuz_games_active` | Gauge | games | `player_count` | Live games currently in progress | N/A (capacity planning) |
| `sbobuz_games_started_total` | Counter | games | `player_count` | Total games that have started | N/A |
| `sbobuz_games_completed_total` | Counter | games | `result` (finished, cancelled) | Completed games by outcome | Cancelled rate > 20% |
| `sbobuz_game_duration_seconds` | Histogram | seconds | `player_count` | Game duration distribution | N/A |
| `sbobuz_game_actions_total` | Counter | actions | `action_type` | Total game actions processed | N/A |
| `sbobuz_game_actions_per_game` | Histogram | actions | `player_count` | Actions per completed game | N/A |
| `sbobuz_rooms_active` | Gauge | rooms | `visibility` | Active rooms in lobby | N/A |
| `sbobuz_matchmaking_queue_depth` | Gauge | players | none | Players waiting for a match | > 50 for 5 min |
| `sbobuz_matchmaking_wait_seconds` | Histogram | seconds | none | Time from queue entry to game start | p95 > 60s |
| `sbobuz_users_registered_total` | Counter | users | none | Total user registrations | N/A |
| `sbobuz_users_active_daily` | Gauge | users | none | Unique users active in last 24h | N/A (product metric) |
| `sbobuz_ai_move_duration_ms` | Histogram | ms | `difficulty` | AI opponent computation time | p99 > 1000ms |
| `sbobuz_ai_moves_total` | Counter | moves | `difficulty` | Total AI moves computed | N/A |

**Histogram buckets for game duration:** `[30, 60, 120, 300, 600, 900, 1800, 3600]` seconds.

### 3.3 Error Metrics

| Metric Name | Type | Unit | Labels | Description | Alert Threshold |
|---|---|---|---|---|---|
| `sbobuz_errors_total` | Counter | errors | `module`, `error_code` | Application errors by module and code | > 10/min for any module |
| `sbobuz_game_engine_errors_total` | Counter | errors | `error_type` | Failed state transitions in the game engine | Any occurrence (critical) |
| `sbobuz_auth_failures_total` | Counter | failures | `reason` (invalid_token, expired, rate_limited) | Authentication failures | > 100/min (possible attack) |
| `sbobuz_ws_disconnects_total` | Counter | disconnects | `reason` (clean, timeout, error) | WebSocket disconnections by cause | Unclean > 10% of total |
| `sbobuz_rate_limit_hits_total` | Counter | hits | `endpoint`, `limit_type` | Rate limit activations | N/A (informational) |
| `sbobuz_unhandled_exceptions_total` | Counter | exceptions | `module` | Unhandled exceptions caught by global handler | Any occurrence (critical) |

### 3.4 Capacity Metrics

| Metric Name | Type | Unit | Labels | Description | Alert Threshold |
|---|---|---|---|---|---|
| `sbobuz_games_per_instance` | Gauge | games | `server_id` | Games running on each instance | > 200 per instance |
| `sbobuz_instance_headroom_percent` | Gauge | percent | `server_id` | Remaining capacity percentage | < 20% |
| `sbobuz_redis_memory_used_bytes` | Gauge | bytes | none | Redis memory consumption | > 80% of max |
| `sbobuz_redis_keys_total` | Gauge | keys | `key_pattern` | Key count by pattern | N/A |
| `sbobuz_postgres_connections_used_percent` | Gauge | percent | none | PostgreSQL connection usage | > 80% |

---

## 4. OpenTelemetry SDK Integration

### 4.1 Initialization

The OTel SDK is initialized once at process startup, before any application modules load. It configures trace, metric, and log exporters.

```typescript
interface OTelConfig {
  serviceName: 'sbobuz-server';
  serviceVersion: string;        // from package.json
  environment: 'development' | 'staging' | 'production';

  tracing: {
    exporter: 'otlp';           // OTLP/gRPC to Jaeger
    endpoint: string;            // e.g., http://jaeger:4317
    samplingRate: number;        // 1.0 in dev/staging, 0.1 in production
  };

  metrics: {
    exporter: 'prometheus';      // Prometheus scrape endpoint
    port: number;                // /metrics endpoint port (default: 9464)
    scrapeIntervalMs: 15000;     // Prometheus scrape interval
  };

  logging: {
    exporter: 'otlp';           // OTLP to Loki via OTel Collector
    endpoint: string;            // e.g., http://otel-collector:4317
    minLevel: LogLevel;          // 'debug' in dev, 'info' in production
  };
}
```

### 4.2 Auto-Instrumentation

The following instrumentations are enabled automatically via OTel SDK plugins. No manual span creation required for these.

| Instrumentation | What It Captures |
|---|---|
| `@opentelemetry/instrumentation-http` | All incoming HTTP requests as root spans |
| `@opentelemetry/instrumentation-express` | Express route matching, middleware timing |
| `@opentelemetry/instrumentation-pg` | PostgreSQL queries as child spans (query text, duration, row count) |
| `@opentelemetry/instrumentation-ioredis` | Redis commands as child spans (command, key, duration) |
| `@opentelemetry/instrumentation-socket.io` | Socket.IO events as spans (event name, room, direction) |

### 4.3 Manual Span Creation

For application-level operations that are not covered by auto-instrumentation, manual spans are created using a wrapper utility.

```typescript
// Usage pattern for manual spans
interface SpanOptions {
  name: string;                  // operation name (e.g., "game_engine.validate_action")
  attributes?: Record<string, string | number | boolean>;
  module: ModuleName;
}

// Wrapper function -- used by all modules
// Creates a span, runs the operation, records duration and result, closes the span.
// On error: records the exception on the span, sets span status to ERROR.
type TracedOperation = <T>(
  options: SpanOptions,
  operation: () => Promise<T> | T,
) => Promise<T>;
```

### 4.4 Trace Context Propagation Across WebSocket

HTTP requests carry trace context via W3C `traceparent` headers automatically. WebSocket messages do not have HTTP headers, so trace context must be propagated manually.

```typescript
// Client sends trace context as part of every WebSocket message payload
interface WebSocketMessage {
  event: string;                 // e.g., "action:play_card"
  data: unknown;                 // event-specific payload
  _trace?: {
    traceId: string;             // 32 hex chars
    spanId: string;              // 16 hex chars
  };
}

// Server extracts trace context from the message and creates a child span
// Flow:
// 1. Client creates a span for "user clicked play card"
// 2. Client attaches traceId + spanId to the WS message
// 3. Server receives message, extracts trace context
// 4. Server creates a child span linked to the client's span
// 5. All downstream operations (validation, state update, broadcast) are child spans
// 6. Result: single trace shows the full journey from click to broadcast
```

### 4.5 Context Injection for Logs

Every log entry automatically includes `traceId` and `spanId` from the active OTel context. This is achieved by wrapping the logger to extract the current span context at log time.

```typescript
// Logger middleware that injects trace context
// Applied once during logger initialization -- all subsequent log calls inherit it.
//
// Implementation note: uses AsyncLocalStorage (Node.js) to access the active span
// without passing context through every function call.

// The logger also injects contextual fields from a request-scoped store:
// - userId (set by auth middleware after JWT validation)
// - roomId (set by room middleware after room resolution)
// - gameId (set by game middleware after game resolution)
//
// These fields appear on every log line emitted during that request/event processing,
// without requiring the application code to pass them explicitly.
```

---

## 5. Dashboard Definitions

### 5.1 System Overview Dashboard

**Purpose:** Single-pane-of-glass for system health. First dashboard opened during an incident.

| Panel | Visualization | Data Source | Query Description |
|---|---|---|---|
| Request Rate | Time series | Prometheus | `rate(http_requests_total[5m])` by status code |
| Request Latency (p50/p95/p99) | Time series | Prometheus | `histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m]))` |
| Error Rate | Time series + threshold line | Prometheus | `rate(sbobuz_errors_total[5m])` by module |
| Active WebSocket Connections | Time series | Prometheus | `ws_connections_active` by server_id |
| Event Loop Lag | Time series | Prometheus | `histogram_quantile(0.99, rate(event_loop_lag_ms_bucket[1m]))` |
| PostgreSQL Pool Utilization | Gauge | Prometheus | `db_pool_active_connections / db_pool_max_connections * 100` |
| Redis Latency | Time series | Prometheus | `histogram_quantile(0.99, rate(redis_command_duration_ms_bucket[5m]))` |
| Memory Usage | Time series | Prometheus | `process_memory_bytes{type="heap_used"}` |

### 5.2 Game Activity Dashboard

**Purpose:** Business and game health visibility.

| Panel | Visualization | Data Source | Query Description |
|---|---|---|---|
| Active Games | Stat (big number) | Prometheus | `sbobuz_games_active` |
| Games Started (24h) | Stat | Prometheus | `increase(sbobuz_games_started_total[24h])` |
| Game Completion Rate | Pie chart | Prometheus | `sbobuz_games_completed_total` by result (finished vs cancelled) |
| Game Duration Distribution | Histogram | Prometheus | `sbobuz_game_duration_seconds_bucket` |
| Actions per Game | Histogram | Prometheus | `sbobuz_game_actions_per_game_bucket` |
| Active Rooms | Time series | Prometheus | `sbobuz_rooms_active` by visibility |
| Matchmaking Wait Time (p95) | Time series | Prometheus | `histogram_quantile(0.95, sbobuz_matchmaking_wait_seconds_bucket)` |
| Matchmaking Queue Depth | Time series | Prometheus | `sbobuz_matchmaking_queue_depth` |
| Daily Active Users | Stat | Prometheus | `sbobuz_users_active_daily` |

### 5.3 Game Engine Performance Dashboard

**Purpose:** Deep dive into game engine internals.

| Panel | Visualization | Data Source | Query Description |
|---|---|---|---|
| Action Processing Latency | Time series | Prometheus | Histogram quantiles of game action processing time |
| Action Types Distribution | Bar chart | Prometheus | `rate(sbobuz_game_actions_total[1h])` by action_type |
| Engine Errors | Table (recent) | Loki | `{module="game-engine"} |= "error"` |
| AI Move Latency | Time series | Prometheus | `sbobuz_ai_move_duration_ms` quantiles by difficulty |
| Sbobuz Events (24h) | Stat | Prometheus | Custom counter for Sbobuz triggers |
| Game State Size | Time series | Prometheus | Average serialized game state size in bytes |
| Turn Timer Expirations | Time series | Prometheus | Rate of TIMEOUT_FORFEIT actions |

### 5.4 Infrastructure Dashboard

**Purpose:** Container and infrastructure health.

| Panel | Visualization | Data Source | Query Description |
|---|---|---|---|
| CPU Usage per Instance | Time series | Prometheus | `process_cpu_usage_percent` by server_id |
| Memory per Instance | Time series | Prometheus | `process_memory_bytes` by server_id |
| Redis Memory Usage | Gauge | Prometheus | `sbobuz_redis_memory_used_bytes / redis_max_memory * 100` |
| Redis Key Count | Table | Prometheus | `sbobuz_redis_keys_total` by key_pattern |
| PostgreSQL Connection Usage | Gauge | Prometheus | `sbobuz_postgres_connections_used_percent` |
| Games per Instance | Bar chart | Prometheus | `sbobuz_games_per_instance` by server_id |
| Instance Headroom | Gauge per instance | Prometheus | `sbobuz_instance_headroom_percent` by server_id |

---

## 6. Alerting Rules

### 6.1 Critical Alerts (Page Immediately)

These alerts indicate service-affecting issues requiring immediate attention.

```yaml
# Alert: High Error Rate
# Any module producing more than 10 errors per minute for 5 consecutive minutes.
- name: high_error_rate
  condition: rate(sbobuz_errors_total[5m]) > 10
  for: 5m
  severity: critical
  summary: "Module {{ $labels.module }} error rate is {{ $value }}/min"
  runbook: docs/runbooks/high-error-rate.md

# Alert: Game Engine Errors
# Any game engine error is critical -- it means the state machine has a bug.
- name: game_engine_error
  condition: increase(sbobuz_game_engine_errors_total[1m]) > 0
  for: 0m
  severity: critical
  summary: "Game engine error detected: {{ $labels.error_type }}"
  runbook: docs/runbooks/game-engine-error.md

# Alert: Unhandled Exception
# Process stability at risk. Should never happen in normal operation.
- name: unhandled_exception
  condition: increase(sbobuz_unhandled_exceptions_total[1m]) > 0
  for: 0m
  severity: critical
  summary: "Unhandled exception in module {{ $labels.module }}"
  runbook: docs/runbooks/unhandled-exception.md

# Alert: Database Down
# Health check reports PostgreSQL unreachable.
- name: database_down
  condition: up{job="sbobuz-health-ready"} == 0
  for: 1m
  severity: critical
  summary: "PostgreSQL is unreachable from the application"
  runbook: docs/runbooks/database-down.md

# Alert: Redis Down
# Health check reports Redis unreachable. Active games at risk.
- name: redis_down
  condition: up{job="sbobuz-health-ready"} == 0
  for: 30s
  severity: critical
  summary: "Redis is unreachable -- active games at risk"
  runbook: docs/runbooks/redis-down.md
```

### 6.2 Warning Alerts (Investigate Within 30 Minutes)

```yaml
# Alert: High Request Latency
- name: high_request_latency
  condition: histogram_quantile(0.99, rate(http_request_duration_ms_bucket[5m])) > 500
  for: 5m
  severity: warning
  summary: "p99 request latency is {{ $value }}ms (threshold: 500ms)"

# Alert: Event Loop Lag
- name: event_loop_lag
  condition: histogram_quantile(0.99, rate(event_loop_lag_ms_bucket[1m])) > 100
  for: 2m
  severity: warning
  summary: "Event loop lag p99 is {{ $value }}ms -- possible CPU saturation"

# Alert: Database Pool Saturation
- name: db_pool_saturation
  condition: db_pool_active_connections / db_pool_max_connections > 0.8
  for: 5m
  severity: warning
  summary: "Database connection pool at {{ $value | humanizePercentage }} utilization"

# Alert: Redis High Memory
- name: redis_high_memory
  condition: sbobuz_redis_memory_used_bytes / redis_max_memory_bytes > 0.8
  for: 5m
  severity: warning
  summary: "Redis memory at {{ $value | humanizePercentage }} of maximum"

# Alert: High Game Cancellation Rate
- name: high_cancellation_rate
  condition: >
    rate(sbobuz_games_completed_total{result="cancelled"}[1h])
    / rate(sbobuz_games_completed_total[1h]) > 0.2
  for: 30m
  severity: warning
  summary: "Game cancellation rate is {{ $value | humanizePercentage }} (threshold: 20%)"

# Alert: High Authentication Failure Rate
- name: high_auth_failures
  condition: rate(sbobuz_auth_failures_total[5m]) > 100
  for: 5m
  severity: warning
  summary: "Authentication failures at {{ $value }}/min -- possible brute force attack"

# Alert: Capacity Approaching Limit
- name: capacity_approaching
  condition: sbobuz_instance_headroom_percent < 20
  for: 10m
  severity: warning
  summary: "Instance {{ $labels.server_id }} headroom at {{ $value }}% -- consider scaling"
```

### 6.3 Informational Alerts (Review During Business Hours)

```yaml
# Alert: High Matchmaking Wait Time
- name: matchmaking_slow
  condition: histogram_quantile(0.95, sbobuz_matchmaking_wait_seconds_bucket) > 60
  for: 15m
  severity: info
  summary: "p95 matchmaking wait time is {{ $value }}s"

# Alert: AI Move Latency High
- name: ai_move_slow
  condition: histogram_quantile(0.99, rate(sbobuz_ai_move_duration_ms_bucket[5m])) > 1000
  for: 10m
  severity: info
  summary: "AI move computation p99 is {{ $value }}ms"
```

---

## 7. Health Check Endpoints

### 7.1 Liveness Probe -- GET /health/live

**Purpose:** Tells Kubernetes the process is running. If this fails, the container is restarted.

**Logic:**
1. Return 200 with `{ status: "ok", uptime, timestamp }`.
2. No dependency checks. If the HTTP handler can respond, the process is alive.
3. If the process is deadlocked or event loop is blocked, it cannot respond, and Kubernetes kills it.

**Configuration:**
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 15
  timeoutSeconds: 3
  failureThreshold: 3
```

### 7.2 Readiness Probe -- GET /health/ready

**Purpose:** Tells Kubernetes the instance is ready to accept traffic. If this fails, the instance is removed from the load balancer but NOT restarted.

**Logic:**
1. Ping PostgreSQL: execute `SELECT 1` and measure latency.
2. Ping Redis: execute `PING` and measure latency.
3. If both succeed with latency < 5000ms: return 200 with `{ status: "ready" }`.
4. If either fails or latency exceeds 5000ms: return 503 with `{ status: "not_ready" }` and detail which dependency is down.

**Configuration:**
```yaml
readinessProbe:
  httpGet:
    path: /health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 2
```

### 7.3 Capacity Probe -- GET /health/capacity

**Purpose:** Provides load metrics for autoscaler and load balancer decisions. Not a Kubernetes probe -- consumed by custom autoscaling logic or monitored by operators.

**Logic:**
1. Count active games on this instance.
2. Count active WebSocket connections.
3. Measure event loop lag (last sampled value).
4. Read CPU and memory usage from process metrics.
5. If `activeGames >= maxGamesPerInstance` OR `eventLoopLagMs > 200` OR `cpuUsagePercent > 90`: return 503 with `{ status: "at_capacity" }`.
6. Otherwise: return 200 with `{ status: "accepting" }` and all metrics.

**maxGamesPerInstance:** 200 (configurable via environment variable).

---

## 8. Processing Logic

### 8.1 Request Tracing Flow

```
1. HTTP request arrives at API Gateway
2. OTel HTTP instrumentation creates ROOT SPAN
   - Attributes: method, route, user-agent
3. Auth middleware validates JWT
   - CHILD SPAN: "auth.validate_token"
   - Injects userId into AsyncLocalStorage context
4. Route handler executes business logic
   - CHILD SPAN: "lobby.create_room" (example)
5. Database query executes
   - CHILD SPAN (auto): "pg.query" with query text and duration
6. Redis operation executes
   - CHILD SPAN (auto): "redis.SET" with key and duration
7. Response sent
   - ROOT SPAN closed with status code and duration
8. All spans exported to Jaeger via OTLP
```

### 8.2 WebSocket Event Tracing Flow

```
1. Client sends WebSocket message with _trace context
2. Socket.IO handler receives message
3. Server creates ROOT SPAN for this event
   - Links to client span via traceId from _trace
   - Attributes: event_type, roomId, userId
4. Game Engine processes action
   - CHILD SPAN: "game_engine.validate_action"
   - CHILD SPAN: "game_engine.apply_action"
5. Redis state update
   - CHILD SPAN (auto): "redis.SET game:{gameId}:state"
6. Broadcast to room
   - CHILD SPAN: "realtime.broadcast"
   - Attributes: recipient_count, message_size_bytes
7. Root span closed
8. All spans exported to Jaeger
```

### 8.3 Log Aggregation Pipeline

```
Application (structured JSON logs to stdout)
  -> Container runtime captures stdout
  -> Promtail (Loki agent) tails container logs
     - Parses JSON
     - Extracts labels: level, module, service
     - Preserves all JSON fields as log line content
  -> Grafana Loki (stores, indexes by labels)
  -> Grafana (query, filter, correlate with traces via traceId)
```

### 8.4 Metric Collection Pipeline

```
Application exposes /metrics endpoint (Prometheus format)
  -> Prometheus scrapes every 15 seconds
  -> Prometheus stores time-series data (15-day retention)
  -> Grafana queries Prometheus for dashboard panels and alerts
  -> Alertmanager receives alert triggers from Prometheus
     - Routes to configured notification channel (email, Slack, PagerDuty)
```

---

## 9. Edge Cases and Test Scenarios

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | OTel Collector is unreachable at startup | Application starts and runs normally. Traces and logs are dropped silently. Metrics still served via /metrics endpoint (Prometheus pull model is independent). Warn log emitted once: "OTel Collector unreachable, traces will be dropped." |
| 2 | Prometheus fails to scrape /metrics | No impact on application. Metrics accumulate in memory. Next successful scrape picks up the latest values. If prolonged, memory grows -- but Prometheus typically recovers within seconds. |
| 3 | Grafana is down | No impact on application or data collection. Traces, metrics, and logs continue to be collected. Dashboards and alerts are unavailable until Grafana recovers. |
| 4 | Very long game (500+ actions) generates very long trace | Trace sampling rate of 0.1 in production means only 10% of traces are collected. Long games that ARE sampled produce traces with many spans -- Jaeger handles this natively. No span limit configured. |
| 5 | Burst of errors overwhelms Loki ingestion | Loki is configured with per-tenant rate limits. Logs exceeding the rate are dropped with a 429 response to Promtail. Promtail buffers and retries. Critical: error metrics in Prometheus still capture the error count even if log lines are dropped. |
| 6 | Client sends WebSocket message without _trace context | Server creates a new root span (no parent link). The trace captures server-side processing only. Correlation is still possible via userId and gameId labels on the span. No error -- missing _trace is handled gracefully. |
| 7 | Health check latency spikes due to database slowness | /health/ready reports degraded state. If PostgreSQL ping exceeds 5000ms, the check returns 503. Kubernetes removes the instance from the load balancer. Other instances (if available) continue serving traffic. |
| 8 | Alert fires repeatedly due to flapping metric | Alert rules have `for` durations (e.g., `for: 5m`) that require the condition to hold for the specified time. This prevents alerts from flapping on transient spikes. Alertmanager also has grouping and inhibition rules to prevent alert storms. |
| 9 | Log level changed at runtime to debug in production | Debug logs are gated by an environment variable per module (e.g., `LOG_LEVEL_GAME_ENGINE=debug`). Changing this requires a config update and restart (or a config reload mechanism if implemented). No runtime toggle to prevent accidental debug floods. |
| 10 | Two concurrent requests share the same traceId | Impossible if using W3C Trace Context correctly. Each request generates a unique traceId. If this somehow occurs (client bug), Jaeger displays both request spans under the same trace -- confusing but not data-corrupting. |

---

## 10. Integration Points

### 10.1 Inbound

```
All Application Modules
  -> OpenTelemetry SDK (single instrumentation API)
     -> Produces: spans, metrics, structured logs

Prometheus
  -> Scrapes /metrics endpoint every 15 seconds (pull model)

Promtail
  -> Tails container stdout for structured JSON logs (push to Loki)
```

### 10.2 Outbound

```
OpenTelemetry SDK
  -> Jaeger (traces via OTLP/gRPC on port 4317)
  -> Loki (logs via OTel Collector on port 4317)
  -> Prometheus (metrics via /metrics endpoint scrape on port 9464)

Prometheus
  -> Alertmanager (alert trigger notifications)
  -> Grafana (query responses for dashboard panels)

Jaeger
  -> Grafana (trace query responses)

Loki
  -> Grafana (log query responses)

Alertmanager
  -> Notification channels (email, Slack, PagerDuty -- configurable)
```

### 10.3 Correlation Strategy

All three pillars are correlated via shared identifiers:

```
Trace -> Log:    traceId field in every log line matches Jaeger trace ID
Log -> Trace:    Grafana "View Trace" button on log lines with traceId
Metric -> Log:   Time-range correlation in Grafana (select metric spike, switch to Loki panel)
Metric -> Trace: Exemplars (Prometheus exemplar support links metric samples to trace IDs)
```

This means: an operator sees a latency spike on a dashboard, clicks to see exemplar traces, finds the slow trace, clicks to see logs from that trace. Full incident investigation without leaving Grafana.

---

## 11. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Jaeger vs Tempo for traces? | Jaeger. | Jaeger is mature, has a standalone binary for local dev, and integrates natively with OTel. Tempo is lighter-weight but less battle-tested for development workflows. Switching to Tempo later is a backend config change, not a code change (OTel abstraction). |
| 2 | Loki vs Elasticsearch for logs? | Loki. | Loki is purpose-built for Grafana, uses label-based indexing (lower resource footprint than full-text indexing), and runs well in Docker Compose for local dev. Elasticsearch is overkill for this scale and requires significant memory. |
| 3 | Sampling rate in production? | 0.1 (10% of traces). Head-based sampling. | Full trace collection is expensive at scale. 10% provides sufficient visibility for debugging while keeping Jaeger storage manageable. Errors always force-sample (the sampler is configured to always capture errored traces regardless of the rate). |
| 4 | Push vs pull for metrics? | Pull (Prometheus scrape). | Prometheus pull model is simpler operationally. The application exposes a /metrics endpoint; Prometheus discovers and scrapes it. No need for the application to know the metrics backend address. Service discovery via Docker labels or Kubernetes annotations. |
| 5 | Structured logging library? | Pino. | Pino is the fastest structured JSON logger for Node.js. It outputs newline-delimited JSON natively, which Promtail parses without transformation. Winston and Bunyan are alternatives but Pino wins on throughput benchmarks. |
| 6 | Log retention period? | 30 days in Loki. 15 days in Prometheus. Jaeger traces: 7 days. | Balances storage cost with debugging needs. 30 days of logs covers most incident investigations. Prometheus 15-day retention covers alert evaluation windows. Trace retention is shortest because traces are sampled and used primarily for real-time debugging. |
| 7 | Dashboard provisioning? | Dashboards stored as JSON in `observability/grafana/` directory. Provisioned automatically via Grafana's file-based provisioning on startup. | Infrastructure as code principle. Dashboards are version-controlled, reproducible, and deploy automatically. No manual dashboard creation in the Grafana UI. |
| 8 | Where to expose /metrics endpoint? | Same HTTP server, different port (9464). | Separating the metrics port prevents Prometheus scrape requests from appearing in application request metrics. Port 9464 is the OpenTelemetry default for Prometheus exporters. The port is not exposed to external traffic. |
| 9 | Console.log enforcement? | ESLint rule `no-console: error`. All logging goes through the Pino logger wrapper that auto-injects trace context. | Prevents unstructured logs from bypassing the observability pipeline. The linting rule catches it at development time, not production. |
| 10 | Health check implementation? | Health checks are plain HTTP endpoints on the main server, not a separate process. | Adding a separate health check process adds complexity. The main server can serve health endpoints on the same port. If the main server is truly stuck (event loop blocked), Kubernetes detects it via liveness probe timeout. |

---

## 12. Implications for Architecture

1. **OTel SDK initialization in composition root** means `server/server.ts` must call the OTel setup function before importing any application modules. Instrumentation libraries must be loaded before the code they instrument.

2. **Pino as the logging library** means all modules import a shared logger instance from `server/shared/logger.ts`. The logger is pre-configured with trace context injection. Module-level loggers are child loggers with the `module` field pre-set.

3. **Prometheus /metrics on port 9464** means the Docker Compose and Kubernetes configurations must expose this port and configure Prometheus to scrape it. The port is internal-only (not exposed via ingress).

4. **Dashboard JSON files in `observability/grafana/`** means the Grafana Docker Compose service mounts this directory as a provisioning source. Any developer can modify dashboards by editing JSON files and restarting Grafana.

5. **Error force-sampling** means the OTel trace sampler must be a custom sampler that wraps the probabilistic sampler but overrides the decision for spans with error status. This is a small piece of custom OTel configuration in the SDK setup.

6. **AsyncLocalStorage for context propagation** means the application relies on Node.js `AsyncLocalStorage` to carry userId, roomId, and gameId through async call chains without explicit parameter passing. This is established in middleware and accessible by the logger.

7. **WebSocket trace propagation** means the client must be instrumented (even minimally) to generate and attach traceId/spanId to outbound WebSocket messages. The client OTel setup is lightweight -- just span context generation, no full tracing.
