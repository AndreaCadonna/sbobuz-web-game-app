---
name: cicd-pipeline
description: CI/CD pipeline design with GitHub Actions for Node.js/TypeScript projects. Covers workflow structure, quality gates, test automation, container builds, deployment automation, and pipeline security. Use this skill whenever writing GitHub Actions workflows, configuring CI pipelines, setting up automated testing in CI, building and pushing container images, implementing deployment automation, or when the user asks about CI/CD strategy, pipeline optimization, or quality gate configuration. Also activate when debugging failed CI runs, adding new pipeline stages, or implementing deployment approval gates.
origin: ECC
---

# CI/CD Pipeline

Production patterns for CI/CD with GitHub Actions. These conventions ensure code quality gates, automated testing, safe deployments, and fast feedback loops.

## When to Activate

- Writing or modifying GitHub Actions workflows
- Setting up CI quality gates (lint, test, build)
- Configuring automated container builds
- Implementing deployment pipelines
- Debugging CI failures
- Adding security scanning to the pipeline

## Pipeline Architecture

```
Pull Request:
  ┌─ Lint + Typecheck ─┐
  │                     ├─ parallel ─→ Build Check
  └─ Unit Tests ────────┘
         │
         ▼
    Integration Tests (with service containers)
         │
         ▼
    PR Status Check (all must pass)

Merge to Main:
  Build Container ─→ Push to GHCR ─→ Deploy Staging ─→ Smoke Tests
                                                            │
                                                            ▼
                                                   Manual Gate ─→ Deploy Production
```

## Pull Request Workflow

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true  # Cancel stale runs when new commits push

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:unit -- --coverage
      - name: Check coverage threshold
        run: |
          npx vitest --coverage --coverage.thresholds.branches=80 \
            --coverage.thresholds.functions=80 \
            --coverage.thresholds.lines=80

  integration-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    needs: [lint-and-typecheck, unit-tests]  # Run after fast checks pass
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: sbobuz_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/sbobuz_test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: ci-test-secret-at-least-32-chars-long

  build-check:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - name: Build Docker image (no push)
        run: docker build --target production -t sbobuz-server:ci .
```

### Key Decisions

- **`concurrency.cancel-in-progress: true`** — When a developer pushes a new commit, cancel the CI run for the previous commit. Saves runner minutes and gives faster feedback.
- **`needs: [lint-and-typecheck, unit-tests]`** — Integration tests only run if fast checks pass. Fail fast on obvious issues.
- **Service containers** — GitHub Actions spins up real PostgreSQL and Redis containers. Integration tests hit real databases, not mocks.
- **`timeout-minutes`** — Every job has a timeout. A hung test suite doesn't burn runner hours.

## Deploy Workflow

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write  # Push to GHCR

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-staging:
    needs: build-and-push
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: staging  # GitHub Environment for protection rules
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          # Update Kubernetes deployment with new image
          kubectl set image deployment/sbobuz-server \
            sbobuz-server=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace staging

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/sbobuz-server \
            --namespace staging --timeout=300s

  smoke-tests:
    needs: deploy-staging
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
      - name: Run smoke tests
        run: |
          # Health check
          curl -f https://staging.sbobuz.com/health/ready || exit 1
          # Basic API check
          curl -f https://staging.sbobuz.com/api/v1/health || exit 1

  deploy-production:
    needs: smoke-tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    environment: production  # Requires manual approval
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          kubectl set image deployment/sbobuz-server \
            sbobuz-server=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --namespace production

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/sbobuz-server \
            --namespace production --timeout=300s
```

### Key Decisions

- **`environment: production`** — GitHub Environments support required reviewers. Production deploy requires manual approval.
- **Same image SHA** — Staging and production deploy the exact same image. What you tested is what you ship.
- **`cache-from/to: type=gha`** — GitHub Actions cache for Docker layers. Speeds up subsequent builds significantly.

## Workflow Patterns

### Reusable Workflows

Extract common steps into reusable workflows to avoid duplication across repos.

```yaml
# .github/workflows/reusable-node-ci.yml
name: Node.js CI (Reusable)
on:
  workflow_call:
    inputs:
      node-version:
        type: string
        default: '20'

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test
```

### Branch Protection

Configure branch protection rules on `main`:
- Require PR reviews (at least 1)
- Require CI status checks to pass
- Require branch to be up to date
- No direct pushes to main
- No force pushes

## Pipeline Security

- **Never echo secrets** — even masked secrets can leak via process substitution
- **Pin action versions to SHA** — `uses: actions/checkout@abc123` not `@v4` (supply chain protection)
- **Minimal permissions** — Use `permissions` block to grant only what's needed
- **Rotate `GITHUB_TOKEN`** — it's auto-rotated per run, but custom secrets need manual rotation schedules
- **No secrets in workflow file** — use GitHub Secrets and reference with `${{ secrets.NAME }}`

## Common Mistakes

| Mistake | Impact | Fix |
|---------|--------|-----|
| No `timeout-minutes` | Hung jobs burn runner hours | Set per-job timeouts |
| Running integration tests first | Slow feedback on lint errors | `needs:` to order fast→slow |
| Hardcoded Node version | Drift between CI and production | Use matrix or match Dockerfile |
| No `concurrency` | Multiple runs for same PR | `cancel-in-progress: true` |
| `npm install` in CI | Non-deterministic installs | `npm ci` (uses lockfile exactly) |

## Checklist

Before shipping CI/CD changes:

- [ ] PR workflow runs lint, typecheck, unit tests, integration tests
- [ ] Integration tests use service containers (real DB, real Redis)
- [ ] Every job has a `timeout-minutes`
- [ ] `concurrency` cancels stale PR runs
- [ ] Deploy uses commit SHA tags — not `:latest`
- [ ] Production deploy requires manual approval (GitHub Environment)
- [ ] Same image deployed to staging and production
- [ ] Secrets managed via GitHub Secrets — not hardcoded
- [ ] Action versions pinned (ideally to SHA)
- [ ] Coverage thresholds enforced in CI
