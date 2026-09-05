#!/usr/bin/env bash
# Kill stale dev server + storefront processes before starting a fresh local-contour stack.
#
# Issue #68 follow-up: a naive blanket `pgrep -f "ts-node-dev"`/`tsc`/`vite`/`concurrently` kill
# also matches an already-running `make dev-staging-integration` (or `make dev-branch`) stack's
# processes — those tools have no local-contour-identifying string in their own binary path, only
# in the full command line of the specific invocation that spawned them. `exclude_other_contours`
# filters any PID whose full /proc/<pid>/cmdline belongs to another contour/instance before it's
# killed, so this script stays local-contour-only.
exclude_other_contours() {
    while read -r pid; do
        [ -z "$pid" ] && continue
        cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
        case "$cmdline" in
            *"apps/server/.env.central.staging-integration"* | *"staging-integration"* | *"apps/server/.env.branch"*)
                continue
                ;;
        esac
        echo "$pid"
    done
}

pids=$(pgrep -f "ts-node-dev" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

# Matches both a standalone "tsc --watch" (manual single-plugin debugging)
# and the normal "tsc -b packages/plugins/tsconfig.json --watch" orchestrator
# (see AGENTS.md's "Monorepo dist/ and dev watching") — a plain "tsc --watch"
# substring match misses the -b invocation entirely, which would let stale
# tsc -b processes pile up silently across make dev restarts.
pids=$(pgrep -f "tsc -b|tsc --watch" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "concurrently/dist/bin/concurrently" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "vite" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 5174/tcp 2>/dev/null || true
fuser -k 5175/tcp 2>/dev/null || true
fuser -k 5176/tcp 2>/dev/null || true

exit 0
