#!/usr/bin/env bash
set -euo pipefail

# Boots the full dev stack non-interactively for CI, runs the E2E smoke subset (make e2e-smoke),
# then tears everything down and propagates the test exit code. Mirrors dev-fresh.sh's
# infra-up -> migrate -> seed sequence, but backgrounds `pnpm dev:all` instead of leaving it in
# the foreground, and always cleans up background processes on exit.
#
# Heavy/full E2E stays local-only (`make e2e`) per docs/testing-strategy.md's "E2E strategy" —
# this script only exists to run the small @smoke subset in CI.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f $REPO_ROOT/infrastructure/docker/docker-compose.dev.yml"
cd "$REPO_ROOT"

DEV_PID=""
cleanup() {
    local code=$?
    if [ -n "$DEV_PID" ]; then
        kill "$DEV_PID" 2>/dev/null || true
        wait "$DEV_PID" 2>/dev/null || true
    fi
    $COMPOSE down -v || true
    exit "$code"
}
trap cleanup EXIT

echo "==> Starting infra (postgres, redis, rabbitmq, elasticsearch)..."
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-nlightn22}" $COMPOSE up -d --wait

echo "==> Starting Vendure server natively for initial migration..."
dotenv -e apps/server/.env.central -- pnpm --filter server dev &
MIGRATE_PID=$!

echo "==> Waiting for Vendure server on :3000..."
until curl -sf http://localhost:3000/health >/dev/null 2>&1; do
    sleep 2
done
kill "$MIGRATE_PID" 2>/dev/null || true
wait "$MIGRATE_PID" 2>/dev/null || true

echo "==> Seeding..."
node infrastructure/scripts/seed-access-roles.mjs
ERP_IMPORT_TOKEN="${ERP_IMPORT_TOKEN:-dev-token}" node infrastructure/scripts/seed-erp.mjs
node infrastructure/scripts/seed-approvals.mjs

echo "==> Starting full dev stack in background..."
pnpm dev:all &
DEV_PID=$!

echo "==> Waiting for server (:3000), storefront (:5173), manager (:5174)..."
for url in http://localhost:3000/health http://localhost:5173 http://localhost:5174; do
    until curl -sf "$url" >/dev/null 2>&1; do
        sleep 2
    done
done

echo "==> Running E2E smoke subset..."
make e2e-smoke
