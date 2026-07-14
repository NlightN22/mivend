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

echo "==> Waiting for Vendure server on :3000..."
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
    sleep 2
done

echo "==> Seeding access-control roles..."
node infrastructure/scripts/seed-access-roles.mjs

echo "==> Seeding database via ERP import..."
ERP_IMPORT_TOKEN="${ERP_IMPORT_TOKEN:-dev-token}" node infrastructure/scripts/seed-erp.mjs

echo "==> Stopping temporary server..."
trap - EXIT
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

echo ""
echo "==> Seed complete. Starting full dev stack..."
pnpm dev:all
