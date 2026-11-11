#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")/../../docker" && pwd)/pg-maintenance.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail() { echo "FAIL: $1"; exit 1; }

cat > "$tmp/vacuumdb" <<'STUB'
#!/bin/sh
echo "$*|$PGOPTIONS" >> "$CALLS"
case "$*" in *--full*) n=$(grep -c -- '--full' "$CALLS"); [ "$n" -ge "${OK_FROM:-1}" ] || exit 1;; esac
STUB
chmod +x "$tmp/vacuumdb"
run() { : > "$tmp/calls"; (export PATH="$tmp:$PATH" CALLS="$tmp/calls" MAINTENANCE_FULL_RETRY_SECONDS=0 "$@"; sh "$script" >/dev/null); }

run
[ "$(wc -l < "$tmp/calls")" = 1 ] && grep -q -- '--analyze' "$tmp/calls" || fail "default run is not a single analyze vacuum"

run MAINTENANCE_FULL_TABLES=a,b MAINTENANCE_LOCK_TIMEOUT=5s
[ "$(grep -c -- '--full --table a|-c lock_timeout=5s' "$tmp/calls")" = 1 ] || fail "table a not rebuilt under lock_timeout"
[ "$(grep -c -- '--full --table b|-c lock_timeout=5s' "$tmp/calls")" = 1 ] || fail "table b not rebuilt under lock_timeout"

run MAINTENANCE_FULL_TABLES=a OK_FROM=3
[ "$(grep -c -- '--full' "$tmp/calls")" = 3 ] || fail "lock failure not retried until it succeeds"

run MAINTENANCE_FULL_TABLES=a OK_FROM=9 MAINTENANCE_FULL_ATTEMPTS=2
[ "$(grep -c -- '--full' "$tmp/calls")" = 2 ] || fail "retries not capped"
echo "pg-maintenance: ok"
