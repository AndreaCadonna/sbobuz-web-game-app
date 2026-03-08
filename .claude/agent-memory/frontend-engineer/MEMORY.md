# Frontend Engineer Memory

## Current Progress
- **Phase 7 Steps 7.1-7.10:** Complete
- **Branch:** `feature/phase-7-frontend-client`
- **Total source files:** ~55 (36 from 7.1-7.5 + 19 new from 7.6-7.10)

## Architecture Decisions
- Next.js 14 App Router with `src/` directory (`app/src/app/`)
- Path alias: `@/*` maps to `./src/*`, `@shared/*` maps to `../shared/types/*`
- `next.config.js` uses `transpilePackages: ['@sbobuz/shared']`
- Tailwind 3 with PostCSS, custom brand color palette
- Zustand 5 with devtools middleware; auth store uses persist middleware
- Socket.IO client instance at module scope (not React state)
- Pino logger for all logging (no console.log)
- Zod for all form validation and API response parsing

## Key Patterns
- **Auth interceptor:** `registerAuthInterceptor()` called at module scope in auth-store
- **Socket lifecycle:** `useSocket` hook mounts in `AuthenticatedLayout`, manages connect/disconnect/event routing
- **Store communication:** Stores don't import each other; socket events route through the `useSocket` hook
- **Auth guard:** `AuthGuard` component wraps authenticated routes, handles hydration state
- **Type safety:** Client-side types mirror server SanitizedGameState/socket payloads in `src/types/client.ts`
- **Game actions:** All sent via `getSocket().emit('game:action', ...)` in `use-game.ts` hook; never locally computed
- **Card component:** Uses `getSizeConfig()` function instead of indexed Record access (avoids `noUncheckedIndexedAccess` errors)
- **Route layouts:** Each route group (game, leaderboard, profile) has its own `layout.tsx` wrapping `AuthenticatedLayout`

## File Organization
```
app/src/
├── app/               # Next.js App Router pages
│   ├── game/          # Game board page ([gameId])
│   ├── leaderboard/   # Rankings page
│   ├── profile/       # Player stats page
│   ├── lobby/         # Lobby pages
│   ├── login/         # Auth pages
│   └── register/
├── components/
│   ├── game/          # Card, GameBoard, PlayerHand, OpponentZone, PlayPile, DrawPile, etc.
│   ├── leaderboard/   # LeaderboardTable
│   ├── profile/       # PlayerStats, MatchHistory
│   ├── ui/            # Button, Input, Modal, etc.
│   ├── auth/
│   ├── lobby/
│   └── layout/        # AuthGuard, AppHeader, AuthenticatedLayout
├── hooks/             # use-auth, use-socket, use-game
├── stores/            # auth-store, game-store, room-store, socket-store, ui-store
├── lib/               # api-client, logger, socket, validators
└── types/             # client.ts (all client-only types)
```

## Gotchas
- Socket.IO manager has no `pong` event in v4; only `ping`, `open`, `close`, `reconnect_*`
- Next.js build may show rmdir I/O error on cleanup — this is filesystem-level, not code
- `exactOptionalPropertyTypes: false` in app tsconfig (differs from root/shared which use `true`)
- Shared package exports from `@sbobuz/shared` (barrel via `shared/types/index.ts`)
- SanitizedGameState and SanitizedPlayerState defined in server code, mirrored in client types
- `noUncheckedIndexedAccess: true` in tsconfig — must avoid `Record<string, T>[key]` patterns; use typed key Records or switch functions instead
- Use `Record<Suit, string>` (typed key) instead of `Record<string, string>` to avoid needing `?? fallback`
