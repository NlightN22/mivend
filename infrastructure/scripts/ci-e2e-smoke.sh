#!/usr/bin/env bash
set -euo pipefail

# CI entry for the E2E smoke subset: infra up, build, then `make e2e-smoke`, which boots its own
# throwaway e2e stack (database, server, workers, portals), seeds it and tears it down (#274).

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
COMPOSE="docker compose -f $REPO_ROOT/infrastructure/docker/docker-compose.dev.yml"
cd "$REPO_ROOT"

# .env.central is gitignored; the e2e stack reads the local contour settings from it.
[ -f apps/server/.env.central ] || cp apps/server/.env.central.example apps/server/.env.central

# The documents plugin launches Chrome at bootstrap; postinstall did not download it on CI runners.
pnpm --filter @mivend/plugin-documents exec puppeteer browsers install chrome

cleanup() {
    local code=$?
    # `compose up -d` never streams container logs; dump them before teardown on any failure.
    if [ "$code" -ne 0 ]; then $COMPOSE logs --no-color || true; fi
    $COMPOSE down -v || true
    exit "$code"
}
trap cleanup EXIT

# Runners set GITHUB_REPOSITORY_OWNER case-preserved; Docker image references must be lowercase.
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-nlightn22}"
export GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER,,}"
$COMPOSE up -d --wait

# The e2e server loads plugins from dist/; the portals run as Vite dev servers and need no build.
pnpm --filter '!@mivend/manager' --filter '!@mivend/storefront' -r build

make e2e-smoke
