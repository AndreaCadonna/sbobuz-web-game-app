---
name: git-workflow
description: Git branching strategy, commit conventions, pull request process, and code review patterns for collaborative software development. Covers branch naming, commit message format, PR workflow, merge strategy, and version tagging. Use this skill whenever creating branches, writing commit messages, opening pull requests, configuring branch protection, or when the user asks about git workflow, branching strategy, commit conventions, or code review process. Also activate when resolving merge conflicts, setting up git hooks, or planning release workflows.
origin: ECC
---

# Git Workflow

Production patterns for git-based collaboration. These conventions ensure a clean history, safe deployments, and efficient code review.

## When to Activate

- Creating branches for new work
- Writing commit messages
- Opening pull requests
- Configuring branch protection
- Resolving merge conflicts
- Planning release strategy

## Branching Strategy

Use a trunk-based model with short-lived feature branches. `main` is always deployable.

```
main ──────●──────●──────●──────●──── (always deployable)
            \    /        \    /
  feature/auth  ┘  fix/login-crash ┘
  (2-5 commits)    (1-2 commits)
```

### Branch Naming

```
{type}/{short-description}

feature/auth-jwt-tokens
feature/lobby-room-list
fix/login-crash-on-empty-email
fix/ws-reconnect-race-condition
refactor/game-engine-reducer
chore/upgrade-node-20
docs/api-gateway-spec
test/auth-integration-tests
```

| Prefix | Use For |
|--------|---------|
| `feature/` | New functionality |
| `fix/` | Bug fixes |
| `refactor/` | Code restructuring (no behavior change) |
| `chore/` | Tooling, dependencies, config |
| `docs/` | Documentation only |
| `test/` | Adding or fixing tests |

### Rules

- Branch from `main`, merge back to `main`
- Keep branches short-lived (hours to days, not weeks)
- One concern per branch — don't mix a feature with an unrelated refactor
- Delete branches after merge

## Commit Messages

### Format

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

### Types

| Type | Use For | Example |
|------|---------|---------|
| `feat` | New feature | `feat(auth): implement JWT token refresh` |
| `fix` | Bug fix | `fix(ws): handle reconnection race condition` |
| `refactor` | Code change (no behavior change) | `refactor(engine): extract effect resolver` |
| `test` | Adding/fixing tests | `test(auth): add integration tests for login` |
| `chore` | Tooling, deps, config | `chore: upgrade TypeScript to 5.4` |
| `docs` | Documentation | `docs: add API gateway specification` |
| `perf` | Performance improvement | `perf(engine): optimize action validation` |
| `ci` | CI/CD changes | `ci: add integration test job with service containers` |

### Scopes

Use module names as scopes: `auth`, `lobby`, `engine`, `ws`, `db`, `redis`, `infra`, `ci`.

### Subject Line Rules

- Imperative mood: "add feature" not "added feature" or "adds feature"
- No period at the end
- Under 72 characters
- Lowercase first word
- Describe the **what**, not the **how**

```
# GOOD
feat(auth): implement JWT token refresh
fix(ws): prevent duplicate room join on reconnect
refactor(engine): separate validation from state transition

# BAD
feat(auth): Added JWT token refresh flow.     # Past tense, period
fix: bug fix                                   # Too vague
refactor(engine): refactored the game engine reducer to use a more functional approach with immutable state transitions  # Too long
```

### Body (When Needed)

Use the body for commits that need context — why, not what. The diff shows what changed; the message explains why.

```
fix(ws): prevent duplicate room join on reconnect

When a client reconnects during the grace period, the room:join
handler was called before the grace period cancellation completed,
resulting in the player being added twice to the room's player list.

The fix checks for an existing pending reconnection before processing
the join event.
```

### Footer

Use footers for references and breaking changes:

```
feat(auth): add OAuth2 login support

BREAKING CHANGE: /api/v1/auth/login now accepts a `provider` field.
Clients must be updated to pass provider: 'local' for email/password login.

Refs: #142
```

## Pull Request Process

### PR Title

Follow the same format as commit messages:

```
feat(auth): implement JWT token refresh
fix(ws): handle reconnection race condition
```

### PR Description

```markdown
## Summary
- Implement JWT access/refresh token dual-token strategy
- Access tokens (15min TTL) stored in memory, refresh tokens (7d TTL) in httpOnly cookies
- Add Redis-backed session tracking for server-side revocation

## Changes
- `src/modules/auth/jwt.ts` — Token generation and verification
- `src/modules/auth/auth.routes.ts` — Login, register, refresh, logout endpoints
- `src/shared/middleware/auth.ts` — JWT validation middleware
- `tests/integration/auth.test.ts` — Integration tests with real DB

## Test Plan
- [ ] Login returns access + refresh tokens
- [ ] Access token rejected after 15 minutes
- [ ] Refresh endpoint rotates both tokens
- [ ] Logout invalidates session in Redis
- [ ] Concurrent logins don't interfere
```

### PR Size

Keep PRs small and focused. Large PRs get rubber-stamped; small PRs get reviewed.

| Size | Lines Changed | Review Time | Quality |
|------|--------------|-------------|---------|
| Small | < 200 | Fast, thorough | High |
| Medium | 200-500 | Moderate | Good |
| Large | 500+ | Slow, superficial | Low |

If a feature requires > 500 lines, split it into a stack of PRs that each build incrementally.

### Review Checklist

As a reviewer, check:
- [ ] Does the code match the PR description?
- [ ] Are there tests for new behavior?
- [ ] Are error cases handled?
- [ ] Is input validated at boundaries?
- [ ] Are there any security concerns (secrets, injection, XSS)?
- [ ] Does the code follow existing patterns in the codebase?
- [ ] Will this break backward compatibility?
- [ ] Are log messages structured and informative?

## Merge Strategy

Use **squash merge** for feature branches. This creates one clean commit on `main` per PR, keeping the history readable.

```
# Feature branch (messy history is fine)
abc123 WIP: initial auth structure
def456 fix: handle edge case
789abc cleanup: remove debug logs
bcd012 address review feedback

# After squash merge to main (clean)
xyz789 feat(auth): implement JWT token refresh (#42)
```

### When to Use Merge Commits

Use merge commits (not squash) for long-running branches where individual commits are meaningful:
- Release branches
- Large epics with sub-features
- Upstream sync

## Version Tagging

Use semantic versioning for releases.

```
v1.0.0    # Major: breaking changes
v1.1.0    # Minor: new features, backward-compatible
v1.1.1    # Patch: bug fixes, backward-compatible
```

```bash
# Tag a release
git tag -a v1.0.0 -m "Release v1.0.0: Initial production release"
git push origin v1.0.0
```

Tags trigger the CI/CD pipeline to build and tag container images with the version.

## Git Hooks

Use git hooks for fast local feedback before pushing.

```bash
# .husky/pre-commit
npx lint-staged

# .husky/commit-msg
npx commitlint --edit $1
```

```json
// package.json
{
  "lint-staged": {
    "*.ts": ["eslint --fix", "prettier --write"],
    "*.{json,md,yml}": ["prettier --write"]
  }
}
```

```javascript
// commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [2, 'always', [
      'auth', 'lobby', 'engine', 'ws', 'db', 'redis', 'infra', 'ci',
    ]],
  },
};
```

## Common Operations

### Keeping a Branch Up to Date

```bash
# Rebase feature branch on latest main
git checkout feature/auth
git fetch origin
git rebase origin/main
```

Prefer rebase over merge for feature branches — it keeps the branch history linear. If there are conflicts, resolve them during rebase.

### Undoing a Bad Commit

```bash
# Undo last commit, keep changes staged
git reset --soft HEAD~1

# Undo last commit, keep changes unstaged
git reset HEAD~1

# Create a revert commit (safe for shared branches)
git revert HEAD
```

On shared branches (`main`), always use `git revert` — it creates a new commit that undoes the change. Never force-push to `main`.

## Checklist

Before pushing:

- [ ] Branch name follows convention (`type/description`)
- [ ] Commits follow conventional format (`type(scope): subject`)
- [ ] Each commit is a logical unit (not "WIP" or "fix fix fix")
- [ ] PR title matches commit message format
- [ ] PR description includes summary, changes, and test plan
- [ ] PR is < 500 lines (or split into a stack)
- [ ] Tests pass locally
- [ ] Lint and typecheck pass
- [ ] No secrets committed (check `.env`, credentials)
- [ ] Branch is rebased on latest `main`
