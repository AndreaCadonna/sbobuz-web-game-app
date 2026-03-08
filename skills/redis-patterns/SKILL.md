---
name: redis-patterns
description: Redis caching, pub/sub, session management, and real-time state patterns for Node.js/TypeScript applications. Covers key naming, data structures, TTL strategy, pub/sub backplane, and memory management. Use this skill whenever implementing caching, session stores, rate limiting with Redis, managing real-time game state in Redis, setting up pub/sub for cross-instance communication, or when the user asks about Redis key design, eviction policies, or Redis-backed features. Also activate when deciding what data belongs in Redis vs PostgreSQL.
origin: ECC
---

# Redis Patterns

Production patterns for using Redis as a cache, session store, pub/sub backplane, and real-time state manager in Node.js/TypeScript backends.

## When to Activate

- Implementing caching or session storage
- Designing Redis key schemas
- Setting up pub/sub for cross-instance messaging
- Managing real-time state (game state, room state, presence)
- Implementing rate limiting
- Deciding Redis vs PostgreSQL for a data concern

## What Belongs in Redis

Redis is for data that benefits from sub-millisecond access and can be reconstructed if lost. If losing the data would cause permanent harm, it belongs in PostgreSQL.

| Use Case | Redis Key Pattern | TTL | Rebuild Strategy |
|----------|------------------|-----|------------------|
| Active game state | `game:{gameId}:state` | None (removed on game end) | Replay from action log in PostgreSQL |
| Game snapshots | `game:{gameId}:snapshot` | None | Regenerate from action log |
| Room state | `room:{roomId}` | 24h | Rooms are ephemeral; expired = disbanded |
| Public room list | `room:public_list` | None (maintained via set operations) | Scan room keys |
| User session | `session:{userId}` | 7d (matches refresh token TTL) | User re-authenticates |
| Refresh token | `refresh:{tokenHash}` | 7d | User re-authenticates |
| Rate limit counter | `rate:{userId}:{endpoint}` | Window duration (e.g., 60s) | Counter resets naturally |
| Pub/sub channels | `ws:room:{roomId}` | N/A (channel, not key) | Reconnect subscribes |

## Key Naming Conventions

Use colon-separated namespaces. Keys should be readable and greppable.

```
{domain}:{identifier}:{subfield}

game:abc123:state          # Game state
game:abc123:snapshot       # Latest snapshot
room:def456                # Room metadata (hash)
session:user789            # Session data (hash)
refresh:sha256hash         # Refresh token record
rate:user789:auth/login    # Rate limit counter
ws:room:def456             # Pub/sub channel name
```

### Rules

- Use colons `:` as separators — the Redis convention
- Keep keys short but readable — `g:abc:s` saves bytes but loses clarity
- Use the entity ID, not the entity name — IDs are unique, names aren't
- Never put user input directly in key names without validation — prevent key injection

## Data Structure Selection

Redis has purpose-built data structures. Using the right one avoids encoding/decoding overhead and enables atomic operations.

| Need | Structure | Why |
|------|-----------|-----|
| Full game state (read/write as unit) | String (JSON) | Simple get/set, atomic replacement |
| Room metadata (read/write individual fields) | Hash | Partial reads/writes without deserializing |
| Public room list | Sorted Set | Ranked by creation time, range queries |
| Player set in a room | Set | Add/remove/membership checks |
| Rate limit log | Sorted Set | Score = timestamp, range for sliding window |
| Leaderboard (if cached) | Sorted Set | Score = rating, ZREVRANGE for top-N |

### String (JSON) — Game State

```typescript
// Store full game state as JSON string
async function saveGameState(gameId: string, state: GameState): Promise<void> {
  await redis.set(
    `game:${gameId}:state`,
    JSON.stringify(state),
  );
}

async function getGameState(gameId: string): Promise<GameState | null> {
  const raw = await redis.get(`game:${gameId}:state`);
  return raw ? JSON.parse(raw) : null;
}
```

### Hash — Room Metadata

```typescript
// Store room fields individually
async function createRoom(roomId: string, room: RoomData): Promise<void> {
  await redis.hset(`room:${roomId}`, {
    hostId: room.hostId,
    name: room.name,
    maxPlayers: String(room.maxPlayers),
    isPublic: room.isPublic ? '1' : '0',
    createdAt: new Date().toISOString(),
  });
  await redis.expire(`room:${roomId}`, 86400); // 24h TTL
}

// Read a single field without fetching the whole room
async function getRoomHost(roomId: string): Promise<string | null> {
  return redis.hget(`room:${roomId}`, 'hostId');
}
```

### Sorted Set — Rate Limiting (Sliding Window Log)

```typescript
async function checkRateLimit(
  userId: string,
  endpoint: string,
  windowMs: number,
  maxRequests: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `rate:${userId}:${endpoint}`;
  const now = Date.now();
  const windowStart = now - windowMs;

  const pipe = redis.pipeline();
  pipe.zremrangebyscore(key, 0, windowStart);    // Remove expired entries
  pipe.zadd(key, now, `${now}:${randomUUID()}`); // Add current request
  pipe.zcard(key);                                // Count requests in window
  pipe.expire(key, Math.ceil(windowMs / 1000));   // Set TTL to window size

  const results = await pipe.exec();
  const count = results![2][1] as number;

  return {
    allowed: count <= maxRequests,
    remaining: Math.max(0, maxRequests - count),
  };
}
```

## Pub/Sub Backplane

When running multiple Node.js instances, use Redis pub/sub to broadcast events across instances. This is how Socket.IO's Redis adapter works under the hood.

```typescript
import { createClient } from 'redis';

// Dedicated connections for pub/sub (pub/sub blocks the connection)
const publisher = createClient({ url: config.REDIS_URL });
const subscriber = createClient({ url: config.REDIS_URL });

// Publish a room event (from any instance)
async function broadcastToRoom(roomId: string, event: string, data: unknown): Promise<void> {
  await publisher.publish(
    `ws:room:${roomId}`,
    JSON.stringify({ event, data }),
  );
}

// Subscribe to room events (on each instance)
async function subscribeToRoom(roomId: string, handler: (msg: RoomMessage) => void): Promise<void> {
  await subscriber.subscribe(`ws:room:${roomId}`, (message) => {
    handler(JSON.parse(message));
  });
}
```

### Pub/Sub Rules

- Use dedicated connections for subscribers — a subscribed connection cannot run other commands
- Pub/sub is fire-and-forget — there's no guarantee of delivery if a subscriber is down
- Channel names follow the same namespace convention as keys
- Unsubscribe from channels when no longer needed (e.g., room disbanded, game ended)

## Session Management

```typescript
// Store session data on login
async function createSession(userId: string, sessionData: SessionData): Promise<void> {
  await redis.hset(`session:${userId}`, {
    refreshTokenHash: sessionData.refreshTokenHash,
    deviceInfo: sessionData.deviceInfo,
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  });
  await redis.expire(`session:${userId}`, 604800); // 7 days
}

// Invalidate session on logout
async function destroySession(userId: string): Promise<void> {
  await redis.del(`session:${userId}`);
}

// Check if session is still valid
async function isSessionValid(userId: string): Promise<boolean> {
  return (await redis.exists(`session:${userId}`)) === 1;
}
```

## Connection Setup

```typescript
import Redis from 'ioredis';
import { getConfig } from '../config';
import { logger } from './logger';

const config = getConfig();

export const redis = new Redis(config.REDIS_URL, {
  commandTimeout: config.REDIS_COMMAND_TIMEOUT_MS,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) return null; // Stop retrying
    return Math.min(times * 200, 2000); // Exponential backoff, max 2s
  },
  lazyConnect: false,
});

redis.on('error', (err) => {
  logger.error({ err }, 'redis_connection_error');
});

redis.on('connect', () => {
  logger.info('redis_connected');
});
```

## Memory Management

Redis runs in-memory. Without limits, it will consume all available RAM and crash. Configure a memory ceiling and eviction policy.

```
# redis.conf or Docker command
maxmemory 256mb
maxmemory-policy allkeys-lru
```

| Policy | Use When |
|--------|----------|
| `allkeys-lru` | General caching — evict least recently used keys |
| `volatile-lru` | Only evict keys with TTL set — protect permanent keys |
| `noeviction` | Critical data — reject writes when full (alerts you to capacity issues) |

For game state, prefer `noeviction` and monitor memory usage. Losing active game state mid-game is worse than rejecting new game creation.

## Error Handling

Redis operations should fail gracefully. A Redis outage should degrade features, not crash the server.

```typescript
async function getCachedLeaderboard(): Promise<LeaderboardEntry[] | null> {
  try {
    const cached = await redis.get('cache:leaderboard');
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    logger.warn({ err }, 'redis_cache_miss_error');
    return null; // Fall through to database query
  }
}
```

For rate limiting, decide on fail-open vs fail-closed:
- **Fail-open** (allow request) — better UX, risk of abuse during outage
- **Fail-closed** (reject request) — safer, but blocks legitimate users during outage

## Checklist

Before shipping Redis-backed features:

- [ ] Keys follow namespace convention (`domain:id:subfield`)
- [ ] TTLs set on all non-permanent keys
- [ ] Data structure matches the access pattern (hash vs string vs sorted set)
- [ ] Pub/sub uses dedicated connections
- [ ] Error handling degrades gracefully on Redis failure
- [ ] Memory limit configured with appropriate eviction policy
- [ ] No user input directly in key names without validation
- [ ] Pipeline or multi used for multi-step atomic operations
- [ ] Connection configured with timeouts and retry strategy
