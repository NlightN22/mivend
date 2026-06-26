FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/plugins/customer-pricing/package.json packages/plugins/customer-pricing/
COPY packages/plugins/sync/package.json packages/plugins/sync/
COPY packages/plugins/erp-adapter-1c/package.json packages/plugins/erp-adapter-1c/
COPY packages/storefront/package.json packages/storefront/
COPY packages/ui-kit/package.json packages/ui-kit/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter "{packages/**}" build
RUN pnpm --filter server build

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/static ./static
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/packages ./packages

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/main.js"]
