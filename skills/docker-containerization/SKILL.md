---
name: docker-containerization
description: Docker best practices for Node.js/TypeScript applications. Covers multi-stage Dockerfiles, Docker Compose for local development, image optimization, security hardening, layer caching, and container orchestration basics. Use this skill whenever writing Dockerfiles, configuring Docker Compose services, optimizing container image size, setting up local development environments with containers, or when the user asks about containerization strategy, multi-stage builds, or Docker security. Also activate when debugging container builds, configuring service dependencies, or setting up health checks in Docker.
origin: ECC
---

# Docker Containerization

Production patterns for containerizing Node.js/TypeScript applications. These conventions prioritize small image sizes, fast builds, security, and developer-friendly local environments.

## When to Activate

- Writing or optimizing a Dockerfile
- Configuring Docker Compose for local development
- Setting up multi-stage builds
- Debugging container build issues
- Configuring health checks or resource limits
- Setting up a local development stack with databases and services

## Multi-Stage Dockerfile

Multi-stage builds separate build-time dependencies from the final image. The result is a small, secure production image that contains only what's needed to run.

```dockerfile
# Stage 1: Install dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Stage 2: Build TypeScript
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Prune dev dependencies after build
RUN npm prune --production

# Stage 3: Production image
FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# Copy only production artifacts
COPY --from=build --chown=appuser:appgroup /app/dist ./dist
COPY --from=build --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=build --chown=appuser:appgroup /app/package.json ./

USER appuser

EXPOSE 3000

# Use node directly, not npm — npm adds an unnecessary parent process
# that doesn't forward signals properly
CMD ["node", "dist/main.js"]
```

### Why Each Decision Matters

- **Alpine base** — ~50MB vs ~350MB for full Node image. Smaller attack surface.
- **`npm ci`** — Installs exact lockfile versions. Reproducible builds.
- **`--ignore-scripts`** in deps stage — Prevents malicious postinstall scripts during build.
- **Separate deps/build/production stages** — Layer cache means changing source code doesn't re-install dependencies.
- **`npm prune --production`** — Removes devDependencies before copying to production stage.
- **Non-root user** — Container processes should never run as root. A compromise gains limited privileges.
- **`CMD ["node", ...]`** not `CMD ["npm", "start"]` — npm spawns a shell that doesn't forward SIGTERM to node, breaking graceful shutdown.

## Layer Caching

Docker caches layers. Order your Dockerfile so that things that change rarely come first, and things that change often come last.

```
COPY package.json package-lock.json ./  ← Changes rarely (only when deps change)
RUN npm ci                              ← Cached unless package files changed
COPY . .                                ← Changes every commit
RUN npm run build                       ← Runs every time source changes
```

### .dockerignore

Exclude files that shouldn't be in the build context. This speeds up `docker build` and prevents secrets from leaking into images.

```
# .dockerignore
node_modules
dist
.git
.env
.env.*
*.md
.vscode
.idea
coverage
.claude
```

## Docker Compose — Local Development

Docker Compose defines the full local stack. A developer runs `docker compose up` and gets everything: app, database, cache, and observability tools.

```yaml
# docker-compose.yml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: deps  # Use deps stage for development
    command: npx tsx watch src/main.ts
    ports:
      - "3000:3000"
      - "9464:9464"   # Metrics port
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://sbobuz:sbobuz@postgres:5432/sbobuz
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=dev-secret-at-least-32-characters-long
      - LOG_LEVEL=debug
    volumes:
      - ./src:/app/src        # Hot reload source changes
      - ./package.json:/app/package.json
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      target: deps
    command: npm run dev
    ports:
      - "3001:3000"
    volumes:
      - ./frontend/src:/app/src
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:3000

  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: sbobuz
      POSTGRES_PASSWORD: sbobuz
      POSTGRES_DB: sbobuz
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sbobuz"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  # Observability stack
  grafana:
    image: grafana/grafana:latest
    ports:
      - "4000:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./config/grafana/provisioning:/etc/grafana/provisioning

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./config/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4317:4317"    # OTLP gRPC
    environment:
      COLLECTOR_OTLP_ENABLED: "true"

  loki:
    image: grafana/loki:latest
    ports:
      - "3100:3100"

volumes:
  pgdata:
  grafana-data:
```

### Compose Patterns

- **`depends_on` with `condition: service_healthy`** — Don't start the app until Postgres and Redis are actually ready, not just started.
- **Volume mounts for source** — Hot reload without rebuilding the container.
- **Named volumes for data** — `pgdata` persists across `docker compose down` / `up` cycles. Use `docker compose down -v` to wipe.
- **Explicit ports** — Map to non-conflicting host ports (Grafana on 4000, not 3000).

## Health Checks

Define health checks in Dockerfile for standalone containers, or in Compose for local development.

```dockerfile
# In Dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1
```

Use `wget` or `curl` — not a Node.js script — to avoid loading the full runtime just for a health check. Alpine has `wget` built in.

## Image Tagging Strategy

```
ghcr.io/org/sbobuz-server:abc1234        # Commit SHA (immutable, used for deploys)
ghcr.io/org/sbobuz-server:main           # Branch name (mutable, for staging)
ghcr.io/org/sbobuz-server:v1.2.3         # Semver (on release tags)
ghcr.io/org/sbobuz-server:latest         # Main branch only, never for production
```

**Rules:**
- Production deploys always reference the commit SHA tag — it's immutable
- Never deploy `:latest` to production — it's a moving target
- CI builds tag with SHA + branch on every push to main

## Security Hardening

```dockerfile
# Don't run as root
USER appuser

# Don't include package manager in production image (optional, aggressive)
RUN apk del apk-tools

# Set NODE_ENV in the image
ENV NODE_ENV=production

# Read-only filesystem (set at runtime, not in Dockerfile)
# docker run --read-only --tmpdir /tmp ...
```

### Image Scanning

Scan images for known vulnerabilities before deploying:

```bash
# In CI pipeline
docker scout cve ghcr.io/org/sbobuz-server:abc1234
# or
trivy image ghcr.io/org/sbobuz-server:abc1234
```

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| Using `:latest` in FROM | Non-reproducible builds | Pin to specific version (`node:20-alpine`) |
| `COPY . .` before `npm ci` | Busts layer cache on every code change | Copy package files first, install, then copy source |
| Running as root | Privilege escalation on compromise | `USER appuser` |
| `CMD ["npm", "start"]` | Broken signal forwarding | `CMD ["node", "dist/main.js"]` |
| No `.dockerignore` | Large build context, secrets in image | Create `.dockerignore` |
| `RUN apt-get install` without cleanup | Bloated image | Chain with `&& rm -rf /var/lib/apt/lists/*` |

## Checklist

Before shipping a Dockerfile:

- [ ] Multi-stage build separates deps/build/production
- [ ] Base image pinned to specific version (not `:latest`)
- [ ] `.dockerignore` excludes node_modules, .git, .env, coverage
- [ ] Runs as non-root user
- [ ] `CMD` uses exec form with `node` directly
- [ ] Layer order optimized (package files → install → source → build)
- [ ] Health check defined
- [ ] Production image size < 200MB
- [ ] No secrets baked into the image
