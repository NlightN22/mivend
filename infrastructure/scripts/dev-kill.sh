#!/usr/bin/env bash
# Kill stale dev server processes (ts-node-dev watchers and concurrently)
# Called from 'make dev' before starting a fresh stack.

pids=$(pgrep -f "ts-node-dev/lib/bin" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "concurrently/dist/bin/concurrently" 2>/dev/null)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true

exit 0
