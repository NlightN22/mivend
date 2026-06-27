#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f $REPO_ROOT/infrastructure/docker/docker-compose.dev.yml"

cd "$REPO_ROOT"

echo "==> Tearing down volumes..."
$COMPOSE down -v

echo "==> Starting infra (postgres, redis, rabbitmq, elasticsearch)..."
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-nlightn22}" $COMPOSE up -d

echo "==> Waiting for postgres to be healthy..."
until $COMPOSE exec -T postgres-central pg_isready -U postgres >/dev/null 2>&1; do
    sleep 2
done

echo "==> Starting Vendure server natively for initial migration..."
dotenv -e apps/server/.env.central -- pnpm --filter server dev &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true' EXIT

echo "==> Waiting for Vendure API on :3000..."
until curl -sf -X POST http://localhost:3000/shop-api \
    -H 'Content-Type: application/json' \
    -d '{"query":"{__typename}"}' | grep -q typename; do
    sleep 3
done

echo "==> Seeding database..."
node infrastructure/scripts/seed.mjs

echo "==> Stopping temporary server..."
trap - EXIT
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "==> Seed complete. Starting full dev stack..."
pnpm dev:all
