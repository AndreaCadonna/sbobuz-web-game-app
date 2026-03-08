# API Gateway and Middleware -- Routing, Authentication, and Request Processing

> **Document Type:** Architecture Spec
> **Status:** Draft
> **Last Updated:** March 2026

---

## 1. Overview

The API Gateway is the single entry point for all client traffic to the Sbobuz platform. It handles HTTP REST requests and WebSocket connections, applying a layered middleware pipeline before any request reaches business logic. The middleware pipeline enforces authentication (JWT validation), rate limiting (Redis-backed sliding window), input validation (Zod schemas), CORS policy, and structured error handling in a deterministic order.

The gateway is not a separate service. It is the outermost layer of the modular monolith, implemented as Express.js middleware applied to all routes. This keeps the system simple (one process, no network hops to a gateway service) while maintaining strict separation between routing concerns and business logic. The module-level route handlers receive only validated, authenticated, well-formed requests -- they never parse raw input or check tokens.

The gateway also manages the WebSocket handshake lifecycle. Socket.IO connections are authenticated during the initial handshake (JWT in the `auth` query parameter or handshake headers). Once authenticated, the WebSocket connection is bound to a user identity for its entire lifetime. No anonymous sockets are permitted. The gateway tracks active connections per user and enforces a maximum concurrent connection limit to prevent abuse.

---

## 2. Data Model

### 2.1 Request/Response Envelope

All HTTP API responses follow a consistent envelope format. This provides a predictable contract for the client.

```typescript
// Successful response envelope
interface ApiSuccessResponse<T> {
  success: true;
  data: T;                       // the payload, typed per endpoint
  meta?: {
    requestId: string;           // unique request identifier for debugging
    timestamp: string;           // ISO 8601 server timestamp
    pagination?: PaginationMeta; // present on list endpoints
  };
}

// Error response envelope
interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;             // machine-readable error code
    message: string;             // human-readable error description
    details?: unknown;           // additional context (validation errors, etc.)
    requestId: string;           // correlation ID
    timestamp: string;           // ISO 8601
  };
}

type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// Pagination metadata for list endpoints
interface PaginationMeta {
  page: number;                  // current page (1-indexed)
  pageSize: number;              // items per page
  totalItems: number;            // total matching items
  totalPages: number;            // ceil(totalItems / pageSize)
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### 2.2 Error Codes

```typescript
// Exhaustive error code catalog. Every error the API can return maps to one of these.
// Codes are namespaced by module for clarity.

type ErrorCode =
  // --- General ---
  | 'INTERNAL_ERROR'             // 500: unexpected server error
  | 'NOT_FOUND'                  // 404: resource not found
  | 'METHOD_NOT_ALLOWED'         // 405: wrong HTTP method
  | 'VALIDATION_ERROR'           // 400: request body/params failed validation
  | 'RATE_LIMITED'               // 429: too many requests

  // --- Auth ---
  | 'AUTH_REQUIRED'              // 401: no token provided
  | 'AUTH_INVALID_TOKEN'         // 401: token failed verification
  | 'AUTH_TOKEN_EXPIRED'         // 401: token is valid but expired
  | 'AUTH_INSUFFICIENT_PERMISSIONS' // 403: valid token but lacking permission
  | 'AUTH_ACCOUNT_LOCKED'        // 423: too many failed login attempts
  | 'AUTH_ACCOUNT_BANNED'        // 403: account permanently banned
  | 'AUTH_DUPLICATE_EMAIL'       // 409: email already registered
  | 'AUTH_DUPLICATE_USERNAME'    // 409: username already taken
  | 'AUTH_INVALID_CREDENTIALS'   // 401: wrong email/password
  | 'AUTH_REFRESH_INVALID'       // 401: refresh token invalid or revoked

  // --- Lobby ---
  | 'ROOM_NOT_FOUND'            // 404: room does not exist or expired
  | 'ROOM_FULL'                 // 409: room at max player capacity
  | 'ROOM_ALREADY_IN_GAME'      // 409: room already started a game
  | 'ROOM_NOT_HOST'             // 403: action requires room host role
  | 'ROOM_NOT_READY'            // 409: not all players are ready
  | 'ROOM_PLAYER_NOT_IN_ROOM'   // 404: player is not a member of this room

  // --- Game ---
  | 'GAME_NOT_FOUND'            // 404: game does not exist
  | 'GAME_INVALID_ACTION'       // 400: action is not valid in current game state
  | 'GAME_NOT_YOUR_TURN'        // 403: action submitted by wrong player
  | 'GAME_ALREADY_FINISHED'     // 409: game is in terminal state

  // --- WebSocket ---
  | 'WS_AUTH_FAILED'            // 401: WebSocket handshake auth failed
  | 'WS_MAX_CONNECTIONS'        // 429: user has too many concurrent connections
  | 'WS_INVALID_MESSAGE';       // 400: WebSocket message failed validation
```

### 2.3 JWT Token Structure

```typescript
// Access token payload (short-lived, stateless)
interface AccessTokenPayload {
  sub: string;                   // userId (subject)
  username: string;
  iat: number;                   // issued at (Unix timestamp)
  exp: number;                   // expires at (Unix timestamp, iat + 900 = 15 minutes)
  type: 'access';
}

// Refresh token payload (long-lived, stored in httpOnly cookie)
interface RefreshTokenPayload {
  sub: string;                   // userId
  jti: string;                   // unique token ID for revocation tracking
  iat: number;
  exp: number;                   // iat + 604800 = 7 days
  type: 'refresh';
}

// JWT signing configuration
interface JwtConfig {
  algorithm: 'HS256';            // HMAC-SHA256
  accessTokenTtlSeconds: 900;    // 15 minutes
  refreshTokenTtlSeconds: 604800; // 7 days
  issuer: 'sbobuz';
  audience: 'sbobuz-client';
}
```

### 2.4 Rate Limit Configuration

```typescript
interface RateLimitConfig {
  // Default limits (applied to all endpoints unless overridden)
  default: {
    windowMs: 60000;             // 1-minute sliding window
    maxRequests: 100;            // 100 requests per window per user
  };

  // Per-endpoint overrides
  endpoints: {
    'POST /api/v1/auth/login': {
      windowMs: 900000;          // 15-minute window
      maxRequests: 10;           // 10 login attempts per 15 minutes
      keyBy: 'ip';               // rate limit by IP, not user (user is not authenticated yet)
    };
    'POST /api/v1/auth/register': {
      windowMs: 3600000;         // 1-hour window
      maxRequests: 5;            // 5 registration attempts per hour
      keyBy: 'ip';
    };
    'POST /api/v1/auth/refresh': {
      windowMs: 60000;           // 1-minute window
      maxRequests: 10;           // 10 refresh attempts per minute
      keyBy: 'userId';
    };
    'POST /api/v1/rooms': {
      windowMs: 60000;
      maxRequests: 5;            // 5 room creations per minute
      keyBy: 'userId';
    };
    'GET /api/v1/rooms': {
      windowMs: 10000;           // 10-second window
      maxRequests: 20;           // 20 list requests per 10 seconds
      keyBy: 'userId';
    };
    'GET /api/v1/leaderboard': {
      windowMs: 10000;
      maxRequests: 10;           // 10 leaderboard requests per 10 seconds
      keyBy: 'userId';
    };
  };

  // WebSocket rate limits
  websocket: {
    messagesPerSecond: 10;       // max 10 messages per second per connection
    burstSize: 20;               // allow burst of 20 messages, then throttle
  };
}
```

### 2.5 CORS Configuration

```typescript
interface CorsConfig {
  development: {
    origin: ['http://localhost:3001']; // Next.js dev server
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
    allowedHeaders: ['Content-Type', 'Authorization'];
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'];
    credentials: true;           // allow cookies (refresh token)
    maxAge: 86400;               // preflight cache: 24 hours
  };

  staging: {
    origin: ['https://staging.sbobuz.com'];
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
    allowedHeaders: ['Content-Type', 'Authorization'];
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'];
    credentials: true;
    maxAge: 86400;
  };

  production: {
    origin: ['https://sbobuz.com', 'https://www.sbobuz.com'];
    // NEVER use '*' in production -- violates security policy
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
    allowedHeaders: ['Content-Type', 'Authorization'];
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining'];
    credentials: true;
    maxAge: 86400;
  };
}
```

---

## 3. Route Structure

### 3.1 REST API Routes

All routes are prefixed with `/api/v1`. Versioning is path-based.

```typescript
interface RouteMap {
  // --- Auth Module ---
  'POST   /api/v1/auth/register': {
    body: RegisterRequest;
    response: AuthResponse;
    auth: false;                 // public endpoint
    rateLimit: 'POST /api/v1/auth/register';
  };
  'POST   /api/v1/auth/login': {
    body: LoginRequest;
    response: AuthResponse;
    auth: false;
    rateLimit: 'POST /api/v1/auth/login';
  };
  'POST   /api/v1/auth/refresh': {
    body: {};                    // refresh token comes from httpOnly cookie
    response: RefreshResponse;
    auth: false;                 // uses refresh token, not access token
    rateLimit: 'POST /api/v1/auth/refresh';
  };
  'POST   /api/v1/auth/logout': {
    body: {};
    response: {};
    auth: true;
    rateLimit: 'default';
  };
  'GET    /api/v1/auth/me': {
    response: UserProfile;
    auth: true;
    rateLimit: 'default';
  };

  // --- Lobby Module ---
  'POST   /api/v1/rooms': {
    body: CreateRoomRequest;
    response: RoomState;
    auth: true;
    rateLimit: 'POST /api/v1/rooms';
  };
  'GET    /api/v1/rooms': {
    query: ListRoomsQuery;
    response: PaginatedResponse<RoomSummary>;
    auth: true;
    rateLimit: 'GET /api/v1/rooms';
  };
  'GET    /api/v1/rooms/:roomId': {
    params: { roomId: string };
    response: RoomState;
    auth: true;
    rateLimit: 'default';
  };
  'POST   /api/v1/rooms/:roomId/join': {
    params: { roomId: string };
    body: JoinRoomRequest;       // optional: { roomCode } for private rooms
    response: RoomState;
    auth: true;
    rateLimit: 'default';
  };
  'POST   /api/v1/rooms/:roomId/leave': {
    params: { roomId: string };
    response: {};
    auth: true;
    rateLimit: 'default';
  };
  'POST   /api/v1/rooms/:roomId/ready': {
    params: { roomId: string };
    response: RoomState;
    auth: true;
    rateLimit: 'default';
  };
  'POST   /api/v1/rooms/:roomId/unready': {
    params: { roomId: string };
    response: RoomState;
    auth: true;
    rateLimit: 'default';
  };
  'POST   /api/v1/rooms/:roomId/start': {
    params: { roomId: string };
    response: { gameId: string };
    auth: true;                  // host only (checked in handler)
    rateLimit: 'default';
  };

  // --- Game Module (read-only via REST; actions via WebSocket) ---
  'GET    /api/v1/games/:gameId': {
    params: { gameId: string };
    response: GameStateView;     // filtered view based on requesting player
    auth: true;
    rateLimit: 'default';
  };
  'GET    /api/v1/games/:gameId/actions': {
    params: { gameId: string };
    query: { from?: number };    // optional: start from action index
    response: GameActionEntry[];
    auth: true;
    rateLimit: 'default';
  };

  // --- Leaderboard Module ---
  'GET    /api/v1/leaderboard': {
    query: LeaderboardQuery;
    response: PaginatedResponse<LeaderboardEntry>;
    auth: true;
    rateLimit: 'GET /api/v1/leaderboard';
  };
  'GET    /api/v1/users/:userId/stats': {
    params: { userId: string };
    response: PlayerStats;
    auth: true;
    rateLimit: 'default';
  };
  'GET    /api/v1/users/:userId/match-history': {
    params: { userId: string };
    query: PaginationQuery;
    response: PaginatedResponse<MatchHistoryEntry>;
    auth: true;
    rateLimit: 'default';
  };

  // --- Health (no auth, no rate limit) ---
  'GET    /health/live': {
    response: LivenessResponse;
    auth: false;
    rateLimit: false;
  };
  'GET    /health/ready': {
    response: ReadinessResponse;
    auth: false;
    rateLimit: false;
  };
  'GET    /health/capacity': {
    response: CapacityResponse;
    auth: false;
    rateLimit: false;
  };
}
```

### 3.2 Request/Response Types

```typescript
// --- Auth ---

interface RegisterRequest {
  email: string;                 // valid email, normalized to lowercase
  username: string;              // 3-30 chars, alphanumeric + underscores, unique
  displayName: string;           // 1-50 chars
  password: string;              // 8-128 chars, at least one uppercase, one lowercase, one digit
}

interface LoginRequest {
  email: string;
  password: string;
}

interface AuthResponse {
  accessToken: string;           // JWT access token in response body
  user: UserProfile;
  // Refresh token is set as httpOnly cookie, NOT in the response body
}

interface RefreshResponse {
  accessToken: string;           // new access token
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
  createdAt: string;
}

// --- Lobby ---

interface CreateRoomRequest {
  visibility: 'public' | 'private';
  maxPlayers: number;            // 2-5
  turnTimerSeconds: number;      // 15-300
  disconnectGraceSeconds: number; // 10-120
}

interface JoinRoomRequest {
  roomCode?: string;             // required for private rooms
}

interface ListRoomsQuery {
  page?: number;                 // default: 1
  pageSize?: number;             // default: 20, max: 50
  status?: 'waiting' | 'ready'; // filter by room status
}

interface RoomSummary {
  id: string;
  hostUsername: string;
  playerCount: number;
  maxPlayers: number;
  status: RoomStatus;
  visibility: RoomVisibility;
  createdAt: string;
}

// --- Leaderboard ---

interface LeaderboardQuery {
  page?: number;                 // default: 1
  pageSize?: number;             // default: 20, max: 100
}

interface PlayerStats {
  userId: string;
  username: string;
  displayName: string;
  rating: number;
  peakRating: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;               // computed: gamesWon / gamesPlayed
  winStreak: number;
  bestWinStreak: number;
  rank: number;
}

interface MatchHistoryEntry {
  gameId: string;
  result: 'win' | 'loss';
  ratingChange: number;
  opponents: { userId: string; username: string }[];
  duration: number;              // seconds
  playedAt: string;
}

interface PaginationQuery {
  page?: number;
  pageSize?: number;
}
```

### 3.3 WebSocket Events

```typescript
// Client-to-server events (actions)
interface ClientToServerEvents {
  'action:play_cards': {
    gameId: string;
    cardIds: string[];
  };
  'action:play_blind': {
    gameId: string;
    cardIndex: number;           // 0, 1, or 2
  };
  'action:pick_up_pile': {
    gameId: string;
  };
  'action:declare_direction': {
    gameId: string;
    direction: 'higher' | 'lower';
  };
  'room:join': {
    roomId: string;
    roomCode?: string;
  };
  'room:leave': {
    roomId: string;
  };
  'room:ready': {
    roomId: string;
  };
  'room:unready': {
    roomId: string;
  };
  'ping': {};                    // client heartbeat
}

// Server-to-client events (state updates, notifications)
interface ServerToClientEvents {
  'state:update': {
    gameId: string;
    state: GameStateView;        // player-specific filtered view
    action: GameActionSummary;   // what just happened
  };
  'state:full_sync': {
    gameId: string;
    state: GameStateView;        // full current state (on join/reconnect)
  };
  'room:updated': {
    room: RoomState;             // full room state after any change
  };
  'room:game_starting': {
    roomId: string;
    gameId: string;
  };
  'presence:player_connected': {
    roomId: string;
    userId: string;
    username: string;
  };
  'presence:player_disconnected': {
    roomId: string;
    userId: string;
    username: string;
  };
  'presence:player_reconnected': {
    roomId: string;
    userId: string;
    username: string;
  };
  'error': {
    code: ErrorCode;
    message: string;
  };
  'server:draining': {};         // server is shutting down, client should reconnect
  'pong': {};                    // server heartbeat response
}
```

---

## 4. Middleware Pipeline

### 4.1 Execution Order

Middleware executes in this exact order on every HTTP request. The order is security-critical and must not be changed without a security review.

```
REQUEST ARRIVES
  |
  v
[1. Request ID Injection]
  |  Generates unique requestId (UUIDv4), attaches to req and AsyncLocalStorage.
  |  Sets X-Request-Id response header.
  |
  v
[2. CORS]
  |  Validates origin against allowed list. Rejects disallowed origins.
  |  Handles OPTIONS preflight requests.
  |
  v
[3. Body Parser]
  |  Parses JSON body (max 16KB). Rejects oversized payloads with 413.
  |  Rejects non-JSON Content-Type on POST/PUT with 415.
  |
  v
[4. Rate Limiter]
  |  Checks Redis-backed sliding window counter for this user/IP + endpoint.
  |  Returns 429 with Retry-After header if limit exceeded.
  |  Sets X-RateLimit-Remaining and X-RateLimit-Reset headers.
  |
  v
[5. Auth Middleware] (skipped for public routes)
  |  Extracts Bearer token from Authorization header.
  |  Verifies JWT signature, expiration, and structure.
  |  Attaches userId and username to request context.
  |  Returns 401 if token is missing, invalid, or expired.
  |
  v
[6. Route Matching]
  |  Express router matches the request to a handler.
  |  Returns 404 if no route matches.
  |  Returns 405 if route exists but method does not.
  |
  v
[7. Input Validation] (in route handler, before business logic)
  |  Validates request body, query params, and path params against Zod schemas.
  |  Returns 400 with detailed validation errors if schema check fails.
  |
  v
[8. Route Handler]
  |  Executes business logic via module interface.
  |  Returns structured response envelope.
  |
  v
[9. Error Handler] (global, catches unhandled errors)
  |  Catches any thrown error.
  |  Maps known error types to appropriate HTTP status codes and error codes.
  |  Maps unknown errors to 500 INTERNAL_ERROR.
  |  Logs error with full context (traceId, userId, requestId).
  |  Returns error response envelope.
  |
  v
RESPONSE SENT
```

### 4.2 WebSocket Middleware Pipeline

```
WEBSOCKET HANDSHAKE ARRIVES
  |
  v
[1. Auth Middleware]
  |  Extracts JWT from handshake auth parameter or query string.
  |  Verifies token. Rejects connection if invalid (Socket.IO error event).
  |  Attaches userId to socket instance.
  |
  v
[2. Connection Limit Check]
  |  Checks Redis for existing connections by this userId.
  |  If count >= 3 (max concurrent connections per user): reject.
  |  Registers this connection in Redis (ws:player:{userId}).
  |
  v
[3. Connection Established]
  |  Socket is now authenticated and tracked.
  |  All subsequent messages on this socket are associated with the userId.
  |
  v
MESSAGE ARRIVES ON ESTABLISHED CONNECTION
  |
  v
[4. Message Rate Limiter]
  |  Token bucket algorithm: 10 messages/second, burst of 20.
  |  If exceeded: drop message, emit 'error' event with RATE_LIMITED code.
  |
  v
[5. Message Validation]
  |  Validates message payload against Zod schema for the event type.
  |  If invalid: emit 'error' event with WS_INVALID_MESSAGE code.
  |
  v
[6. Event Handler]
  |  Routes to appropriate module handler.
  |  Handler processes the event and emits response events.
```

---

## 5. Behavior Rules

### 5.1 Rate Limiting -- Sliding Window Algorithm

The rate limiter uses a Redis-backed sliding window log algorithm. This provides more accurate rate limiting than fixed windows (no burst-at-boundary problem) while being simpler than true sliding windows.

```
ALGORITHM: Sliding Window Log

For each request:
  1. Compute the rate limit key:
     - Authenticated routes: "ratelimit:{userId}:{endpoint}"
     - Unauthenticated routes: "ratelimit:{ip}:{endpoint}"
  2. Get the current timestamp in milliseconds.
  3. Remove all entries from the sorted set older than (now - windowMs).
     Redis command: ZREMRANGEBYSCORE key 0 (now - windowMs)
  4. Count remaining entries in the sorted set.
     Redis command: ZCARD key
  5. If count >= maxRequests:
     a. Return 429 Too Many Requests.
     b. Set Retry-After header to (oldest_entry_timestamp + windowMs - now) / 1000.
     c. Set X-RateLimit-Remaining: 0.
     d. Set X-RateLimit-Reset: ceiling timestamp when window resets.
     e. Log rate limit event at 'warn' level.
     f. Increment sbobuz_rate_limit_hits_total metric.
     g. STOP processing. Do not execute subsequent middleware.
  6. If count < maxRequests:
     a. Add current timestamp to the sorted set.
        Redis command: ZADD key now now
     b. Set TTL on the key to windowMs (prevents unbounded growth).
        Redis command: PEXPIRE key windowMs
     c. Set X-RateLimit-Remaining: maxRequests - count - 1.
     d. Set X-RateLimit-Reset: now + windowMs.
     e. Continue to next middleware.
```

### 5.2 JWT Validation

```
For each authenticated request:
  1. Extract the Authorization header.
  2. Verify format: "Bearer {token}".
     - Missing header or wrong format: return 401 AUTH_REQUIRED.
  3. Decode the JWT without verification to read the header.
  4. Verify the JWT signature using the configured secret (HMAC-SHA256).
     - Invalid signature: return 401 AUTH_INVALID_TOKEN.
  5. Check the 'exp' claim.
     - Expired: return 401 AUTH_TOKEN_EXPIRED.
     - Client should attempt a token refresh on receiving this error.
  6. Check the 'type' claim === 'access'.
     - Wrong type (e.g., refresh token used as access token): return 401 AUTH_INVALID_TOKEN.
  7. Check the 'iss' claim === 'sbobuz'.
     - Wrong issuer: return 401 AUTH_INVALID_TOKEN.
  8. Extract userId (sub) and username from the payload.
  9. Attach to request context (available to all downstream handlers).
  10. Inject userId into AsyncLocalStorage (available to logger for correlation).
```

### 5.3 WebSocket Auth

```
On WebSocket handshake:
  1. Extract token from socket.handshake.auth.token OR socket.handshake.query.token.
     - Missing: reject connection with WS_AUTH_FAILED error.
  2. Perform the same JWT validation as HTTP auth middleware (steps 3-10 above).
     - Invalid: reject connection with WS_AUTH_FAILED error.
  3. Check user account status:
     a. Query Redis for session:{userId}.
     b. If session exists and user status is 'banned' or 'suspended': reject.
  4. Check concurrent connection limit:
     a. Query Redis for ws:player:{userId}.
     b. If connection already exists from this user:
        - If count < 3: allow (multiple tabs/devices).
        - If count >= 3: reject with WS_MAX_CONNECTIONS error.
  5. Register connection:
     a. Write ws:player:{userId} to Redis with connection metadata.
     b. Set TTL to 5 minutes (refreshed by heartbeat).
  6. Accept connection. Socket is now authenticated.
  7. On disconnect:
     a. Delete ws:player:{userId} from Redis (or decrement if tracking multiple).
     b. If user was in a room: trigger disconnect grace period logic.
```

### 5.4 Input Validation

Every route handler validates its inputs as the first operation, before any business logic executes. Validation uses Zod schemas defined alongside the route handlers.

```
VALIDATION FLOW:
  1. Path parameters validated against schema (e.g., roomId must be UUID).
  2. Query parameters validated against schema (e.g., page must be positive integer).
  3. Request body validated against schema (e.g., email must be valid format).
  4. If ANY validation fails:
     a. Collect all errors (not just the first one).
     b. Return 400 VALIDATION_ERROR with details array:
        [
          { field: "email", message: "Invalid email format", received: "not-an-email" },
          { field: "password", message: "Must be at least 8 characters", received: "***" }
        ]
     c. Sensitive fields (password) show "***" in the error detail, never the actual value.
  5. Validated and typed data is passed to the handler. Raw req.body is never used after validation.
```

```typescript
// Validation error detail format
interface ValidationErrorDetail {
  field: string;                 // dot-path to the invalid field (e.g., "body.email")
  message: string;               // human-readable validation message
  received: unknown;             // the value that was received (redacted for sensitive fields)
  expected?: string;             // description of what was expected
}
```

---

## 6. API Versioning Strategy

### 6.1 Approach

Path-based versioning: `/api/v1/...`.

```
Rules:
  1. All routes are versioned under /api/v1.
  2. When a breaking change is needed, a new version (/api/v2) is created.
  3. The old version continues to work for a deprecation period (minimum 6 months).
  4. Breaking changes include:
     - Removing a field from a response
     - Changing a field type in a response
     - Adding a required field to a request
     - Changing the meaning of an existing field
     - Removing an endpoint
  5. Non-breaking changes (no new version needed):
     - Adding an optional field to a request
     - Adding a field to a response
     - Adding a new endpoint
     - Adding a new optional query parameter
  6. The client specifies the version in the URL path, not via headers.
     This is explicit, cacheable, and simple.
```

### 6.2 Current Version

Only `v1` exists. No deprecations. Version negotiation is a future concern.

---

## 7. Edge Cases and Test Scenarios

| # | Scenario | Expected Behavior |
|---|---|---|
| 1 | Request with expired access token hits an authenticated endpoint | Auth middleware returns 401 AUTH_TOKEN_EXPIRED. Response includes error code. Client sends POST /api/v1/auth/refresh with httpOnly cookie. If refresh succeeds, client retries original request with new access token. |
| 2 | Refresh token used as access token (wrong token type) | Auth middleware checks `type` claim. `type: "refresh"` fails validation. Returns 401 AUTH_INVALID_TOKEN. |
| 3 | Rate limit exceeded on login endpoint | Returns 429 RATE_LIMITED with Retry-After header (seconds until window resets). Client displays "Too many login attempts. Try again in X seconds." |
| 4 | Request body exceeds 16KB size limit | Body parser rejects with 413 Payload Too Large before any other middleware runs. No rate limit counter is incremented (the request was rejected at the transport level). |
| 5 | CORS preflight request from disallowed origin | OPTIONS request returns without CORS headers. Browser blocks the actual request. No rate limit counter is incremented for preflight. |
| 6 | WebSocket connects with valid token, then token expires during connection | The WebSocket connection remains active. Token expiration only matters at handshake time. The connection is bound to the user identity established during handshake. If the server needs to force-disconnect (ban, forced logout), it does so via the session invalidation mechanism in Redis, not via token expiration. |
| 7 | User opens 4 browser tabs, each trying to connect WebSocket | First 3 connections succeed. Fourth connection is rejected with WS_MAX_CONNECTIONS error. Client displays "Maximum connections reached. Close another tab to continue." |
| 8 | Malformed JSON in request body | Body parser returns 400 with "Invalid JSON" error. No Zod validation runs (nothing to validate). |
| 9 | Valid JSON but wrong Content-Type header (e.g., text/plain) on POST | Body parser returns 415 Unsupported Media Type. |
| 10 | Redis is down -- rate limiter cannot check/increment counters | Rate limiter fails open (allows the request). Logs a warning. This prevents Redis outages from causing a complete service outage. The trade-off: during a Redis outage, rate limiting is temporarily disabled. This is acceptable because Redis outages are rare and brief, and the application has other abuse protections (JWT auth, input validation). |
| 11 | Concurrent requests from the same user to the same rate-limited endpoint | Redis MULTI/EXEC (or Lua script) ensures atomic read-check-write for the rate limit counter. Two concurrent requests cannot both read count=99 (limit=100) and both increment, allowing 101 requests. One will see count=100 and be rejected. |
| 12 | Request to non-existent endpoint | Route matching returns 404 NOT_FOUND with the standard error envelope. No auth check is performed (the route does not exist, so there is no auth requirement to check). |
| 13 | Request with valid token to endpoint where user account is banned | Auth middleware validates the token (it is technically valid). The route handler checks user status via the Auth module interface. If status is 'banned', returns 403 AUTH_ACCOUNT_BANNED. The token is not invalidated by the auth middleware -- the ban check is a business logic concern. |
| 14 | WebSocket message arrives faster than the rate limit allows | Message is dropped silently (not queued). An 'error' event with RATE_LIMITED code is emitted to the offending client. Other clients in the same room are unaffected. |
| 15 | Simultaneous register requests with the same email from different IPs | Both requests pass rate limiting (different IPs). Both pass input validation (valid email). The first to INSERT into PostgreSQL succeeds. The second hits the unique constraint and returns 409 AUTH_DUPLICATE_EMAIL. |

---

## 8. Processing Logic

### 8.1 Request Lifecycle (HTTP)

```
1. Express receives the TCP connection and HTTP request.
2. Middleware pipeline executes sequentially (see Section 4.1).
3. If any middleware rejects (returns an error response): STOP.
   The response is sent immediately. Subsequent middleware and the handler do not execute.
4. If all middleware passes: the route handler executes.
5. The handler calls the appropriate module interface method.
6. The module method executes business logic and returns a result or throws a typed error.
7. On success: the handler wraps the result in ApiSuccessResponse and sends it.
8. On typed error: the handler maps the error to the appropriate HTTP status and error code.
9. On untyped error: the global error handler catches it, logs it, and returns 500 INTERNAL_ERROR.
10. Response headers are set: X-Request-Id, X-RateLimit-Remaining, X-RateLimit-Reset.
11. Response is sent. The request span is closed.
```

### 8.2 WebSocket Message Lifecycle

```
1. Socket.IO receives the WebSocket frame.
2. Message rate limiter checks the token bucket for this connection.
   If exceeded: drop message, emit error event. STOP.
3. Message payload is validated against the Zod schema for the event type.
   If invalid: emit error event with validation details. STOP.
4. Event handler extracts the userId from the authenticated socket.
5. Game action events (action:*):
   a. Handler resolves the gameId to the active game state.
   b. Handler constructs a GameAction object from the event payload.
   c. Handler calls Game Engine module: validateAndApply(gameState, action).
   d. If invalid action: emit 'error' event to the sender only.
   e. If valid: new state is produced.
   f. New state is snapshotted to Redis.
   g. State update is broadcast to all players in the room via Socket.IO room.
   h. If the game has ended: persist to PostgreSQL, clean up Redis.
6. Room events (room:*):
   a. Handler calls Lobby module: processRoomEvent(roomId, userId, event).
   b. Updated room state is broadcast to all members of the room.
```

### 8.3 Error Response Mapping

```typescript
// Maps application error types to HTTP status codes and error codes.
// This is the central error mapping -- no status codes are hardcoded in handlers.

interface ErrorMapping {
  // Error class name -> { statusCode, errorCode }
  ValidationError: { status: 400, code: 'VALIDATION_ERROR' };
  AuthenticationError: { status: 401, code: 'AUTH_REQUIRED' | 'AUTH_INVALID_TOKEN' | 'AUTH_TOKEN_EXPIRED' };
  AuthorizationError: { status: 403, code: 'AUTH_INSUFFICIENT_PERMISSIONS' };
  NotFoundError: { status: 404, code: 'NOT_FOUND' | 'ROOM_NOT_FOUND' | 'GAME_NOT_FOUND' };
  ConflictError: { status: 409, code: 'AUTH_DUPLICATE_EMAIL' | 'ROOM_FULL' | 'ROOM_ALREADY_IN_GAME' };
  RateLimitError: { status: 429, code: 'RATE_LIMITED' };
  AccountLockedError: { status: 423, code: 'AUTH_ACCOUNT_LOCKED' };
  InternalError: { status: 500, code: 'INTERNAL_ERROR' };
}
```

---

## 9. Integration Points

### 9.1 Inbound

```
Client (React / Next.js SPA)
  -> HTTPS requests to /api/v1/* endpoints
  -> WSS connection to Socket.IO server

Load Balancer
  -> Forwards HTTPS/WSS traffic to the application
  -> Terminates SSL
  -> Applies sticky sessions (client IP hash)

Kubernetes
  -> Health probe requests to /health/*
```

### 9.2 Outbound

```
API Gateway -> Auth Module
  Token validation, user registration, login, session management

API Gateway -> Lobby Module
  Room CRUD, player join/leave, ready/unready, game start

API Gateway -> Game Engine Module
  Game state retrieval, action validation and application

API Gateway -> Leaderboard Module
  Rating queries, match history, player stats

API Gateway -> Redis
  Rate limit counters (direct, not through a module)
  WebSocket connection tracking (direct)

API Gateway -> OpenTelemetry SDK
  Request spans, middleware timing, error recording
```

### 9.3 Boundary Definition

The API Gateway is responsible for:
- Transport concerns (HTTP parsing, WebSocket framing, CORS)
- Security concerns (authentication, rate limiting, input validation)
- Routing (mapping URLs to handlers)
- Response formatting (wrapping results in the envelope format)
- Error translation (mapping domain errors to HTTP status codes)

The API Gateway is NOT responsible for:
- Business logic (delegated to modules)
- Data persistence (delegated to modules and Data Layer)
- Game state computation (delegated to Game Engine)
- Real-time broadcasting (delegated to Realtime module, though routed through the gateway)

---

## 10. Resolved Design Decisions

| # | Question | Decision | Rationale |
|---|---|---|---|
| 1 | Separate API gateway service or integrated middleware? | Integrated middleware (Express.js). | Solo developer. A separate gateway (Kong, Envoy, AWS API Gateway) adds operational overhead without proportional benefit at this scale. The Express middleware approach gives the same capabilities (auth, rate limiting, routing) with zero network hops. Extract to a separate gateway in Phase 3 if needed. |
| 2 | Rate limiting algorithm? | Sliding window log (Redis sorted set). | More accurate than fixed window (no burst-at-boundary). Simpler than leaky bucket or token bucket for HTTP. The Redis sorted set provides atomic operations and automatic cleanup via ZREMRANGEBYSCORE. Memory cost is one entry per request within the window -- acceptable at this scale. |
| 3 | API versioning strategy? | Path-based (/api/v1). | Explicit, simple, cacheable. Header-based versioning (Accept-Version) is harder to test and debug. Query parameter versioning (?v=1) is unconventional. Path-based is the most common pattern and immediately visible in logs and documentation. |
| 4 | Access token delivery? | Response body (not cookie). | Access tokens are short-lived (15 min) and sent with every request via Authorization header. Storing in a cookie would require CSRF protection. The client stores the access token in memory (not localStorage) and refreshes it when it expires. |
| 5 | Refresh token delivery? | httpOnly cookie. | Refresh tokens are long-lived (7 days) and must be protected from XSS. httpOnly cookies are not accessible to JavaScript. The cookie is sent automatically with requests to /api/v1/auth/refresh. SameSite=Strict prevents CSRF. |
| 6 | Rate limiter behavior when Redis is down? | Fail open (allow requests). | A Redis outage should not cause a full service outage. Rate limiting is a defense-in-depth measure, not the only protection. JWT auth and input validation still operate. The risk window (no rate limiting during Redis downtime) is short and acceptable. |
| 7 | WebSocket authentication: per-message or per-connection? | Per-connection (handshake only). | Per-message token validation adds latency to every game action (~1ms JWT verify per message at 10 messages/second = 10ms/second of pure overhead). The handshake authenticates the connection; the connection is bound to the user identity. If the token expires mid-game, the connection persists. Forced disconnection uses Redis session invalidation. |
| 8 | Max concurrent WebSocket connections per user? | 3. | Allows multiple tabs or devices without enabling abuse. A user playing on desktop and checking on mobile = 2 connections. A reconnection attempt while old connection is still closing = temporarily 3. More than 3 suggests either abuse or a connection leak. |
| 9 | Request body size limit? | 16KB. | The largest legitimate request body is a game action with card IDs -- well under 1KB. 16KB provides generous headroom. Anything larger is either an attack or a client bug. Rejecting early prevents memory exhaustion. |
| 10 | Error response format: include stack traces? | Never in production. Include in development and staging. | Stack traces in production responses leak internal implementation details. In development, they accelerate debugging. The error handler checks NODE_ENV to decide. |
| 11 | Should health endpoints be rate-limited? | No. | Health endpoints are called by Kubernetes probes every 10-15 seconds. Rate limiting them could cause false-negative health checks, leading to unnecessary pod restarts. These endpoints are lightweight (SELECT 1, PING) and not a meaningful abuse vector. |
| 12 | Response header: X-Request-Id? | Yes, on every response. | Enables client-side error reporting that correlates with server-side logs. A user reports "I got an error" and provides the X-Request-Id. The operator searches logs by requestId and finds the exact error, trace, and context. |

---

## 11. Implications for Architecture

1. **Integrated gateway** means all middleware code lives in `server/shared/middleware/`. Each middleware is a separate file (auth.ts, rateLimit.ts, cors.ts, validation.ts, errorHandler.ts) composed in a specific order in the Express app setup.

2. **Fail-open rate limiting** means the application must handle the case where Redis is temporarily unavailable. The rate limiter middleware wraps the Redis call in a try/catch. On Redis error, it logs a warning and allows the request. A metric (`sbobuz_rate_limit_redis_errors_total`) tracks how often this fallback is hit.

3. **Per-connection WebSocket auth** means the auth middleware for WebSocket is registered via Socket.IO's `io.use()` middleware, not as Express middleware. The socket's auth state is stored on the socket object and accessible to all event handlers.

4. **Zod schemas at the boundary** means every route handler has a co-located Zod schema file. The schema is the single source of truth for what the endpoint accepts. These schemas can be exported and reused by the client (via the `shared/` directory) for client-side pre-validation (optional, for UX).

5. **httpOnly refresh token cookie** means the `/api/v1/auth/refresh` endpoint reads the cookie automatically via Express's cookie parser. The cookie attributes (httpOnly, Secure, SameSite=Strict, Path=/api/v1/auth/refresh) are set explicitly. The Path restriction ensures the cookie is only sent to the refresh endpoint, not to every API request.

6. **Standard error envelope** means all modules must throw typed errors from a shared error hierarchy (`server/shared/errors/`). The global error handler maps these to the correct HTTP status and error code. Modules never set HTTP status codes directly -- they throw domain errors, and the gateway translates.

7. **X-Request-Id header** means the request ID middleware must be the first middleware in the pipeline (before CORS, before body parsing). This ensures every response, including early rejections, carries a correlation ID.
