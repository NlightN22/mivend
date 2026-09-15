# Builds a production Vite bundle, then serves it as static files through nginx — see
# packages/storefront/Dockerfile for the full rationale (issue #78/#115), including why this uses
# a selective COPY instead of `COPY . .` (avoids needing a private-registry auth token this build
# has no reason to need).
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/manager/package.json packages/manager/
COPY packages/ui-kit/package.json packages/ui-kit/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY packages/manager packages/manager
COPY packages/ui-kit packages/ui-kit
COPY packages/shared packages/shared
# ui-kit is consumed as TypeScript source directly (package.json "main": "./src/index.ts", no
# build step of its own) — vite build compiles/bundles it in-place. `shared` does need its own
# tsc build first (its "main" points at ./dist, not ./src, and its tsconfig extends the root
# tsconfig.base.json copied above).
RUN pnpm --filter shared build && pnpm --filter @mivend/manager build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/packages/manager/dist /usr/share/nginx/html
COPY packages/manager/nginx.conf.template /etc/nginx/templates/default.conf.template
# Overridden at `docker run`/compose time — the nginx official image's own docker-entrypoint
# envsubst's ${API_TARGET} in the template above into /etc/nginx/conf.d/default.conf on startup.
ENV API_TARGET=http://server:3000
EXPOSE 80
