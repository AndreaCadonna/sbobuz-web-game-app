---
name: auth-security
description: Authentication, authorization, and security hardening patterns for Node.js/TypeScript web applications. Covers JWT lifecycle, password hashing, session management, CORS, rate limiting, input validation with Zod, secrets management, and common vulnerability prevention. Use this skill whenever implementing login/register flows, JWT token handling, password hashing, CORS configuration, rate limiting, input validation, or when the user asks about security best practices, authentication architecture, or authorization checks. Also activate when reviewing code for security vulnerabilities, implementing middleware auth guards, or hardening an API against common attacks (XSS, CSRF, injection).
origin: ECC
---

# Authentication & Security

Production patterns for securing Node.js/TypeScript web applications. These conventions cover the full auth lifecycle and defense-in-depth against common attack vectors.

## When to Activate

- Implementing login, registration, or token refresh flows
- Setting up JWT authentication
- Configuring CORS, rate limiting, or input validation
- Hashing or verifying passwords
- Reviewing code for security vulnerabilities
- Implementing authorization checks (ownership, roles)
- Managing secrets and environment variables

## JWT Authentication Architecture

### Dual-Token Strategy

Use two tokens with different lifetimes and storage mechanisms. This balances security (short-lived access) with usability (long-lived refresh without re-login).

| Token | TTL | Storage | Purpose |
|-------|-----|---------|---------|
| Access Token | 15 minutes | In-memory (JavaScript variable) | Authorize API requests |
| Refresh Token | 7 days | httpOnly cookie | Obtain new access tokens silently |

Access tokens are stateless — validated by signature alone, no database lookup. This keeps the hot path (every API request) fast.

Refresh tokens are tracked in Redis — this enables server-side revocation (logout, ban, suspicious activity).

### Token Generation

```typescript
import jwt from 'jsonwebtoken';
import { getConfig } from '../config';

const config = getConfig();

interface AccessTokenPayload {
  sub: string;     // userId
  username: string;
  iat: number;
  exp: number;
}

export function generateAccessToken(userId: string, username: string): string {
  return jwt.sign(
    { sub: userId, username },
    config.JWT_SECRET,
    { expiresIn: config.JWT_ACCESS_TOKEN_TTL_SECONDS },
  );
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    config.JWT_SECRET,
    { expiresIn: config.JWT_REFRESH_TOKEN_TTL_SECONDS },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, config.JWT_SECRET) as AccessTokenPayload;
}
```

### Auth Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../errors';
import { verifyAccessToken } from './jwt';

// Routes that skip auth
const PUBLIC_ROUTES = new Set([
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'GET /health/live',
  'GET /health/ready',
]);

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const routeKey = `${req.method} ${req.path}`;
  if (PUBLIC_ROUTES.has(routeKey)) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError('Missing or malformed Authorization header');
  }

  try {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch {
    throw new UnauthorizedError('Invalid or expired access token');
  }
}
```

### Refresh Flow

```typescript
// POST /api/v1/auth/refresh
async function refreshHandler(req: Request, res: Response) {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) {
    throw new UnauthorizedError('No refresh token');
  }

  // Verify signature
  const payload = jwt.verify(refreshToken, config.JWT_SECRET);
  if (payload.type !== 'refresh') {
    throw new UnauthorizedError('Invalid token type');
  }

  // Check Redis — is this session still valid?
  const tokenHash = hashToken(refreshToken);
  const session = await redis.hgetall(`session:${payload.sub}`);
  if (!session || session.refreshTokenHash !== tokenHash) {
    throw new UnauthorizedError('Session expired or revoked');
  }

  // Issue new tokens
  const newAccessToken = generateAccessToken(payload.sub, session.username);
  const newRefreshToken = generateRefreshToken(payload.sub);

  // Rotate refresh token in Redis
  await redis.hset(`session:${payload.sub}`, {
    refreshTokenHash: hashToken(newRefreshToken),
    lastActiveAt: new Date().toISOString(),
  });

  // Set new refresh token as httpOnly cookie
  setRefreshCookie(res, newRefreshToken);

  sendSuccess(res, req, { accessToken: newAccessToken });
}
```

## Password Security

### Hashing

Use bcrypt with a cost factor of 12. This takes ~250ms per hash — slow enough to resist brute force, fast enough for login UX.

```typescript
import bcrypt from 'bcrypt';

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

### Password Rules

- Minimum 8 characters — enforce at the Zod schema level
- Maximum 128 characters — prevent bcrypt DoS (bcrypt has a 72-byte input limit)
- No composition rules (uppercase, special chars) — they reduce entropy by constraining the search space
- Check against known breached passwords (optional, via HaveIBeenPwned API)

## Cookie Configuration

```typescript
function setRefreshCookie(res: Response, token: string): void {
  res.cookie('refreshToken', token, {
    httpOnly: true,       // JavaScript cannot access — prevents XSS theft
    secure: true,         // HTTPS only — prevents network interception
    sameSite: 'strict',   // Same-origin only — prevents CSRF
    path: '/api/v1/auth', // Only sent to auth endpoints — minimizes exposure
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
  });
}
```

Every flag matters. Removing any one opens a specific attack vector.

## CORS Configuration

```typescript
import cors from 'cors';

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowed = config.CORS_ALLOWED_ORIGINS.split(',');
    if (!origin || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true,        // Allow cookies (refresh token)
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,            // Cache preflight for 24h
};

app.use(cors(corsOptions));
```

### CORS Rules

- **Never** use `origin: '*'` with `credentials: true` — browsers reject this combination
- **Never** use wildcard origins in production — it defeats the purpose of CORS
- List explicit origins: `['https://sbobuz.com', 'https://www.sbobuz.com']`
- Development can use `localhost` origins — but strip them before deploying

## Rate Limiting

Protect auth endpoints aggressively. Login and register are the most targeted endpoints for brute force and credential stuffing.

| Endpoint | Limit | Window | Scope |
|----------|-------|--------|-------|
| `POST /auth/login` | 10 | 15 min | Per IP |
| `POST /auth/register` | 5 | 60 min | Per IP |
| `POST /auth/refresh` | 30 | 15 min | Per user |
| General authenticated | 100 | 60 sec | Per user |
| General public | 30 | 60 sec | Per IP |

Include rate limit headers in responses so clients can back off gracefully:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640000000
```

## Input Validation

Validate everything at the API boundary. Reject before business logic runs.

```typescript
import { z } from 'zod';

// Validate shape AND constraints
const registerSchema = z.object({
  email: z.string()
    .email('Invalid email format')
    .max(255)
    .transform((e) => e.toLowerCase().trim()),
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, hyphens'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});
```

### Validation Rules

- Validate at the boundary, trust internally — once data passes Zod, services don't re-validate
- Transform inputs (trim, lowercase email) in the schema — not in business logic
- Return field-level errors so the client can show them next to the right form field
- Set a body size limit (`express.json({ limit: '16kb' })`) to prevent payload bombs

## Common Vulnerabilities to Prevent

### SQL Injection
Always use parameterized queries. Never interpolate user input into SQL. See `postgresql-data-layer` skill.

### XSS (Cross-Site Scripting)
- React escapes output by default — don't use `dangerouslySetInnerHTML`
- Set `Content-Type: application/json` on API responses
- Use CSP headers to restrict script sources

### CSRF (Cross-Site Request Forgery)
- `SameSite=Strict` on cookies prevents most CSRF
- For extra safety, validate the `Origin` header on state-changing requests

### Timing Attacks
Use constant-time comparison for tokens and hashes. `bcrypt.compare` is already constant-time.

```typescript
import { timingSafeEqual } from 'node:crypto';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

### Information Leakage
- Login errors: always say "Invalid email or password" — never reveal which one was wrong
- Don't return stack traces in production error responses
- Don't expose internal IDs, table names, or query details in error messages

## Secrets Management

- All secrets via environment variables — validated by Zod at startup
- Never commit secrets to version control (`.env` in `.gitignore`)
- JWT secret must be at least 32 characters of high entropy
- Rotate secrets by deploying with new values, not by editing running containers
- In Kubernetes: use `Secret` objects with etcd encryption at rest

## Authorization Patterns

After authentication (who are you?), check authorization (what can you do?).

```typescript
// Resource ownership check
async function getRoom(req: Request, res: Response) {
  const room = await roomService.findById(req.params.roomId);
  if (!room) throw new NotFoundError('Room', req.params.roomId);

  // Any authenticated user can view a room
  sendSuccess(res, req, room);
}

// Host-only action
async function startGame(req: Request, res: Response) {
  const room = await roomService.findById(req.params.roomId);
  if (!room) throw new NotFoundError('Room', req.params.roomId);
  if (room.hostId !== req.user.id) {
    throw new ForbiddenError('Only the room host can start the game');
  }
  // ...
}
```

## Checklist

Before shipping auth/security code:

- [ ] Access tokens are short-lived (15 min) and stored in memory only
- [ ] Refresh tokens are in httpOnly, Secure, SameSite=Strict cookies
- [ ] Passwords hashed with bcrypt (cost 12) — never stored in plaintext
- [ ] All inputs validated with Zod at the API boundary
- [ ] Rate limiting on auth endpoints (login, register, refresh)
- [ ] CORS configured with explicit origin whitelist — no wildcards in production
- [ ] Error messages don't leak internals (no stack traces, no "email not found")
- [ ] Secrets loaded from environment, not hardcoded
- [ ] Body size limit configured on Express JSON parser
- [ ] Authorization checks on every protected endpoint
