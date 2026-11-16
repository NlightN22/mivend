#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../dev-kill-lib.sh"

fail() { echo "FAIL: $1"; exit 1; }

sibling="$REPO_ROOT-sibling-$$"
mkdir -p "$sibling"
(cd "$REPO_ROOT" && exec -a "storybook dev" sleep 30) & own=$!
(cd "$sibling" && exec -a "storybook dev" sleep 30) & foreign=$!
sleep 0.3
bash "$(dirname "$0")/../storybook-kill.sh"
sleep 0.3
{ wait "$own"; } 2>/dev/null || true
! kill -0 "$own" 2>/dev/null || fail "storybook-kill left this checkout's storybook alive"
kill -0 "$foreign" 2>/dev/null || fail "storybook-kill killed a storybook of a sibling checkout"
kill "$foreign"
rmdir "$sibling"
echo "storybook-kill: ok"
