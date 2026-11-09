#!/usr/bin/env bash
# Pre-flight and `make dev-health`: print the suspected stuck processes from the host scanner's status file.
# A missing or stale file is silent (the scanner may not be installed); `--verbose` says so.
# STUCK_CHECK=strict makes a non-empty list fail the caller.
set -uo pipefail

file="${STUCK_STATUS_FILE:-/run/mivend-stuck-processes.json}"
stale="${STUCK_STALE_SECS:-180}"

note() { if [ "${1:-}" = "--verbose" ]; then echo "stuck-check: $2"; fi; }

[ -f "$file" ] || { note "${1:-}" "no status file at $file (host scanner not running)"; exit 0; }
age=$(($(date +%s) - $(stat -c %Y "$file")))
[ "$age" -le "$stale" ] || { note "${1:-}" "status file is ${age}s old, ignoring"; exit 0; }

count=$(jq '.stuck | length' "$file" 2>/dev/null || echo 0)
if [ "$count" -eq 0 ]; then
    note "${1:-}" "no stuck processes"
    exit 0
fi

echo "WARNING: $count process(es) busy but not serving on this host (they slow every suite):" >&2
jq -r '.stuck[] | "  pid \(.pid)  \(.cpu_percent)% CPU for \(.busy_seconds)s  cwd \(.cwd)\n    \(.command)"' "$file" >&2
echo "  details: $file" >&2
[ "${STUCK_CHECK:-}" = strict ] && exit 1
exit 0
