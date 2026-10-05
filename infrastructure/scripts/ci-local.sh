#!/usr/bin/env bash
# Mirrors .github/workflows/ci.yml on a clean checkout of HEAD with an empty pnpm store,
# so missing registry auth or lockfile drift fails here instead of on GitHub.
set -euo pipefail

root=$(git rev-parse --show-toplevel)
tmp=$(mktemp -d)
cleanup() {
    git -C "$root" worktree remove --force "$tmp/wt" 2>/dev/null || true
    rm -rf "$tmp"
}
trap cleanup EXIT

git -C "$root" worktree add --detach "$tmp/wt" HEAD
cd "$tmp/wt"

pnpm install --frozen-lockfile --store-dir "$tmp/store"
pnpm lint
make check-event-contracts
pnpm format:check
pnpm --filter shared build
pnpm --filter server exec tsc --noEmit
pnpm --filter @mivend/storefront exec vue-tsc --noEmit
pnpm --filter @mivend/manager exec vue-tsc --noEmit
pnpm --filter @mivend/dashboard exec tsc --noEmit
pnpm test
pnpm exec vitest run packages/plugins/sync/src/__tests__/contracts
