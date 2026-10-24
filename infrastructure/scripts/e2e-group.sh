#!/usr/bin/env bash
# Prints the Playwright args of an E2E group from the docs/e2e-testing.md registry: e2e-group.sh <suite> <name>
set -euo pipefail
doc="$(dirname "$0")/../../docs/e2e-testing.md"
args=$(awk -F'|' -v s="$1" -v g="\`$2\`" '
  { for (i = 1; i <= NF; i++) gsub(/^ +| +$/, "", $i) }
  $2 == g && $3 == s { a = $5; gsub(/`/, "", a); print a }' "$doc")
[ -n "$args" ] || { echo "unknown $1 group '$2' (see docs/e2e-testing.md)" >&2; exit 1; }
echo "$args"
