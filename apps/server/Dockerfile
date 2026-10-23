# Build with: docker build -f apps/server/Dockerfile --secret id=npmrc,src=$HOME/.npmrc .
# Same glibc base for build and run so native modules (sharp, bcrypt) match; Chromium is apt-installed in the runner.
FROM node:20-slim AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1

# Full copy: a selective package.json list drifted and skipped erp-integration's private dep.
COPY . .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc,required=true \
    pnpm install --frozen-lockfile

FROM deps AS builder
# One `tsc -b` over plugins, then the server only — frontends aren't part of this image.
RUN pnpm build:plugins && pnpm --filter "server" build

# Debian-based (not Alpine) specifically so Puppeteer can drive a real,
# apt-installed Chromium — musl/Alpine support for Chromium is unreliable.
FROM node:20-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium fonts-liberation libnss3 libatk-bridge2.0-0 libatk1.0-0 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Same layout as the workspace: pnpm symlinks in apps/server/node_modules resolve relative to it.
WORKDIR /app/apps/server
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages /app/packages
COPY --from=builder /app/infrastructure/fixtures /app/infrastructure/fixtures
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/static ./static
COPY --from=builder /app/apps/server/package.json ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
