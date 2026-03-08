# Infrastructure and Deployment -- Build, Ship, Run

> **Document Type:** Architecture Spec
> **Status:** Draft
> **Last Updated:** March 2026

---

## 1. Overview

This specification defines the complete infrastructure and deployment architecture for the Sbobuz platform -- from local development (Docker Compose) through CI/CD (GitHub Actions) to production runtime (Kubernetes). The system is built and shipped as a single container image from a multi-stage Dockerfile. One image runs everywhere: locally, in staging, and in production. The only difference between environments is configuration, injected via environment variables.

The deployment philosophy follows immutable infrastructure principles. Containers are versioned artifacts tagged with git commit SHAs. Deployments replace containers; they never patch running ones. Rollback means deploying the previous image tag. Infrastructure is defined in Terraform for cloud resources and Kubernetes manifests for runtime orchestration. Nothing is provisioned manually.

The scaling strategy progresses through three phases aligned with the architecture overview: Phase 1 (single instance, 0-500 concurrent users), Phase 2 (horizontal scaling, 500-5000 concurrent users), and Phase 3 (service extraction, 5000+ concurrent users). Each phase is a well-defined transition point with specific triggers, infrastructure changes, and operational requirements.

---

## 2. Data Model

### 2.1 Environment Configuration Schema

All application configuration is loaded from environment variables and validated at startup using Zod schemas. If validation fails, the process exits immediately with a descriptive error -- no running with invalid config.

```typescript
// server/shared/config/schema.ts

interface ServerConfig {
  // --- Server ---
  NODE_ENV: 'development' | 'staging' | 'production';
  PORT: number;                   // default: 3000
  HOST: string;                   // default: '0.0.0.0'
  LOG_LEVEL: LogLevel;            // default: 'info' (overridden per-module via LOG_LEVEL_{MODULE})
  SERVER_ID: string;              // unique instance identifier, auto-generated if not set

  // --- Database ---
  DATABASE_URL: string;           // PostgreSQL connection string
  DB_POOL_MIN: number;            // default: 2
  DB_POOL_MAX: number;            // default: 10
  DB_STATEMENT_TIMEOUT_MS: number; // default: 30000
  MIGRATE_ON_STARTUP: boolean;    // default: false (only true in development)

  // --- Redis ---
  REDIS_URL: string;              // Redis connection string
  REDIS_COMMAND_TIMEOUT_MS: number; // default: 2000

  // --- Auth ---
  JWT_SECRET: string;             // HMAC-SHA256 signing key, minimum 32 characters
  JWT_ACCESS_TOKEN_TTL_SECONDS: number;  // default: 900 (15 minutes)
  JWT_REFRESH_TOKEN_TTL_SECONDS: number; // default: 604800 (7 days)
  BCRYPT_COST_FACTOR: number;     // default: 12

  // --- Rate Limiting ---
  RATE_LIMIT_WINDOW_MS: number;   // default: 60000 (1 minute)
  RATE_LIMIT_MAX_REQUESTS: number; // default: 100

  // --- Game ---
  DEFAULT_TURN_TIMER_SECONDS: number;      // default: 60
  DEFAULT_DISCONNECT_GRACE_SECONDS: number; // default: 30
  MAX_GAMES_PER_INSTANCE: number;           // default: 200
  GAME_SNAPSHOT_INTERVAL_ACTIONS: number;   // default: 10
  GAME_SNAPSHOT_INTERVAL_SECONDS: number;   // default: 30

  // --- WebSocket ---
  WS_PING_INTERVAL_MS: number;    // default: 25000
  WS_PING_TIMEOUT_MS: number;     // default: 5000
  WS_MAX_PAYLOAD_BYTES: number;   // default: 16384 (16KB)

  // --- Observability ---
  OTEL_EXPORTER_OTLP_ENDPOINT: string;    // default: http://localhost:4317
  OTEL_TRACE_SAMPLING_RATE: number;        // default: 1.0 (dev), 0.1 (prod)
  METRICS_PORT: number;                     // default: 9464
  GRAFANA_URL: string;                      // optional, for log correlation links

  // --- CORS ---
  CORS_ALLOWED_ORIGINS: string;   // comma-separated list of allowed origins

  // --- Feature Flags ---
  ENABLE_AI_OPPONENT: boolean;    // default: true
  ENABLE_MATCHMAKING: boolean;    // default: false (Phase 2)
}
```

### 2.2 Zod Validation Schema

```typescript
// The Zod schema validates all environment variables at startup.
// Missing required variables cause an immediate process exit with a clear error message.

// Validation rules:
// - JWT_SECRET must be >= 32 characters
// - DATABASE_URL must match postgres:// or postgresql:// prefix
// - REDIS_URL must match redis:// or rediss:// prefix
// - PORT must be 1-65535
// - All timeout values must be positive integers
// - CORS_ALLOWED_ORIGINS must not be empty in production
// - CORS_ALLOWED_ORIGINS must not contain '*' in production
// - NODE_ENV must be one of the three allowed values
// - OTEL_TRACE_SAMPLING_RATE must be between 0.0 and 1.0

// The validated config is frozen (Object.freeze) and exported as a singleton.
// Modules import the config object; they never read process.env directly.
```

### 2.3 Docker Image Metadata

```typescript
interface ImageMetadata {
  repository: string;            // e.g., ghcr.io/sbobuz/sbobuz-server
  tag: string;                   // git commit SHA (short, 7 chars)
  labels: {
    'org.opencontainers.image.source': string;   // GitHub repo URL
    'org.opencontainers.image.revision': string;  // full git commit SHA
    'org.opencontainers.image.created': string;   // ISO 8601 build timestamp
    'org.opencontainers.image.version': string;   // semver from package.json
  };
}
```

---

## 3. Docker Multi-Stage Build

### 3.1 Build Strategy

The application is built using a multi-stage Dockerfile that produces a minimal production image.

```
Stage 1: "deps" -- Dependency Installation
  Base: node:20-alpine
  Action: Copy package.json + lockfile, install ALL dependencies (dev + prod)
  Output: node_modules with full dependency tree

Stage 2: "build" -- TypeScript Compilation
  Base: node:20-alpine
  Action: Copy source code + node_modules from Stage 1, compile TypeScript
  Output: Compiled JavaScript in /app/dist

Stage 3: "production" -- Minimal Runtime Image
  Base: node:20-alpine
  Action: Copy compiled JS from Stage 2, install prod-only dependencies
  Security: Run as non-root user (node:node, UID 1000)
  Output: Final image (~150MB estimated)
```

### 3.2 Build Optimization Rules

1. **Layer ordering:** `package.json` and lockfile are copied before source code. Dependency installation is cached unless dependencies change.
2. **Multi-stage pruning:** The final image contains no TypeScript source, no devDependencies, no build tools.
3. **Alpine base:** Minimal Linux distribution. Reduces attack surface and image size.
4. **Non-root user:** The `node` user (UID 1000) is used in the production stage. Never run as root.
5. **.dockerignore:** Excludes `node_modules`, `.git`, `docs`, `observability`, `infra/terraform`, test files, and IDE configuration from the build context.
6. **No secrets in the image:** Environment variables are injected at runtime, never baked into the image. No `.env` files are copied.

### 3.3 Image Tagging Strategy

```
Every build produces an image tagged with:
  1. Git commit SHA (short):  ghcr.io/sbobuz/sbobuz-server:a1b2c3d
  2. Branch name (sanitized):  ghcr.io/sbobuz/sbobuz-server:main
  3. Semver (on release tags): ghcr.io/sbobuz/sbobuz-server:1.2.3
  4. "latest" (on main branch): ghcr.io/sbobuz/sbobuz-server:latest

Staging always deploys the commit SHA tag.
Production always deploys the commit SHA tag (never "latest").
The commit SHA tag is immutable -- once pushed, it is never overwritten.
```

---

## 4. Docker Compose -- Local Development

### 4.1 Service Topology

All 8 services run locally via a single `docker-compose up` command. The topology mirrors production.

```typescript
interface DockerComposeServices {
  // Application services
  app: {
    // Node.js backend monolith with hot-reload
    build: './';                 // builds from local Dockerfile
    ports: ['3000:3000', '9464:9464'];  // API + metrics
    volumes: ['./server:/app/server', './shared:/app/shared']; // hot reload
    dependsOn: ['postgres', 'redis'];
    environment: ServerConfig;   // development defaults
    healthcheck: 'GET /health/ready';
  };

  frontend: {
    // Next.js dev server with hot-reload
    build: './app/';
    ports: ['3001:3001'];
    volumes: ['./app:/app/app', './shared:/app/shared']; // hot reload
    dependsOn: ['app'];
  };

  // Data services
  postgres: {
    image: 'postgres:16-alpine';
    ports: ['5432:5432'];
    volumes: ['pgdata:/var/lib/postgresql/data']; // persistent across restarts
    environment: {
      POSTGRES_DB: 'sbobuz';
      POSTGRES_USER: 'sbobuz';
      POSTGRES_PASSWORD: 'localdev';  // local only, never used in production
    };
    healthcheck: 'pg_isready';
  };

  redis: {
    image: 'redis:7-alpine';
    ports: ['6379:6379'];
    command: 'redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru';
    healthcheck: 'redis-cli ping';
  };

  // Observability services
  grafana: {
    image: 'grafana/grafana:latest';
    ports: ['4000:3000'];
    volumes: [
      './observability/grafana/provisioning:/etc/grafana/provisioning',
      './observability/grafana/dashboards:/var/lib/grafana/dashboards',
    ];
    dependsOn: ['prometheus', 'jaeger', 'loki'];
  };

  prometheus: {
    image: 'prom/prometheus:latest';
    ports: ['9090:9090'];
    volumes: ['./observability/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml'];
  };

  jaeger: {
    image: 'jaegertracing/all-in-one:latest';
    ports: ['16686:16686', '4317:4317']; // UI + OTLP gRPC
    environment: {
      COLLECTOR_OTLP_ENABLED: 'true';
    };
  };

  loki: {
    image: 'grafana/loki:latest';
    ports: ['3100:3100'];
  };
}
```

### 4.2 Local Development Workflow

```
# Start everything:
docker-compose up

# Start only infrastructure (no app/frontend):
docker-compose up postgres redis grafana prometheus jaeger loki

# Start app with hot reload (runs outside Docker for faster iteration):
# In this mode, app connects to Docker-hosted Postgres/Redis
npm run dev

# Run migrations:
npm run migrate

# Run tests against Docker-hosted databases:
npm run test:integration

# Reset everything (wipe data):
docker-compose down -v
docker-compose up
```

### 4.3 Volume Strategy

```
Named volumes (persistent across docker-compose down, cleared with -v):
  pgdata:     PostgreSQL data directory
  grafanadata: Grafana configuration and state

Bind mounts (hot reload):
  ./server -> /app/server       Server source code
  ./app    -> /app/app          Frontend source code
  ./shared -> /app/shared       Shared types

No bind mounts for:
  node_modules  -- installed inside the container, not shared with host
```

---

## 5. CI/CD Pipeline -- GitHub Actions

### 5.1 Pipeline Architecture

```
TRIGGER: Pull Request (to main)
  |
  v
[Lint + Typecheck] ──> [Unit Tests] ──> [Integration Tests] ──> [Build Check]
  (parallel: ESLint,     (Vitest,        (needs Postgres +       (Docker build,
   tsc --noEmit)          no I/O)         Redis via services)     no push)
  |
  All pass? ──> PR is mergeable (requires code review)

TRIGGER: Push to main (merge)
  |
  v
[Build Container Image] ──> [Push to Registry] ──> [Deploy to Staging] ──> [Smoke Tests]
  (multi-stage Docker        (ghcr.io)              (automatic)            (automated)
   build, tag with SHA)
  |
  Smoke tests pass? ──> [Deploy to Production] (manual approval gate)
```

### 5.2 Pipeline Stage Details

#### Stage: Lint and Typecheck

```yaml
# Runs on: every PR, every push to main
# Duration target: < 2 minutes
# Parallelized: ESLint and tsc run concurrently

steps:
  - checkout code
  - setup Node.js 20
  - install dependencies (npm ci, cached)
  - run ESLint (includes no-console rule)
  - run TypeScript compiler (tsc --noEmit)
  - run Prettier check (format verification, no auto-fix)
```

#### Stage: Unit Tests

```yaml
# Runs on: every PR, every push to main
# Duration target: < 3 minutes
# No external dependencies (no database, no Redis)

steps:
  - checkout code
  - setup Node.js 20
  - install dependencies (cached)
  - run Vitest with coverage
  - upload coverage report as artifact
  - fail if coverage drops below thresholds:
    - branches: 80%
    - functions: 80%
    - lines: 80%
    - statements: 80%
```

#### Stage: Integration Tests

```yaml
# Runs on: every PR, every push to main
# Duration target: < 5 minutes
# Uses GitHub Actions service containers for PostgreSQL and Redis

services:
  postgres:
    image: postgres:16-alpine
    env: { POSTGRES_DB: sbobuz_test, POSTGRES_USER: test, POSTGRES_PASSWORD: test }
    ports: ['5432:5432']
    options: --health-cmd="pg_isready" --health-interval=10s

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    options: --health-cmd="redis-cli ping" --health-interval=10s

steps:
  - checkout code
  - setup Node.js 20
  - install dependencies (cached)
  - run migrations against test database
  - run integration test suite (Vitest, separate config)
  - teardown is automatic (service containers are ephemeral)
```

#### Stage: Build Check (PR only)

```yaml
# Verifies the Docker image builds successfully without pushing
steps:
  - checkout code
  - setup Docker Buildx
  - build Docker image (--no-push)
  - verify image size < 300MB
```

#### Stage: Build and Push (main branch only)

```yaml
steps:
  - checkout code
  - setup Docker Buildx
  - login to GitHub Container Registry (ghcr.io)
  - build multi-platform image (linux/amd64)
  - tag with: commit SHA, "latest", semver (if tagged release)
  - push to registry
  - output image digest for deployment stage
```

#### Stage: Deploy to Staging (main branch only, automatic)

```yaml
steps:
  - authenticate with cloud provider
  - update Kubernetes deployment manifest with new image tag (commit SHA)
  - apply Kubernetes manifests (kubectl apply)
  - wait for rollout to complete (kubectl rollout status, timeout 5 minutes)
  - if rollout fails: auto-rollback to previous revision
```

#### Stage: Smoke Tests (after staging deploy)

```yaml
# Verifies the staging deployment is functional
steps:
  - wait for readiness (poll /health/ready, max 60 seconds)
  - verify /health/live returns 200
  - verify /health/ready returns 200 with postgres=up, redis=up
  - verify WebSocket connection handshake succeeds
  - verify user registration flow (create test user, login, delete)
  - verify room creation flow (create room, verify in public list)
  - report results
```

#### Stage: Deploy to Production (manual approval)

```yaml
# Requires manual approval in GitHub Actions environment protection rules
# Deploys the exact same image that passed smoke tests in staging

steps:
  - wait for manual approval (GitHub environment: "production")
  - authenticate with cloud provider
  - update Kubernetes deployment with image tag (same commit SHA as staging)
  - apply with rolling update strategy
  - wait for rollout (timeout 10 minutes)
  - if rollout fails: auto-rollback
  - post-deploy: run production smoke tests (health checks only, no data mutations)
```

### 5.3 CI Environment Variables and Secrets

```typescript
// GitHub Actions secrets (never in code)
interface CISecrets {
  GHCR_TOKEN: string;            // GitHub Container Registry push token
  CLOUD_CREDENTIALS: string;     // cloud provider service account key
  STAGING_KUBECONFIG: string;    // Kubernetes config for staging cluster
  PRODUCTION_KUBECONFIG: string; // Kubernetes config for production cluster
  STAGING_DATABASE_URL: string;  // staging PostgreSQL connection string
  STAGING_REDIS_URL: string;     // staging Redis connection string
  PRODUCTION_DATABASE_URL: string;
  PRODUCTION_REDIS_URL: string;
  JWT_SECRET_STAGING: string;
  JWT_SECRET_PRODUCTION: string;
}
```

---

## 6. Terraform Cloud Infrastructure

### 6.1 Resource Inventory

```typescript
// infra/terraform/ -- defines all cloud resources

interface TerraformResources {
  // Compute
  kubernetes_cluster: {
    node_pool_min: number;       // Phase 1: 1, Phase 2: 2
    node_pool_max: number;       // Phase 1: 2, Phase 2: 5
    node_size: string;           // Phase 1: 2 vCPU / 4GB RAM
    auto_scaling: boolean;       // Phase 1: false, Phase 2: true
  };

  // Database
  postgresql: {
    version: '16';
    tier: string;                // Phase 1: smallest managed tier
    storage_gb: number;          // Phase 1: 10GB, auto-grow enabled
    backup_retention_days: 30;
    high_availability: boolean;  // Phase 1: false, Phase 2: true (standby replica)
    read_replicas: number;       // Phase 1: 0, Phase 2: 1
  };

  // Cache
  redis: {
    version: '7';
    tier: string;                // Phase 1: smallest managed tier
    memory_gb: number;           // Phase 1: 1GB
    high_availability: boolean;  // Phase 1: false, Phase 2: true
    persistence: 'rdb';          // RDB snapshots only
  };

  // Networking
  load_balancer: {
    type: 'L7';                  // HTTP/HTTPS + WebSocket support
    ssl_termination: true;
    health_check_path: '/health/ready';
    sticky_sessions: true;       // required for WebSocket affinity
    idle_timeout_seconds: 300;   // 5 minutes for WebSocket connections
  };

  // DNS
  dns: {
    domain: string;              // e.g., sbobuz.com
    records: {
      api: string;               // api.sbobuz.com -> load balancer
      ws: string;                // ws.sbobuz.com -> load balancer (same LB, different path)
      grafana: string;           // grafana.sbobuz.com -> internal (VPN-only in prod)
    };
  };

  // Container Registry
  container_registry: {
    provider: 'ghcr.io';        // GitHub Container Registry
    retention_policy: {
      keep_last_n_tags: 50;     // keep last 50 image tags
      delete_untagged_after_days: 7;
    };
  };

  // SSL/TLS
  ssl_certificate: {
    provider: 'letsencrypt';    // auto-renewed via cert-manager in Kubernetes
    domains: ['sbobuz.com', '*.sbobuz.com'];
  };
}
```

### 6.2 Terraform Module Structure

```
infra/terraform/
  modules/
    kubernetes/       -- cluster provisioning, node pools
    database/         -- PostgreSQL managed instance
    redis/            -- Redis managed instance
    networking/       -- VPC, subnets, firewall rules, load balancer
    dns/              -- DNS records
    monitoring/       -- cloud-level monitoring and alerts
  environments/
    staging/          -- staging-specific variable values
      main.tf
      variables.tf
      terraform.tfvars
    production/       -- production-specific variable values
      main.tf
      variables.tf
      terraform.tfvars
  backend.tf          -- remote state storage configuration
  providers.tf        -- cloud provider configuration
```

### 6.3 State Management

```
Terraform state is stored remotely (cloud object storage with state locking).
State is separated per environment:
  staging/terraform.tfstate
  production/terraform.tfstate

State locking prevents concurrent modifications.
State is never committed to version control.
```

---

## 7. Kubernetes Manifests

### 7.1 Resource Topology

```typescript
// infra/k8s/ -- Kubernetes resource definitions

interface KubernetesResources {
  namespace: 'sbobuz-staging' | 'sbobuz-production';

  // Application deployment
  deployment: {
    name: 'sbobuz-server';
    replicas: number;            // Phase 1: 1, Phase 2: 2-5
    strategy: 'RollingUpdate';
    maxSurge: 1;
    maxUnavailable: 0;           // zero downtime deploys
    containers: [{
      name: 'sbobuz-server';
      image: string;             // ghcr.io/sbobuz/sbobuz-server:{sha}
      ports: [3000, 9464];       // app + metrics
      resources: {
        requests: { cpu: '250m', memory: '256Mi' };
        limits: { cpu: '1000m', memory: '512Mi' };
      };
      env: 'from ConfigMap + Secrets';
      livenessProbe: '/health/live';
      readinessProbe: '/health/ready';
    }];
  };

  // Service (internal load balancing)
  service: {
    name: 'sbobuz-server';
    type: 'ClusterIP';
    ports: [
      { name: 'http', port: 3000, targetPort: 3000 },
      { name: 'metrics', port: 9464, targetPort: 9464 },
    ];
    sessionAffinity: 'ClientIP';  // WebSocket sticky sessions
    sessionAffinityTimeout: 3600; // 1 hour
  };

  // Ingress (external access)
  ingress: {
    name: 'sbobuz-ingress';
    annotations: {
      'kubernetes.io/ingress.class': 'nginx';
      'cert-manager.io/cluster-issuer': 'letsencrypt-prod';
      'nginx.ingress.kubernetes.io/proxy-read-timeout': '3600'; // WebSocket support
      'nginx.ingress.kubernetes.io/proxy-send-timeout': '3600';
      'nginx.ingress.kubernetes.io/upstream-hash-by': '$remote_addr'; // sticky sessions
    };
    tls: true;
    hosts: ['api.sbobuz.com'];
  };

  // ConfigMap (non-secret configuration)
  configMap: {
    name: 'sbobuz-config';
    data: {
      NODE_ENV: string;
      PORT: '3000';
      LOG_LEVEL: 'info';
      // ... all non-secret config values
    };
  };

  // Secret (sensitive configuration)
  secret: {
    name: 'sbobuz-secrets';
    type: 'Opaque';
    data: {
      DATABASE_URL: string;      // base64-encoded
      REDIS_URL: string;
      JWT_SECRET: string;
    };
    // Managed via external-secrets-operator or sealed-secrets
    // NEVER committed to version control as plaintext
  };

  // HorizontalPodAutoscaler (Phase 2)
  hpa: {
    name: 'sbobuz-hpa';
    minReplicas: 2;
    maxReplicas: 5;
    metrics: [
      { type: 'Resource', name: 'cpu', targetAverageUtilization: 70 },
      { type: 'Pods', name: 'ws_connections_active', targetAverageValue: 3000 },
    ];
    scaleDownStabilization: 300;  // 5 minutes before scaling down
  };

  // PodDisruptionBudget (Phase 2)
  pdb: {
    name: 'sbobuz-pdb';
    minAvailable: 1;             // always keep at least 1 pod running
  };

  // ServiceMonitor (Prometheus Operator)
  serviceMonitor: {
    name: 'sbobuz-metrics';
    selector: { app: 'sbobuz-server' };
    endpoints: [{ port: 'metrics', interval: '15s' }];
  };
}
```

### 7.2 Manifest File Structure

```
infra/k8s/
  base/                          -- shared resources
    namespace.yaml
    configmap.yaml
    service.yaml
    deployment.yaml
    service-monitor.yaml
  overlays/
    staging/                     -- staging-specific patches
      kustomization.yaml
      deployment-patch.yaml      -- replicas: 1, staging image tag
      configmap-patch.yaml       -- staging config values
      ingress.yaml               -- staging domain
    production/                  -- production-specific patches
      kustomization.yaml
      deployment-patch.yaml      -- replicas: 2, production image tag
      configmap-patch.yaml       -- production config values
      ingress.yaml               -- production domain
      hpa.yaml                   -- autoscaler (Phase 2)
      pdb.yaml                   -- pod disruption budget (Phase 2)
```

---

## 8. Graceful Shutdown Sequence

### 8.1 SIGTERM Handling

When Kubernetes sends SIGTERM (during scaling down, rolling update, or manual termination), the application follows this exact shutdown sequence.

```
STEP 1 -- SIGNAL RECEIVED
  Process receives SIGTERM from Kubernetes.
  Shutdown timeout starts: 30 seconds total (Kubernetes terminationGracePeriodSeconds).

STEP 2 -- STOP ACCEPTING NEW CONNECTIONS (immediate)
  a. HTTP server stops accepting new connections (.close()).
  b. Health endpoint /health/ready returns 503 (tells LB to stop routing).
  c. Health endpoint /health/live still returns 200 (don't restart, we are draining).
  d. WebSocket server stops accepting new connections.

STEP 3 -- NOTIFY CONNECTED CLIENTS (within 1 second)
  a. Broadcast "server:draining" event to all WebSocket clients.
  b. Clients that receive this event should prepare for reconnection to another instance.

STEP 4 -- DRAIN ACTIVE GAMES (up to 15 seconds)
  a. For each active game on this instance:
     i.   Snapshot current game state to Redis (game:{gameId}:snapshot).
     ii.  Flush buffered actions to Redis (game:{gameId}:actions).
     iii. The game will be picked up by another instance on client reconnect.
  b. If any game cannot be snapshotted within 15 seconds, it is force-snapshotted
     with whatever state is available.

STEP 5 -- CLOSE CLIENT CONNECTIONS (within 5 seconds)
  a. Close all WebSocket connections with code 1001 (Going Away).
  b. Wait for in-flight HTTP requests to complete (max 5 seconds).
  c. Requests that exceed the timeout receive a 503 response.

STEP 6 -- CLOSE DATA CONNECTIONS (within 5 seconds)
  a. Drain PostgreSQL connection pool (wait for active queries, max 3 seconds).
  b. Close Redis connections.
  c. Flush any pending OTel telemetry (force export).

STEP 7 -- EXIT
  a. Process exits with code 0.
  b. If the 30-second total timeout is reached before step 7, Kubernetes sends SIGKILL.
```

### 8.2 Shutdown Configuration

```typescript
interface ShutdownConfig {
  totalGracePeriodMs: 30000;     // Kubernetes terminationGracePeriodSeconds * 1000
  drainActiveGamesMs: 15000;     // max time to snapshot games
  closeConnectionsMs: 5000;      // max time to close client connections
  closeDataLayerMs: 5000;        // max time to close DB/Redis
  forceExitMs: 29000;            // hard exit before SIGKILL (1s safety margin)
}
```

---

## 9. Scaling Strategy

### 9.1 Phase 1 -- Single Instance (0-500 concurrent users)

```
Architecture:
  1x Node.js instance
  1x PostgreSQL (managed, smallest tier)
  1x Redis (managed, smallest tier)
  1x Load Balancer (for SSL termination and future scaling)

Characteristics:
  - Single process handles all traffic
  - No WebSocket backplane needed (single instance)
  - No read replicas
  - No autoscaling
  - Estimated capacity: 200 concurrent games, 500 WebSocket connections
  - Estimated monthly cost: $50-100 (managed services)

Trigger to Phase 2:
  - Sustained ws_connections_active > 400 (80% capacity)
  - OR sustained event_loop_lag_ms p99 > 50ms
  - OR sustained cpu_usage > 70%
```

### 9.2 Phase 2 -- Horizontal Scaling (500-5000 concurrent users)

```
Architecture:
  2-5x Node.js instances (autoscaled)
  1x PostgreSQL (managed, HA with standby + 1 read replica)
  1x Redis (managed, HA with replica)
  1x Load Balancer (sticky sessions for WebSocket affinity)

Changes from Phase 1:
  - Socket.IO Redis adapter enabled (cross-instance broadcasts)
  - Sticky sessions on load balancer (WebSocket affinity by client IP)
  - PostgreSQL read replica for leaderboard and game history queries
  - Redis HA with automatic failover
  - Kubernetes HPA enabled (scale on CPU + connection count)
  - PodDisruptionBudget ensures at least 1 pod during disruptions

Trigger to Phase 3:
  - Game engine becomes the bottleneck (profiling shows >60% CPU in game logic)
  - OR need for independent scaling of game processing vs HTTP/WS handling
  - OR team grows and needs independent deployability
```

### 9.3 Phase 3 -- Service Extraction (5000+ concurrent users)

```
Architecture:
  Game Engine extracted as a separate service
  Communication via gRPC between services
  Remaining monolith handles Auth, Lobby, Realtime
  Independent scaling of game engine instances

This phase is NOT designed in detail now. The modular monolith boundaries
ensure a clean extraction path when the time comes. The spec for Phase 3
will be written when Phase 2 capacity is approaching its limit.
```

---

## 10. Secrets Management

### 10.1 Secret Categories

| Category | Examples | Storage | Rotation |
|---|---|---|---|
| **Application secrets** | JWT_SECRET, DATABASE_URL, REDIS_URL | Kubernetes Secrets (encrypted at rest) | Manual, documented rotation procedure |
| **CI/CD secrets** | Registry tokens, cloud credentials | GitHub Actions Secrets | Automated rotation via cloud provider |
| **Infrastructure secrets** | Terraform state encryption key | Cloud KMS | Never rotated (if lost, state is unrecoverable) |

### 10.2 Secret Injection Flow

```
Cloud provider KMS (encryption at rest)
  -> Kubernetes Secret resource (base64-encoded, encrypted via etcd encryption)
     -> Pod environment variable (injected at container startup)
        -> Zod validation (application verifies all required secrets are present)
           -> Config singleton (frozen, used by application modules)

Secrets NEVER appear in:
  - Container images (no ENV in Dockerfile for secrets)
  - Version control (no .env files committed, .gitignore enforced)
  - Log output (logger redacts known secret field names)
  - Error messages (stack traces do not include env var values)
  - API responses (server never returns config values to clients)
```

### 10.3 Secret Rotation Procedure (JWT_SECRET)

```
1. Generate new JWT_SECRET value.
2. Update Kubernetes Secret with the new value.
3. Trigger rolling restart of all pods (kubectl rollout restart).
4. New pods start with new JWT_SECRET.
5. Existing access tokens (signed with old secret) are invalid.
   Users with expired tokens refresh via refresh token (still valid).
   Users with expired refresh tokens must log in again.
6. Rolling restart ensures zero downtime (old pods drain while new pods start).
7. Full propagation time: ~5 minutes (rolling update duration).
```

---

## 11. Edge Cases and Test Scenarios

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Environment variable validation fails at startup | Process exits immediately with exit code 1. Error message lists all invalid/missing variables. Kubernetes restart policy restarts the pod, which fails again. The repeated CrashLoopBackOff is visible in `kubectl get pods`. Operator investigates ConfigMap/Secret. |
| 2 | Docker build fails in CI on a PR | PR check fails. PR cannot be merged. Developer fixes the build and pushes again. No image is published. |
| 3 | Staging deployment fails (pod does not become ready) | Kubernetes rolling update has `maxUnavailable: 0`. The old pods remain running. The new pod fails readiness checks and is never added to the service. After the rollout timeout (5 minutes), the deploy step reports failure. The CI pipeline does not proceed to production. |
| 4 | Production deploy succeeds but smoke tests fail | Smoke test failure triggers an automatic rollback (`kubectl rollout undo`). The previous deployment revision is restored. Alert fires. Operator investigates. |
| 5 | SIGTERM received while a game is in the middle of a critical state transition | The shutdown sequence waits up to 15 seconds for games to reach a safe checkpoint. In-flight state transitions complete (they are synchronous, < 1ms). The post-transition state is snapshotted to Redis. Clients reconnect to another instance and resume. |
| 6 | Redis is unavailable during graceful shutdown | Game state cannot be snapshotted. The game is effectively lost. Players are notified via WebSocket (if connection is still open) that the game will be cancelled. This is an accepted risk for the Redis-down scenario. |
| 7 | Rolling update with active WebSocket connections | Kubernetes sends SIGTERM to old pod. Old pod stops accepting new connections and begins draining. Load balancer routes new connections to new pods. Old pod has 30 seconds to drain. Clients receive "server:draining" event and reconnect to a new pod (Socket.IO handles this automatically). |
| 8 | CI pipeline runs out of time | GitHub Actions has a 6-hour per-job timeout. Individual steps have explicit timeouts: build (10 min), test (10 min), deploy (10 min). If a step hangs, it is killed. The pipeline fails. |
| 9 | Terraform apply fails midway | Terraform state records partial changes. The next `terraform apply` picks up from the partial state and completes the operation. If the state is corrupted, the operator runs `terraform refresh` to reconcile with actual infrastructure. |
| 10 | Two developers merge to main simultaneously | GitHub Actions runs separate pipeline instances for each merge commit. Each produces a unique image tag (different commit SHAs). The second deployment overwrites the first in staging. This is correct behavior -- the latest commit on main wins. |

---

## 12. Integration Points

### 12.1 Inbound

```
GitHub (webhooks)
  -> GitHub Actions (CI/CD pipeline trigger)

Developer (git push)
  -> GitHub (repository)
  -> GitHub Actions (pipeline execution)

Kubernetes (orchestration)
  -> SIGTERM to pods (scaling, updates)
  -> Health probe requests to /health/*
  -> Resource limit enforcement (CPU/memory)

Prometheus (monitoring)
  -> Scrapes /metrics endpoint on port 9464

Load Balancer (traffic routing)
  -> Routes HTTPS/WSS to Kubernetes service
  -> Health checks against /health/ready
```

### 12.2 Outbound

```
GitHub Actions
  -> GitHub Container Registry (image push)
  -> Kubernetes API (deployment updates)
  -> Cloud provider API (Terraform operations)

Application
  -> PostgreSQL (data persistence)
  -> Redis (ephemeral state, pub/sub)
  -> Jaeger (trace export via OTLP)
  -> Loki (log export via OTel Collector)
  -> Prometheus (metrics via /metrics scrape endpoint)

Terraform
  -> Cloud provider API (resource provisioning)
  -> Remote state storage (state file read/write)
```

---

## 13. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Container registry? | GitHub Container Registry (ghcr.io). | Free for public repos, integrated with GitHub Actions (no extra credentials), Docker Hub rate limits are a concern. |
| 2 | Kubernetes vs ECS vs plain VMs? | Kubernetes. | Industry standard for container orchestration. Rich ecosystem (cert-manager, external-secrets, prometheus-operator). Transferable skills. ECS is AWS-only. VMs require more operational work for scaling/health. |
| 3 | Kustomize vs Helm for K8s manifests? | Kustomize. | Built into kubectl. No external tool required. Base + overlays pattern is sufficient for staging/production differentiation. Helm adds complexity (templating, chart management) that is not needed for a single application. |
| 4 | CI/CD platform? | GitHub Actions. | Native GitHub integration. Free tier is sufficient (2000 minutes/month for private repos, unlimited for public). YAML-based workflows are version-controlled. No external CI server to manage. |
| 5 | How to manage secrets in Kubernetes? | Kubernetes Secrets with etcd encryption at rest. Upgrade to external-secrets-operator if integrating with cloud KMS. | Simplest approach for Phase 1. Kubernetes Secrets are sufficient when etcd encryption is enabled. external-secrets-operator is the upgrade path for cloud KMS integration without changing application code. |
| 6 | Blue-green vs rolling update? | Rolling update. | Blue-green requires double the infrastructure during deployment. Rolling update with `maxUnavailable: 0` achieves zero downtime without the resource overhead. WebSocket draining is handled by the graceful shutdown sequence. |
| 7 | Single Dockerfile or separate frontend/backend images? | Single Dockerfile for the backend monolith. Frontend (Next.js) gets its own Dockerfile when deployed separately. For local dev, frontend runs as a separate Docker Compose service. | The backend is a monolith -- one image. The frontend may be deployed to a static hosting platform (Vercel, Cloudflare Pages) in production, making a separate container unnecessary. |
| 8 | Database migrations: application-managed or CI-managed? | CI-managed in staging and production. Application-managed in development only. | Separates deployment from schema changes. Prevents migration race conditions when multiple pods start simultaneously. CI runs migrations as a single job before deploying the new version. |
| 9 | Terraform remote state backend? | Cloud object storage with state locking (e.g., S3 + DynamoDB, GCS). | Remote state enables team collaboration (future). State locking prevents concurrent modifications. Object storage provides durability and versioning. |
| 10 | Node.js version pinning strategy? | Pin to major version (Node 20) in Dockerfile. Use `.nvmrc` for local development. Update minor/patch versions via Dependabot PRs. | Major version pinning provides stability. Dependabot automates security updates. Breaking changes only on intentional major version bumps. |

---

## 14. Implications for Architecture

1. **Single container image** means all modules (Auth, Lobby, Game Engine, Realtime, AI) are compiled and shipped together. A bug fix in Auth requires rebuilding and deploying the entire application. This is acceptable for Phase 1-2 and is the trade-off of the monolith-first approach.

2. **Zod-validated configuration** means every environment variable is typed and validated. Adding a new config value requires updating the Zod schema, which serves as living documentation of all configuration options.

3. **Rolling update with `maxUnavailable: 0`** means at least one pod is always running during deployments. This requires the graceful shutdown sequence to work correctly -- any bug in shutdown logic causes deployment failures.

4. **CI-managed migrations in production** means the migration job must run before the new application pods start. The CI pipeline must handle the case where migrations succeed but the deployment fails (the database is already migrated to the new schema but running the old code). Migrations must be backward-compatible: the old code must work with the new schema during the transition window.

5. **Sticky sessions for WebSocket** means the load balancer must route all traffic from a given client IP to the same pod. This works for Phase 1-2 but limits load distribution. Phase 3 may need a more sophisticated routing strategy (e.g., room-based routing).

6. **SIGTERM with 30-second grace period** means games must be snapshotable within 15 seconds. This constrains the maximum game state size and the serialization performance. If game state serialization ever exceeds 15 seconds, the snapshot logic must be optimized or the grace period extended.
