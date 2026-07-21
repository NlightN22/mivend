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

# apps/server/.env.central is gitignored (.gitignore's ".env.*" rule — only .env.*.example
# variants are committed), so it never exists on a fresh CI checkout. dotenv-cli silently no-ops
# on a missing file (no error), so the server started with none of its expected env vars set,
# and Vendure's own hardcoded fallback (`process.env.DB_NAME ?? 'mivend'`, vendure-config.ts)
# kicked in — a database that was never created, since docker-compose creates `mivend_central`.
# The .example file is a real, working drop-in for local/CI dev use (no secrets — same
# postgres/postgres credentials docker-compose.dev.yml itself hardcodes), so just seed it.
[ -f apps/server/.env.central ] || cp apps/server/.env.central.example apps/server/.env.central

# plugin-documents' PdfBrowserService launches a real Chrome via puppeteer at server bootstrap
# (onModuleInit) — a missing browser throws there, which crashes the whole Nest bootstrap (not
# just PDF generation), so :3000/health never comes up at all. `puppeteer` is in this repo's
# `pnpm.onlyBuiltDependencies` allowlist, which normally lets its postinstall download Chrome —
# but that didn't happen on this fresh CI runner (cache path empty), so install it explicitly
# rather than depend on postinstall behavior working silently.
pnpm --filter @mivend/plugin-documents exec puppeteer browsers install chrome

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
# GitHub Actions runners set GITHUB_REPOSITORY_OWNER themselves (to the real, case-preserved
# repo owner login, e.g. "NlightN22") — so the docker-compose file's own
# `${GITHUB_REPOSITORY_OWNER:-nlightn22}` fallback never actually triggers in CI, and Docker
# rejects an image reference with an uppercase repository name ("invalid reference format").
# Lowercase it explicitly rather than relying on a default that only applies when the var is
# unset, which is never true here.
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER:-nlightn22}"
GITHUB_REPOSITORY_OWNER="${GITHUB_REPOSITORY_OWNER,,}" $COMPOSE up -d --wait

# Bounded wait, not an infinite `until ...; do sleep 2; done` loop — real incident this fixes:
# GitHub Actions' ubuntu runner image has its own `dotenv` on PATH (the Ruby gem, pre-installed
# for unrelated tooling), which shadows this project's `dotenv-cli` npm package and doesn't
# support the `-e` flag. The migration server process below crashed instantly with an
# unrecognized-option error, but since it runs backgrounded (`&`), `set -euo pipefail` never saw
# that failure — the script just sat waiting on a port that was never going to open, for the
# workflow's entire multi-hour default timeout, wasting CI minutes for no reason. A bounded wait
# turns "hangs forever" into "fails loudly within a few minutes" for this and any similar future
# background-process failure.
wait_for_url() {
    local url="$1"
    local timeout_s="${2:-120}"
    local waited=0
    until curl -sf "$url" >/dev/null 2>&1; do
        if [ "$waited" -ge "$timeout_s" ]; then
            echo "::error::Timed out after ${timeout_s}s waiting for $url" >&2
            return 1
        fi
        sleep 2
        waited=$((waited + 2))
    done
}

echo "==> Building plugins + shared + server (ts-node-dev needs plugins' compiled dist/)..."
# The "integration" job (integration.yml) has its own separate "Build plugins" step, but this is
# a different job on a different, fresh runner with no shared filesystem — apps/server's
# `dev` script (ts-node-dev) `require()`s each `@mivend/plugin-*` package directly, which
# resolves to its `dist/index.js` via package.json's "main" field. On a fresh checkout with no
# prior build, that dist/ doesn't exist yet, so the migration server crashed on its very first
# plugin import — never listens on :3000, and the wait below timed out. manager/storefront are
# excluded (same reasoning as integration.yml): they're started via `pnpm dev:all`'s own Vite dev
# servers, which compile on the fly and don't need a pre-build.
pnpm --filter '!@mivend/manager' --filter '!@mivend/storefront' -r build

echo "==> Starting Vendure server natively for initial migration..."
# `pnpm exec dotenv` (or the equivalent `pnpm dev:central` script, used here) forces resolution
# through node_modules/.bin — never the shadowing system `dotenv` above.
pnpm dev:central &
MIGRATE_PID=$!

echo "==> Waiting for Vendure server on :3000..."
wait_for_url http://localhost:3000/health
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
    wait_for_url "$url" 180
done

echo "==> Running E2E smoke subset..."
make e2e-smoke
