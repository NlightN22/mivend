# Puppeteer's bundled Chromium is not reliably supported on musl/Alpine — skip its
# download in every stage and rely on the runner's apt-installed Chromium instead
# (see the `runner` stage below). deps/builder stay on Alpine since no browser is
# ever launched at install/build time.
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/plugins/customer-pricing/package.json packages/plugins/customer-pricing/
COPY packages/plugins/sync/package.json packages/plugins/sync/
COPY packages/plugins/counterparty/package.json packages/plugins/counterparty/
COPY packages/plugins/price-entry/package.json packages/plugins/price-entry/
COPY packages/plugins/erp-import/package.json packages/plugins/erp-import/
COPY packages/plugins/cross-reference/package.json packages/plugins/cross-reference/
COPY packages/plugins/search/package.json packages/plugins/search/
COPY packages/plugins/erp-order/package.json packages/plugins/erp-order/
COPY packages/plugins/documents/package.json packages/plugins/documents/
COPY packages/plugins/popular-products/package.json packages/plugins/popular-products/
COPY packages/storefront/package.json packages/storefront/
COPY packages/ui-kit/package.json packages/ui-kit/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# Build all plugins as one `tsc -b` invocation (TypeScript Project References —
# see AGENTS.md's "Monorepo dist/ and dev watching"), then just the server
# itself — its plugin dependencies are already built at this point. Not
# `pnpm --filter "server..." build` (N independent one-shot tsc processes,
# one per plugin) — storefront/ui-kit are never copied into the runner stage
# and have unrelated pre-existing type errors that shouldn't block a
# server-only image, which `tsc -b`'s explicit plugin-only project list
# already ensures without relying on pnpm's filter syntax for that guarantee.
RUN pnpm build:plugins && pnpm --filter "server" build

# Debian-based (not Alpine) specifically so Puppeteer can drive a real,
# apt-installed Chromium — musl/Alpine support for Chromium is unreliable.
FROM node:20-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/static ./static
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
