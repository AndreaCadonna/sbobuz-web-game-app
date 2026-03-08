---
name: websocket-realtime
description: WebSocket and real-time communication patterns using Socket.IO for Node.js/TypeScript applications. Covers connection lifecycle, room management, event design, presence tracking, reconnection handling, and cross-instance broadcasting. Use this skill whenever implementing WebSocket servers, handling real-time events, managing room-based communication, implementing presence systems, or when the user asks about Socket.IO patterns, WebSocket architecture, connection lifecycle, or real-time state synchronization. Also activate when designing event schemas, implementing reconnection logic, or scaling WebSocket servers across multiple instances.
origin: ECC
---

# WebSocket & Real-Time Communication

Production patterns for real-time communication using Socket.IO in Node.js/TypeScript backends. These conventions cover connection lifecycle, event design, room management, and multi-instance scaling.

## When to Activate

- Implementing a WebSocket server
- Designing real-time event schemas
- Managing rooms and broadcasts
- Implementing presence tracking
- Handling reconnection and disconnection
- Scaling WebSocket servers across multiple instances

## Socket.IO Server Setup

```typescript
import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

export async function createSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.CORS_ALLOWED_ORIGINS.split(','),
      credentials: true,
    },
    pingInterval: config.WS_PING_INTERVAL_MS,      // 25s
    pingTimeout: config.WS_PING_TIMEOUT_MS,         // 5s
    maxHttpBufferSize: config.WS_MAX_PAYLOAD_BYTES,  // 16KB
    connectionStateRecovery: {
      maxDisconnectionDuration: 30_000, // 30s — recover state on brief disconnects
    },
  });

  // Redis adapter for multi-instance broadcasting
  const pubClient = createClient({ url: config.REDIS_URL });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));

  // Authentication middleware
  io.use(socketAuthMiddleware);

  // Connection handler
  io.on('connection', (socket) => {
    handleConnection(io, socket);
  });

  return io;
}
```

## Authentication

Authenticate WebSocket connections during the handshake, not after. A connection that passes `io.use()` is trusted — events don't need to re-authenticate.

```typescript
import { Socket } from 'socket.io';
import { verifyAccessToken } from '../auth/jwt';

function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('UNAUTHORIZED: Missing token'));
  }

  try {
    const payload = verifyAccessToken(token);
    socket.data.userId = payload.sub;
    socket.data.username = payload.username;
    next();
  } catch {
    next(new Error('UNAUTHORIZED: Invalid token'));
  }
}
```

### Connection Limit

Prevent a single user from opening too many concurrent connections (tab spam, bugs, abuse):

```typescript
const MAX_CONNECTIONS_PER_USER = 3;
const userConnections = new Map<string, Set<string>>();

function trackConnection(socket: Socket): boolean {
  const userId = socket.data.userId;
  const connections = userConnections.get(userId) ?? new Set();

  if (connections.size >= MAX_CONNECTIONS_PER_USER) {
    return false; // Reject connection
  }

  connections.add(socket.id);
  userConnections.set(userId, connections);
  return true;
}

function untrackConnection(socket: Socket): void {
  const userId = socket.data.userId;
  const connections = userConnections.get(userId);
  if (connections) {
    connections.delete(socket.id);
    if (connections.size === 0) userConnections.delete(userId);
  }
}
```

## Event Design

### Event Naming Convention

```
Direction     Pattern                   Examples
───────────── ───────────────────────── ──────────────────
Client→Server action:{action_type}      action:play_cards
              room:{operation}          room:join, room:leave, room:ready
              ping                      ping

Server→Client state:{update_type}       state:full_sync, state:update
              room:{event}              room:updated, room:player_joined
              presence:{event}          presence:online, presence:offline
              error                     error
              server:draining           server:draining
              pong                      pong
```

### Event Payload Types

Define typed event maps for type-safe emit/on.

```typescript
// Types for client-to-server events
interface ClientToServerEvents {
  'action:play_cards': (payload: { cardIds: string[] }) => void;
  'action:play_blind': (payload: { index: number }) => void;
  'action:pick_up_pile': () => void;
  'action:declare_direction': (payload: { direction: 'higher' | 'lower' }) => void;
  'room:join': (payload: { roomId: string; password?: string }) => void;
  'room:leave': () => void;
  'room:ready': () => void;
  'room:unready': () => void;
  'ping': () => void;
}

// Types for server-to-client events
interface ServerToClientEvents {
  'state:full_sync': (state: ClientGameState) => void;
  'state:update': (patch: GameStatePatch) => void;
  'room:updated': (room: ClientRoomState) => void;
  'room:player_joined': (player: PlayerInfo) => void;
  'room:player_left': (payload: { userId: string }) => void;
  'presence:online': (payload: { userId: string }) => void;
  'presence:offline': (payload: { userId: string }) => void;
  'error': (error: { code: string; message: string }) => void;
  'server:draining': () => void;
  'pong': () => void;
}

// Typed server
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
```

## Connection Lifecycle

```typescript
function handleConnection(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  // Track connection
  if (!trackConnection(socket)) {
    socket.emit('error', { code: 'MAX_CONNECTIONS', message: 'Too many connections' });
    socket.disconnect();
    return;
  }

  logger.info({ userId, socketId: socket.id }, 'ws_connected');

  // Register event handlers
  socket.on('room:join', (payload) => handleRoomJoin(io, socket, payload));
  socket.on('room:leave', () => handleRoomLeave(io, socket));
  socket.on('room:ready', () => handleRoomReady(io, socket));
  socket.on('action:play_cards', (payload) => handlePlayCards(io, socket, payload));
  socket.on('action:pick_up_pile', () => handlePickUpPile(io, socket));
  socket.on('action:declare_direction', (payload) => handleDeclareDirection(io, socket, payload));
  socket.on('ping', () => socket.emit('pong'));

  // Disconnection
  socket.on('disconnect', (reason) => {
    handleDisconnect(io, socket, reason);
    untrackConnection(socket);
    logger.info({ userId, socketId: socket.id, reason }, 'ws_disconnected');
  });
}
```

## Room Management

Socket.IO rooms are the mechanism for broadcasting to groups of connected clients.

```typescript
async function handleRoomJoin(io: Server, socket: Socket, payload: { roomId: string }) {
  const { roomId } = payload;
  const userId = socket.data.userId;

  // Validate room exists and has space
  const room = await roomService.getRoom(roomId);
  if (!room) {
    socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Room does not exist' });
    return;
  }

  // Leave any current room first
  if (socket.data.currentRoomId) {
    await handleRoomLeave(io, socket);
  }

  // Join the Socket.IO room
  socket.join(roomId);
  socket.data.currentRoomId = roomId;

  // Update room state in Redis
  await roomService.addPlayer(roomId, userId);

  // Notify other players in the room
  socket.to(roomId).emit('room:player_joined', {
    userId,
    username: socket.data.username,
  });

  // Send full room state to the joining player
  const updatedRoom = await roomService.getRoom(roomId);
  socket.emit('room:updated', updatedRoom);
}
```

### Broadcasting Patterns

```typescript
// To everyone in a room (including sender)
io.to(roomId).emit('state:full_sync', gameState);

// To everyone in a room except sender
socket.to(roomId).emit('room:player_joined', playerInfo);

// To a specific user (by their socket IDs)
const userSockets = await io.in(userId).fetchSockets();
userSockets.forEach((s) => s.emit('state:update', patch));

// To everyone (server-wide announcement)
io.emit('server:draining');
```

## Disconnection and Reconnection

Handle disconnects gracefully. In a real-time game, a brief network hiccup shouldn't forfeit the game.

```typescript
async function handleDisconnect(io: Server, socket: Socket, reason: string) {
  const userId = socket.data.userId;
  const roomId = socket.data.currentRoomId;

  if (!roomId) return;

  // Notify room of disconnection
  socket.to(roomId).emit('presence:offline', { userId });

  // Start grace period — don't remove player immediately
  const graceMs = config.DEFAULT_DISCONNECT_GRACE_SECONDS * 1000;

  // Store timeout reference in Redis so any instance can cancel it
  await redis.set(
    `disconnect_grace:${roomId}:${userId}`,
    Date.now().toString(),
    'PX', graceMs,
  );

  // After grace period, if not reconnected, remove from game
  setTimeout(async () => {
    const stillDisconnected = await redis.get(`disconnect_grace:${roomId}:${userId}`);
    if (stillDisconnected) {
      await roomService.removePlayer(roomId, userId);
      io.to(roomId).emit('room:player_left', { userId });
      logger.info({ userId, roomId }, 'player_removed_after_grace_period');
    }
  }, graceMs);
}
```

### Reconnection

When a player reconnects, cancel the grace period and restore their state:

```typescript
async function handleReconnection(io: Server, socket: Socket, roomId: string) {
  const userId = socket.data.userId;

  // Cancel grace period
  await redis.del(`disconnect_grace:${roomId}:${userId}`);

  // Rejoin the Socket.IO room
  socket.join(roomId);
  socket.data.currentRoomId = roomId;

  // Notify room of reconnection
  socket.to(roomId).emit('presence:online', { userId });

  // Send full state sync to the reconnected player
  const gameState = await gameService.getState(roomId);
  if (gameState) {
    socket.emit('state:full_sync', gameState);
  }
}
```

## State Synchronization

### Full Sync vs Partial Update

```
full_sync  — Send complete game state. Used on:
             - Initial connection
             - Reconnection
             - When client state might be stale

update     — Send only what changed. Used on:
             - After each game action
             - Room state changes (player joined/left)
             - Presence changes
```

### Client View Filtering

Never send the full server state to clients. Each player should only see their own hand and public information.

```typescript
function createClientView(state: GameState, playerId: string): ClientGameState {
  return {
    id: state.id,
    phase: state.phase,
    pile: state.pile,
    currentPlayerIndex: state.currentPlayerIndex,
    direction: state.direction,
    players: state.players.map((p) => ({
      id: p.id,
      username: p.username,
      handCount: p.hand.length,           // Other players: just the count
      hand: p.id === playerId ? p.hand : undefined,  // Only your own hand
      faceUp: p.faceUp,                   // Visible to everyone
      faceDownCount: p.faceDown.length,   // Only the count
    })),
  };
}
```

## Multi-Instance Scaling

When running multiple Node.js instances behind a load balancer, clients on different instances need to communicate. Socket.IO's Redis adapter handles this.

```
Instance A ──┐         ┌── Client 1 (Room X)
             ├─ Redis ─┤
Instance B ──┘         └── Client 2 (Room X, different instance)

Instance A emits to Room X → Redis pub/sub → Instance B delivers to Client 2
```

This is set up in the server setup section above (`createAdapter`). It's transparent to your event handlers — `io.to(roomId).emit()` works across instances.

## Graceful Shutdown

When a server instance shuts down (deploy, scale-down), notify connected clients so they can reconnect to another instance.

```typescript
async function gracefulShutdown(io: Server) {
  // Notify all connected clients
  io.emit('server:draining');

  // Snapshot active games to Redis
  for (const [gameId, game] of activeGames) {
    await redis.set(`game:${gameId}:state`, JSON.stringify(game.state));
  }

  // Close all connections (clients will auto-reconnect to another instance)
  io.close();
}
```

## Error Handling

Never let a handler error crash the process. Wrap event handlers and emit structured errors back to the client.

```typescript
function safeHandler<T>(
  handler: (io: Server, socket: Socket, payload: T) => Promise<void>,
) {
  return async (io: Server, socket: Socket, payload: T) => {
    try {
      await handler(io, socket, payload);
    } catch (err) {
      logger.error({ err, socketId: socket.id, userId: socket.data.userId }, 'ws_handler_error');
      if (err instanceof AppError) {
        socket.emit('error', { code: err.code, message: err.message });
      } else {
        socket.emit('error', { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
      }
    }
  };
}
```

## Checklist

Before shipping WebSocket code:

- [ ] Authentication happens in handshake middleware, not after connection
- [ ] Connection limit per user enforced
- [ ] Event names follow convention (`action:*`, `state:*`, `room:*`, `presence:*`)
- [ ] Events are typed with `ClientToServerEvents` / `ServerToClientEvents`
- [ ] Client views filter out private state (other players' hands)
- [ ] Disconnection uses grace period before removing player
- [ ] Reconnection restores state and cancels grace period
- [ ] Redis adapter configured for multi-instance broadcasting
- [ ] Graceful shutdown notifies clients before closing connections
- [ ] All event handlers wrapped with error handling
- [ ] Payload size limited (`maxHttpBufferSize`)
