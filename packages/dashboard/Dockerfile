# Builds a production Vite bundle for the Vendure Dashboard, then serves it as static files
# through nginx — see packages/storefront/Dockerfile for the shared rationale (issue #78/#115).
#
# Unlike storefront/manager, this CANNOT use a selective COPY: vite.config.ts's
# vendureDashboardPlugin reads apps/server/src/vendure-config.ts at build time, which imports
# every registered plugin — including erp-integration, which depends on the private
# @nlightn22/event-contracts package (GitHub Packages, see the root .npmrc's own comment). A
# `pnpm install --frozen-lockfile` therefore needs that registry's auth token, passed as a
# BuildKit secret (never baked into an image layer/history, unlike an ARG or a copied .npmrc) —
# build with:
#   DOCKER_BUILDKIT=1 docker build -f packages/dashboard/Dockerfile \
#     --secret id=npmrc,src=$HOME/.npmrc -t mivend-dashboard:local .
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

FROM deps AS builder
# vendureDashboardPlugin's config-loader actually *executes* vendure-config.ts to introspect the
# registered plugins/entities — every plugin package is resolved via its real package.json
# "main" (pointing at ./dist), not TS source directly, so every plugin needs a real build first,
# same as apps/server/Dockerfile's own `pnpm build:plugins` step. `shared` needs its own tsc
# build too (its "main" points at ./dist, not ./src) — some plugins depend on it.
RUN pnpm --filter shared build && pnpm build:plugins && pnpm --filter @mivend/dashboard build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_TARGET=http://server:3000
ENV LISTEN_PORT=80
EXPOSE 80
