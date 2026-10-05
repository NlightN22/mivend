# Build with: docker build -f apps/server/Dockerfile --secret id=npmrc,src=$HOME/.npmrc .
# Puppeteer's Chromium is skipped on Alpine; the runner stage uses apt-installed Chromium.
FROM node:20-alpine AS deps
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
