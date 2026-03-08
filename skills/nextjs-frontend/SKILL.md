---
name: nextjs-frontend
description: Next.js and React frontend engineering patterns for TypeScript web applications. Covers SSR/CSR strategy, component architecture, state management, real-time UI updates, and client-side patterns. Use this skill whenever writing React components, building Next.js pages, implementing client-side state management, handling SSR vs CSR decisions, creating frontend layouts, or when the user asks about component structure, React hooks, or UI architecture. Also activate when working with shared types between frontend and backend, or when implementing optimistic UI updates.
origin: ECC
---

# Next.js Frontend Engineering

Production patterns for building Next.js/React frontends with TypeScript. These conventions prioritize type safety, rendering strategy decisions, and clean component architecture.

## When to Activate

- Creating React components or Next.js pages
- Deciding between SSR and CSR for a page
- Implementing client-side state management
- Building real-time UI with WebSocket-driven updates
- Sharing types between frontend and backend
- Structuring a Next.js project

## Rendering Strategy

Choose the rendering approach based on what the page needs, not a blanket rule.

| Page Type | Strategy | Why |
|-----------|----------|-----|
| Landing, marketing | SSR (Server Components) | SEO, fast initial paint, no interactivity needed |
| Auth pages (login, register) | SSR with client hydration | SEO for the page shell, form interactivity via client components |
| Game lobby | CSR (Client Component) | Dynamic content, real-time updates, no SEO value |
| Active gameplay | CSR (Client Component) | Fully interactive, WebSocket-driven, latency-sensitive |
| User profile, settings | SSR with client islands | Static layout with interactive sections |

```typescript
// SSR page — Server Component (default in App Router)
// app/page.tsx
export default async function LandingPage() {
  const stats = await getPublicStats();
  return <LandingLayout stats={stats} />;
}

// CSR page — 'use client' for interactive pages
// app/game/[gameId]/page.tsx
'use client';

import { useGameSocket } from '@/hooks/useGameSocket';

export default function GamePage({ params }: { params: { gameId: string } }) {
  const { gameState, sendAction } = useGameSocket(params.gameId);
  return <GameBoard state={gameState} onAction={sendAction} />;
}
```

## Project Structure

```
src/
├── app/                      # Next.js App Router
│   ├── layout.tsx            # Root layout (providers, global styles)
│   ├── page.tsx              # Landing page (SSR)
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── lobby/
│   │   └── page.tsx          # Room browser (CSR)
│   └── game/
│       └── [gameId]/page.tsx # Active game (CSR)
├── components/
│   ├── ui/                   # Reusable primitives (Button, Card, Modal)
│   ├── game/                 # Game-specific components (Hand, Pile, PlayerSlot)
│   ├── lobby/                # Lobby components (RoomCard, PlayerList)
│   └── layout/               # Shell components (Header, Sidebar)
├── hooks/                    # Custom React hooks
│   ├── useGameSocket.ts
│   ├── useAuth.ts
│   └── useRoomState.ts
├── lib/                      # Utilities and API clients
│   ├── api.ts                # HTTP client wrapper
│   └── socket.ts             # Socket.IO client singleton
├── stores/                   # Client state (if using Zustand or similar)
└── types/                    # Shared TypeScript types
    └── shared.ts             # Types imported from backend /shared
```

## Component Patterns

### Component File Organization

One component per file. Colocate the component with its types and styles. Export only the component — keep helpers private.

```typescript
// components/game/PlayerHand.tsx
'use client';

import { type Card } from '@/types/shared';

interface PlayerHandProps {
  cards: Card[];
  isActive: boolean;
  onPlayCards: (cardIds: string[]) => void;
}

export function PlayerHand({ cards, isActive, onPlayCards }: PlayerHandProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleCard(cardId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  }

  function handlePlay() {
    onPlayCards([...selected]);
    setSelected(new Set());
  }

  return (
    <div className="player-hand">
      {cards.map((card) => (
        <CardComponent
          key={card.id}
          card={card}
          selected={selected.has(card.id)}
          onClick={() => isActive && toggleCard(card.id)}
        />
      ))}
      {isActive && selected.size > 0 && (
        <button onClick={handlePlay}>Play</button>
      )}
    </div>
  );
}
```

### Props Design

- Use interfaces for props — named `ComponentNameProps`
- Prefer specific props over passing entire objects when only a few fields are needed
- Use children sparingly — prefer named slots via props for complex layouts
- Callbacks follow `onEventName` pattern

```typescript
// GOOD — specific props
interface RoomCardProps {
  name: string;
  playerCount: number;
  maxPlayers: number;
  onJoin: () => void;
}

// AVOID — passing the whole object when you only need 3 fields
interface RoomCardProps {
  room: Room;
  onJoin: () => void;
}
```

## State Management

### Local State First

Start with React `useState` and `useReducer`. Only reach for external state management when state must be shared across unrelated component trees.

```
Local state (useState)        → Component-scoped UI state
useReducer                    → Complex local state with many transitions
Context                       → Theme, auth status, locale (low-frequency updates)
External store (Zustand)      → High-frequency shared state (game state, presence)
Server state (React Query)    → Cached API data with refetch and invalidation
```

### Shared Types

Types flow from backend to frontend. The backend defines the canonical types; the frontend imports them. Never duplicate type definitions.

```typescript
// Backend: shared/types.ts
export interface GameState {
  id: string;
  phase: 'waiting' | 'playing' | 'finished';
  players: PlayerState[];
  pile: Card[];
  currentPlayerIndex: number;
}

// Frontend: types/shared.ts
// Re-export from backend shared types
export type { GameState, PlayerState, Card } from '@backend/shared/types';
```

If a monorepo isn't set up, use a shared package or generate types from the API contract.

## Real-Time UI Patterns

### Socket Hook

Encapsulate WebSocket connection lifecycle in a custom hook. The hook manages connect/disconnect, event listeners, and reconnection. Components consume the hook — they never touch the socket directly.

```typescript
// hooks/useGameSocket.ts
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import type { GameState, GameAction } from '@/types/shared';

export function useGameSocket(gameId: string) {
  const socketRef = useRef<Socket | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io('/game', {
      auth: { token: getAccessToken() },
      query: { gameId },
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('state:full_sync', (state: GameState) => setGameState(state));
    socket.on('state:update', (patch: Partial<GameState>) => {
      setGameState((prev) => prev ? { ...prev, ...patch } : prev);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [gameId]);

  const sendAction = useCallback((action: GameAction) => {
    socketRef.current?.emit(`action:${action.type}`, action.payload);
  }, []);

  return { gameState, connected, sendAction };
}
```

### Optimistic Updates

For latency-sensitive interactions (playing a card, toggling ready state), update the UI immediately and reconcile when the server confirms.

```typescript
function handlePlayCards(cardIds: string[]) {
  // Optimistic: remove cards from hand immediately
  setLocalHand((prev) => prev.filter((c) => !cardIds.includes(c.id)));

  // Send to server
  sendAction({ type: 'play_cards', payload: { cardIds } });

  // Server will send state:update which reconciles
  // If the action was invalid, state:update restores the cards
}
```

## API Client

Wrap `fetch` in a typed client that handles auth tokens, error parsing, and response envelope unwrapping.

```typescript
// lib/api.ts
import type { SuccessResponse, ErrorResponse } from '@/types/shared';

class ApiClient {
  private baseUrl = '/api/v1';
  private accessToken: string | null = null;

  setToken(token: string | null) {
    this.accessToken = token;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
      credentials: 'include', // send refresh token cookie
    });

    if (!res.ok) {
      const error: ErrorResponse = await res.json();
      throw new ApiError(error.error.code, error.error.message, res.status);
    }

    const body: SuccessResponse<T> = await res.json();
    return body.data;
  }

  get<T>(path: string) { return this.request<T>(path); }
  post<T>(path: string, data: unknown) {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
```

## Error Boundaries

Wrap page-level components in error boundaries to prevent a crash in one section from taking down the entire page.

```typescript
// components/ui/ErrorBoundary.tsx
'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
    // Report to error tracking service
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
```

## Checklist

Before shipping frontend code:

- [ ] Rendering strategy matches the page's needs (SSR vs CSR)
- [ ] Components are typed with explicit Props interfaces
- [ ] Shared types imported from backend — no duplication
- [ ] WebSocket connections cleaned up on unmount
- [ ] Error boundaries wrap page-level sections
- [ ] No direct DOM manipulation — use React state
- [ ] API calls go through the typed client, not raw fetch
- [ ] Loading and error states handled for async operations
- [ ] No `any` types — use proper generics or `unknown` with narrowing
