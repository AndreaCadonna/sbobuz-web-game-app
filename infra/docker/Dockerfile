# ============================================================
# Stage 1: deps — Install all dependencies (dev + prod)
# ============================================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copy workspace root manifests first for better layer caching
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY app/package.json ./app/

# Install ALL dependencies (including devDependencies for build stage)
RUN npm ci

# ============================================================
# Stage 2: build — Compile TypeScript
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app

# Copy node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules

# Copy source code
COPY package.json tsconfig.json ./
COPY shared/ ./shared/
COPY server/ ./server/

# Compile TypeScript — build shared first, then server
RUN npx tsc --build --force shared/tsconfig.json && \
    npx tsc --build --force server/tsconfig.json

# ============================================================
# Stage 3: production — Minimal runtime image
# ============================================================
FROM node:20-alpine AS production

# Security: run as non-root user
RUN addgroup --system --gid 1001 sbobuz && \
    adduser --system --uid 1001 --ingroup sbobuz sbobuz

WORKDIR /app

# Copy workspace root manifests for prod dependency install
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY server/package.json ./server/
COPY app/package.json ./app/

# Install production-only dependencies
RUN npm ci --omit=dev && \
    npm cache clean --force

# Copy compiled output from build stage
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/shared/dist ./shared/dist

# Copy migration SQL files (needed at runtime)
COPY server/src/infra/database/migrations ./server/dist/infra/database/migrations

# Set ownership
RUN chown -R sbobuz:sbobuz /app

USER sbobuz

# Default environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000 9464

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["node", "server/dist/server.js"]
