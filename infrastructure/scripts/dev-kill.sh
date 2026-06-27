#!/usr/bin/env bash
# Kill stale dev server + storefront processes before starting a fresh stack.

pids=$(pgrep -f "ts-node-dev/lib/bin" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "concurrently/dist/bin/concurrently" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "vite/dist/node/cli" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 5174/tcp 2>/dev/null || true
fuser -k 5175/tcp 2>/dev/null || true
fuser -k 5176/tcp 2>/dev/null || true

exit 0
