# Security Audit Report — Sbobuz Web Game Platform

**Date:** 2026-03-11
**Auditor:** Security Engineering Team
**Scope:** Full-stack security assessment (frontend, backend, infrastructure, CI/CD)
**Classification:** Internal — Confidential

---

## Executive Summary

The Sbobuz web game platform was subjected to a comprehensive security audit covering authentication, authorization, input validation, transport security, real-time communication, game engine integrity, container security, and CI/CD pipeline hardening.

**Overall Risk Rating: MODERATE**

The platform demonstrates **strong security fundamentals** — parameterized SQL queries, Zod validation at all API boundaries, bcrypt with cost factor 12, server-authoritative game logic, and proper refresh token rotation. However, several gaps were identified in HTTP security headers, transport layer enforcement, and CI security scanning that require remediation before production deployment.

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 3 | **Remediated** |
| High | 2 | **Remediated** |
| Medium | 5 | 3 Remediated / 2 Acknowledged |
| Low | 5 | Acknowledged |
| Informational | 3 | Noted |

---

## Scope & Methodology

### In Scope
- **Frontend:** Next.js application (`app/`), React components, Zustand stores, Socket.IO client, API client
- **Backend:** Express server (`server/`), authentication module (JWT/bcrypt), lobby module, realtime module (Socket.IO), leaderboard, AI opponent
- **Shared:** TypeScript types, Zod validation schemas (`shared/`)
- **Infrastructure:** Docker containers, Kubernetes manifests, CI/CD pipeline
- **Game Engine:** Event-sourced state machine, action validators, state sanitizer

### Out of Scope
- Third-party service configurations (PostgreSQL, Redis server-side hardening)
- DNS and network infrastructure
- Social engineering vectors
- Physical security

### Methodology
1. **Static Analysis:** Manual code review of all security-critical modules
2. **Architecture Review:** Assessment of authentication flows, data flow, and trust boundaries
3. **Configuration Audit:** Review of environment variables, Docker configs, K8s manifests
4. **Dependency Review:** Analysis of package dependencies for known vulnerabilities
5. **Game Logic Review:** Analysis of game engine for exploitable state transitions

---

## Findings

### CRITICAL Findings

#### SEC-001: Missing HTTP Security Headers
**Severity:** Critical
**CVSS:** 7.5 (High)
**Status:** ✅ Remediated

**Description:**
The Express server did not set standard HTTP security headers. Missing headers included `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy`, and `Permissions-Policy`.

**Affected Files:**
- `server/src/server.ts`

**Risk:**
- Clickjacking attacks via iframe embedding
- MIME-type sniffing attacks
- No HSTS enforcement, allowing protocol downgrade attacks
- Information leakage via referrer headers

**Remediation:**
Added inline security headers middleware in `createApp()` that sets all recommended headers. HSTS is conditionally applied only in production to avoid interfering with local development.

---

#### SEC-002: Missing Content-Security-Policy Headers
**Severity:** Critical
**CVSS:** 7.1 (High)
**Status:** ✅ Remediated

**Description:**
The Next.js frontend did not configure Content-Security-Policy (CSP) headers, leaving the application vulnerable to XSS attacks if any injection vector is discovered.

**Affected Files:**
- `app/next.config.js`

**Risk:**
- If an XSS vulnerability is found, lack of CSP allows arbitrary script execution
- No restriction on resource origins (scripts, styles, connections)
- No frame-ancestors directive to prevent clickjacking

**Remediation:**
Added `headers()` configuration to `next.config.js` with a strict CSP policy: `default-src 'self'`, whitelisted `connect-src` for API and WebSocket URLs, `style-src 'self' 'unsafe-inline'` (required for Next.js), and `frame-ancestors 'none'`.

---

#### SEC-003: No HTTPS/WSS Enforcement in Production
**Severity:** Critical
**CVSS:** 8.1 (High)
**Status:** ✅ Remediated

**Description:**
The frontend API client and Socket.IO client used `http://localhost:3000` as fallback URLs. If environment variables were not set in production, all traffic including authentication tokens would be sent over unencrypted HTTP.

**Affected Files:**
- `app/src/lib/api-client.ts` (line 14)
- `app/src/lib/socket.ts` (line 16)

**Risk:**
- Man-in-the-middle attacks intercepting JWT access tokens
- Session hijacking via token theft over unencrypted connections
- WebSocket data (game actions, chat) visible to network observers

**Remediation:**
Added runtime validation that throws an error if `NODE_ENV === 'production'` and the configured URL uses `http://` instead of `https://` (or `ws://` instead of `wss://`). Development fallbacks retained for local development only.

---

### HIGH Findings

#### SEC-004: Refresh Token Persisted in localStorage
**Severity:** High
**CVSS:** 6.8
**Status:** ✅ Remediated

**Description:**
The Zustand auth store's `partialize` function included `refreshToken` in the persisted state, causing it to be written to `localStorage`. This contradicts the httpOnly cookie strategy implemented on the server side (`sameSite: 'strict'`, `httpOnly: true`, `secure: isProduction`).

**Affected Files:**
- `app/src/stores/auth-store.ts` (lines 199-204)

**Risk:**
- If any XSS vulnerability exists, attacker can read `refreshToken` from localStorage
- Refresh tokens are long-lived (7 days), providing extended unauthorized access
- Defeats the purpose of httpOnly cookie-based refresh token delivery

**Remediation:**
Removed `refreshToken` from the `partialize` function. The refresh token is exclusively managed via httpOnly cookies — the client never needs direct access to it. Removed the now-unused `getRefreshToken` interceptor registration.

---

#### SEC-005: Rate Limiter Fails Open on Redis Unavailability
**Severity:** High
**CVSS:** 6.5
**Status:** ✅ Remediated

**Description:**
The Redis-backed rate limiter was configured to "fail open" — when Redis is unavailable, all requests are allowed through without rate limiting. While this prevents service disruption, it enables abuse during Redis outages.

**Affected Files:**
- `server/src/shared/middleware/rate-limiter.ts`

**Risk:**
- Brute force attacks on login endpoint during Redis downtime
- API abuse and resource exhaustion
- Denial of service amplification

**Remediation:**
Added a `failClosed` option to the rate limiter configuration. When `failClosed: true` and Redis is unavailable, requests receive a `503 Service Unavailable` response. Added `RATE_LIMIT_FAIL_CLOSED` environment variable (default `false` for backward compatibility, recommended `true` in production). The config schema validates the new variable.

---

### MEDIUM Findings

#### SEC-006: No Dependency Vulnerability Scanning in CI
**Severity:** Medium
**CVSS:** 5.3
**Status:** ✅ Remediated

**Description:**
The CI pipeline did not include any dependency vulnerability scanning (`npm audit`, Snyk, or similar). Known vulnerabilities in transitive dependencies would go undetected.

**Affected Files:**
- `.github/workflows/ci.yml`

**Remediation:**
Added a `security-scan` job to the CI pipeline that runs `npm audit --audit-level=high` and Trivy container image scanning.

---

#### SEC-007: No Container Image Scanning
**Severity:** Medium
**CVSS:** 5.3
**Status:** ✅ Remediated (combined with SEC-006)

**Description:**
Docker images built in CI were not scanned for OS-level or library vulnerabilities before deployment.

**Remediation:**
Added Trivy scanning step in the `build-check` job that scans the built Docker image for HIGH and CRITICAL vulnerabilities.

---

#### SEC-008: No Kubernetes NetworkPolicy
**Severity:** Medium
**CVSS:** 5.0
**Status:** Acknowledged — Deferred to infrastructure hardening phase

**Description:**
Kubernetes deployment manifests do not include NetworkPolicy resources, allowing unrestricted pod-to-pod communication within the cluster.

**Risk:**
- Lateral movement if any pod is compromised
- No microsegmentation between services

**Recommendation:**
Define NetworkPolicy resources restricting ingress to the server pod from only the ingress controller, and egress to only PostgreSQL and Redis service endpoints.

---

#### SEC-009: WebSocket Rate Limiter In-Memory Only
**Severity:** Medium
**CVSS:** 4.3
**Status:** Acknowledged — Deferred

**Description:**
Socket.IO event rate limiting uses in-memory counters per connection. These counters do not survive server restarts and are not shared across pods in a multi-instance deployment.

**Risk:**
- Rate limit bypass by reconnecting to a different pod
- Reset of rate limit state on server restart

**Recommendation:**
Migrate WebSocket rate limiting to Redis-backed counters (same sliding window algorithm used for HTTP rate limiting).

---

#### SEC-010: Login Rate Limiting Per Email Only
**Severity:** Medium
**CVSS:** 4.8
**Status:** Acknowledged — Deferred

**Description:**
Login attempts are rate-limited per email address but not per source IP. A distributed brute force attack using many IPs against a single account would be rate-limited, but an attacker trying many accounts from a single IP would not be.

**Recommendation:**
Add a secondary rate limit keyed by IP address for authentication endpoints (e.g., 20 login attempts per minute per IP).

---

### LOW Findings

#### SEC-011: No Client-Side Login Attempt Backoff
**Severity:** Low
**CVSS:** 3.1
**Status:** Acknowledged

**Description:**
The frontend does not implement exponential backoff on failed login attempts. A malicious script in the browser could rapidly fire login requests.

**Recommendation:**
Add client-side tracking of consecutive failures with progressive delays. Show UI warning after 3 failures.

---

#### SEC-012: Guest Session No Auto-Refresh
**Severity:** Low
**CVSS:** 2.5
**Status:** Acknowledged

**Description:**
Guest users receive a 15-minute access token with no refresh token. When the token expires, the session terminates abruptly without recovery.

**Recommendation:**
Implement a guest token re-issuance endpoint, or extend guest access token TTL to match expected game duration (e.g., 2 hours).

---

#### SEC-013: Display Name Unicode Sanitization
**Severity:** Low
**CVSS:** 2.0
**Status:** Acknowledged

**Description:**
Display names accept any Unicode characters up to 50 characters. RTL override characters, zero-width joiners, and confusable characters could be used for visual spoofing.

**Recommendation:**
Add regex pattern restricting display names to ASCII alphanumeric, spaces, hyphens, and underscores, or apply Unicode normalization (NFC) with confusable character filtering.

---

#### SEC-014: Leaderboard Pagination No Client Debounce
**Severity:** Low
**CVSS:** 1.5
**Status:** Acknowledged

**Description:**
Leaderboard pagination buttons can be rapidly clicked, causing multiple concurrent API requests. Server-side rate limiting mitigates this, but it's inefficient.

**Recommendation:**
Add `disabled` state while loading and/or debounce pagination button clicks.

---

#### SEC-015: No Audit Logging for Security Events
**Severity:** Low
**CVSS:** 3.5
**Status:** Acknowledged

**Description:**
Security-sensitive operations (login, logout, password change, permission changes) are logged via Pino structured logging, but there is no dedicated audit trail with immutable storage.

**Recommendation:**
For production, route security events to a dedicated audit log sink (e.g., append-only table or external SIEM integration).

---

### INFORMATIONAL Findings

#### SEC-016: `secure: false` on Refresh Token Cookie in Development
**Status:** Expected Behavior

The refresh token cookie sets `secure: isProduction` — in development (`NODE_ENV !== 'production'`), the cookie is sent over HTTP. This is intentional for local development but should be verified not to leak into staging environments.

---

#### SEC-017: Error Messages from Server Displayed to Users
**Status:** Acceptable

Server error messages are passed through to the UI. The server already implements error message sanitization in production mode (generic messages for 500-level errors). Frontend behavior is correct.

---

#### SEC-018: localhost Fallbacks in Environment Variables
**Status:** Acceptable for Development

API base URL and Socket URL fall back to `localhost:3000` in development. Production enforcement (SEC-003) ensures these fallbacks are never used in production.

---

## Positive Security Findings

The following security controls are **well-implemented** and demonstrate strong security practices:

### Authentication & Authorization
- ✅ **bcrypt with cost factor 12** — industry-standard password hashing with constant-time comparison
- ✅ **Dummy hash on login failure** — prevents timing-based user enumeration (`handlers.ts:288`)
- ✅ **JWT with issuer/audience/type validation** — tokens verified for correct issuer and type claims
- ✅ **Refresh token rotation with reuse detection** — if a rotated-out token is reused, the session is revoked
- ✅ **httpOnly cookies** with `sameSite: 'strict'` and `secure` in production for refresh tokens
- ✅ **Session revocation** on logout with both token and session-level invalidation
- ✅ **JWT_SECRET minimum 32 characters** enforced via Zod schema validation

### Input Validation
- ✅ **Zod validation at all API boundaries** — request bodies, query parameters, and environment variables
- ✅ **Parameterized SQL queries** throughout — no string concatenation in SQL, eliminating SQL injection
- ✅ **No raw `eval()`, `Function()`, or `dangerouslySetInnerHTML`** in frontend code
- ✅ **JSON body limit** (`16kb`) prevents large payload attacks
- ✅ **WebSocket payload limit** (`16384 bytes`) prevents oversized message attacks

### Game Engine Security
- ✅ **Server-authoritative validation** — all game actions validated server-side before state mutation
- ✅ **State sanitization** — opponents' hand contents never sent to other players
- ✅ **Exhaustive action validation** — phase checks, turn order, card index bounds, player status
- ✅ **Pure reducer functions** — no side effects, deterministic state transitions
- ✅ **Legal move enumeration** guarantees validator accepts all returned actions (no desync)
- ✅ **Immutable RNG seed** — no randomness manipulation after game start

### Infrastructure
- ✅ **Non-root containers** — Docker images run as non-root user with `USER node`
- ✅ **Read-only filesystem** — container filesystem is read-only, preventing runtime tampering
- ✅ **All capabilities dropped** — `securityContext.capabilities.drop: ["ALL"]` in K8s manifests
- ✅ **Resource limits** — CPU and memory limits set on all containers
- ✅ **CORS validation** — production rejects wildcard `*` origins and empty origin lists
- ✅ **Structured logging** — Pino logger with no `console.log` (enforced by ESLint `no-console: error`)
- ✅ **Error masking** — production error responses hide stack traces and internal details

### Real-Time Communication
- ✅ **Socket.IO token authentication** — tokens passed in `auth` payload (not query string)
- ✅ **Redis adapter** — Socket.IO state shared across instances
- ✅ **30-second disconnect grace period** — prevents data loss on brief disconnections
- ✅ **Full state sync on reconnect** — clients receive complete game state, preventing desync

---

## Remediation Summary

| ID | Finding | Severity | Status | Fix |
|----|---------|----------|--------|-----|
| SEC-001 | Missing HTTP security headers | Critical | ✅ Fixed | Security headers middleware in `server.ts` |
| SEC-002 | Missing CSP headers | Critical | ✅ Fixed | CSP headers in `next.config.js` |
| SEC-003 | No HTTPS enforcement | Critical | ✅ Fixed | Runtime URL validation in `api-client.ts`, `socket.ts` |
| SEC-004 | Refresh token in localStorage | High | ✅ Fixed | Removed from `partialize` in `auth-store.ts` |
| SEC-005 | Rate limiter fails open | High | ✅ Fixed | `failClosed` option in `rate-limiter.ts` |
| SEC-006 | No dependency scanning | Medium | ✅ Fixed | `npm audit` in CI pipeline |
| SEC-007 | No container scanning | Medium | ✅ Fixed | Trivy in CI pipeline |
| SEC-008 | No K8s NetworkPolicy | Medium | Deferred | Infrastructure hardening phase |
| SEC-009 | WS rate limiter in-memory | Medium | Deferred | Migrate to Redis-backed counters |
| SEC-010 | Login rate limit by email only | Medium | Deferred | Add IP-based secondary limit |
| SEC-011 | No client login backoff | Low | Acknowledged | Client-side improvement |
| SEC-012 | Guest session no refresh | Low | Acknowledged | Product decision needed |
| SEC-013 | Unicode display names | Low | Acknowledged | Add character restrictions |
| SEC-014 | Leaderboard no debounce | Low | Acknowledged | UX improvement |
| SEC-015 | No audit logging | Low | Acknowledged | Add dedicated audit sink |

---

## Recommendations Roadmap

### Immediate (Before Production)
1. ~~Add HTTP security headers~~ ✅
2. ~~Add Content-Security-Policy~~ ✅
3. ~~Enforce HTTPS/WSS in production~~ ✅
4. ~~Remove refresh token from localStorage~~ ✅
5. ~~Configure rate limiter to fail closed~~ ✅
6. ~~Add dependency vulnerability scanning~~ ✅

### Short-Term (Next Sprint)
7. Add Kubernetes NetworkPolicy resources
8. Migrate WebSocket rate limiting to Redis
9. Add IP-based login rate limiting
10. Implement client-side login backoff

### Medium-Term (Next Quarter)
11. Set up dedicated audit logging sink
12. Implement guest token re-issuance
13. Add Unicode normalization for display names
14. Consider Web Application Firewall (WAF) for public endpoints
15. Implement Subresource Integrity (SRI) for static assets

---

*End of Report*
