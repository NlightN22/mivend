#!/usr/bin/env bash
# Kill stale dev server + storefront processes before starting a fresh stack.

pids=$(pgrep -f "ts-node-dev" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

# Matches both a standalone "tsc --watch" (manual single-plugin debugging)
# and the normal "tsc -b packages/plugins/tsconfig.json --watch" orchestrator
# (see AGENTS.md's "Monorepo dist/ and dev watching") — a plain "tsc --watch"
# substring match misses the -b invocation entirely, which would let stale
# tsc -b processes pile up silently across make dev restarts.
pids=$(pgrep -f "tsc -b|tsc --watch" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "concurrently/dist/bin/concurrently" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "vite" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 5174/tcp 2>/dev/null || true
fuser -k 5175/tcp 2>/dev/null || true
fuser -k 5176/tcp 2>/dev/null || true

exit 0
