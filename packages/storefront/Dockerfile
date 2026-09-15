# Builds a production Vite bundle, then serves it as static files through nginx — the fix for
# issue #78 (dev-mode Vite serving ~3000 unbundled per-file requests, slow/unreliable over a real
# network) per issue #115's investigation. Context is the repo root (see Makefile's docker-build
# target).
#
# Selective COPY (not a full `COPY . .`), same convention as apps/server/Dockerfile — pulling in
# erp-integration's package.json (or any other plugin depending on the private
# @nlightn22/event-contracts registry package) would require a GitHub Packages auth token this
# build has no reason to need, just to build a static frontend. Confirmed directly: a `COPY . .`
# attempt failed on that private package's 401.
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/storefront/package.json packages/storefront/
COPY packages/ui-kit/package.json packages/ui-kit/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/storefront packages/storefront
COPY packages/ui-kit packages/ui-kit
COPY packages/shared packages/shared
# ui-kit is consumed as TypeScript source directly (package.json "main": "./src/index.ts", no
# build step of its own) — vite build compiles/bundles it in-place. `shared` does need its own
# tsc build first (its "main" points at ./dist, not ./src, and its tsconfig extends the root
# tsconfig.base.json copied above).
RUN pnpm --filter shared build && pnpm --filter @mivend/storefront build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/packages/storefront/dist /usr/share/nginx/html
COPY packages/storefront/nginx.conf.template /etc/nginx/templates/default.conf.template
# Overridden at `docker run`/compose time — the nginx official image's own docker-entrypoint
# envsubst's ${API_TARGET} in the template above into /etc/nginx/conf.d/default.conf on startup.
ENV API_TARGET=http://server:3000
EXPOSE 80
