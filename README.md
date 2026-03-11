# Sbobuz

A real-time, multiplayer card game platform where players can register, create or join rooms, and play against other humans or AI opponents — all through a browser.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14+ (App Router), React, Tailwind CSS, Zustand |
| Backend | Node.js 20, Express, TypeScript 5.7 |
| Realtime | Socket.IO with Redis adapter |
| Database | PostgreSQL (typed query builder, no ORM) |
| Cache / Pub-Sub | Redis |
| Auth | JWT (HS256) + bcrypt (cost 12) |
| Game Engine | Event-sourced state machine, server-authoritative, pure functions |
| AI Opponents | Worker thread pool with pluggable strategies (Easy / Medium) |
| Observability | OpenTelemetry, Prometheus, Grafana, Jaeger, Pino logging |
| CI/CD | GitHub Actions |
| Deployment | Docker, Kubernetes (Kustomize), Terraform |
| Testing | Vitest (unit + integration) |

## Architecture

Sbobuz is a **modular monolith** — a single deployable unit with clearly separated internal modules:

```
┌─────────────────────────────────────────────────┐
│  Next.js SPA (React + Zustand)                  │
│  HTTPS + WebSocket                              │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│  API Gateway / BFF                              │
│  Rate Limiter → CORS → Auth Middleware          │
├─────────┬──────────┬──────────┬─────────────────┤
│  Auth   │  Lobby   │  Game    │  Realtime       │
│ Module  │  Module  │  Engine  │  Module (WS)    │
│         │          │          │                 │
│         │          │  ┌───────┤                 │
│         │          │  │  AI   │                 │
│         │          │  │Module │                 │
├─────────┴──────────┴──┴───────┴─────────────────┤
│  PostgreSQL              │  Redis               │
└──────────────────────────┴──────────────────────┘
```

Key design decisions:

- **Event-sourced game state** — every action is stored; state is derived by replaying events
- **Server-authoritative** — clients send intents, the server validates and applies them
- **30-second disconnect grace period** with full state sync on reconnect
- **Horizontal scaling** via Redis adapter for Socket.IO and stateless JWT auth

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0 (see `.nvmrc`)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [Git](https://git-scm.com/)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/AndreaCadonna/sbobuz-web-game-app.git
cd sbobuz-web-game-app
```

### 2. Set up environment variables

```bash
cp .env.example .env
```

Edit `.env` and set `JWT_SECRET` to a random string (at least 32 characters). The remaining defaults work for local development.

### 3. Install dependencies

```bash
npm install
```

### 4. Start infrastructure services

Start PostgreSQL, Redis, and the observability stack via Docker Compose:

```bash
docker-compose up -d postgres redis
```

Or start everything including the app container:

```bash
docker-compose up
```

### 5. Run database migrations

```bash
npm run migrate
```

### 6. Start the development server

```bash
npm run dev
```

The server starts on `http://localhost:3000`. Health check endpoints:

- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe (checks DB + Redis)
- `GET /health/capacity` — capacity status

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start the backend in development mode |
| `npm run build` | Build all workspaces |
| `npm start` | Start the production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Check formatting with Prettier |
| `npm run format:fix` | Fix formatting with Prettier |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run unit tests |
| `npm run test:integration` | Run integration tests (requires Postgres + Redis) |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run migrate` | Run database migrations |

## Project Structure

```
sbobuz-web-game-app/
├── app/                    # Next.js frontend (React SPA)
├── server/                 # Express backend
│   ├── modules/
│   │   ├── auth/           # Registration, login, JWT, sessions
│   │   ├── lobby/          # Room lifecycle, invites, ready system
│   │   ├── game-engine/    # Pure game logic (event-sourced state machine)
│   │   ├── realtime/       # Socket.IO event handlers, presence
│   │   ├── ai/             # AI opponent worker pool + strategies
│   │   └── leaderboard/    # ELO ratings
│   ├── shared/             # Config, logger, errors, middleware
│   └── infra/              # Database, Redis, WebSocket setup
├── shared/                 # Shared TypeScript types (cards, game state, API)
├── infra/
│   ├── docker/             # Dockerfiles
│   └── k8s/                # Kubernetes manifests (Kustomize)
├── observability/          # Grafana dashboards, Prometheus config
├── docs/                   # Specs, ADRs, runbooks
├── docker-compose.yml      # Local development services
└── package.json            # Workspace root
```

## License

Private project. All rights reserved.
