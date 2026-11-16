#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../dev-kill-lib.sh"

fail() { echo "FAIL: $1"; exit 1; }

sleeper=$(mktemp -d)
cp /bin/sleep "$sleeper/leaf"
bash -c "bash -c '\"$sleeper/leaf\" 30 & \"$sleeper/leaf\" 30 & wait' & wait" &
root=$!
sleep 0.5
expected=$(pstree -p "$root" | grep -o '([0-9]*)' | tr -d '()' | grep -v "^$root$" | sort -n | tr '\n' ' ')
actual=$(collect_descendants "$root" | sort -n | tr '\n' ' ')
[ "$expected" = "$actual" ] || fail "collect_descendants: expected [$expected], got [$actual]"
[ "$(echo "$actual" | wc -w)" -ge 3 ] || fail "tree too shallow to test: [$actual]"
kill $root $actual 2>/dev/null || true

(cd / && setsid sleep 30) &
foreign=$!
sleep 0.2
pidfile=$(mktemp)
ps -o pgid= -p "$foreign" | tr -d ' ' > "$pidfile"
kill_recorded_group "$pidfile"
sleep 0.2
kill -0 "$foreign" 2>/dev/null || fail "kill_recorded_group killed a group running outside the repo"
[ ! -f "$pidfile" ] || fail "pidfile not removed"
kill "$foreign"

(cd "$REPO_ROOT" && exec setsid sleep 30) &
own=$!
disown "$own"
sleep 0.2
ps -o pgid= -p "$own" | tr -d ' ' > "$pidfile"
kill_recorded_group "$pidfile"
sleep 0.2
! kill -0 "$own" 2>/dev/null || fail "kill_recorded_group left the repo's own group alive"

sibling="$REPO_ROOT-sibling-$$"
mkdir -p "$sibling"
cp /bin/sleep "$sleeper/vitest-run"
(cd "$REPO_ROOT" && exec "$sleeper/leaf" 30) & in_repo=$!
(cd "$sibling" && exec "$sleeper/leaf" 30) & in_sibling=$!
(cd / && exec "$sleeper/leaf" 30) & elsewhere=$!
(cd "$REPO_ROOT" && exec "$sleeper/vitest-run" 30) & test_runner=$!
sleep 0.3
kept=$(printf '%s\n' "$in_repo" "$in_sibling" "$elsewhere" "$test_runner" | only_this_repo | tr '\n' ' ')
[ "$kept" = "$in_repo $test_runner " ] || fail "only_this_repo: expected [$in_repo $test_runner ], got [$kept] (a sibling checkout sharing the path prefix must not match)"
runners=$(printf '%s\n' "$in_repo" "$test_runner" | skip_test_runners | tr '\n' ' ')
[ "$runners" = "$in_repo " ] || fail "skip_test_runners: expected [$in_repo ], got [$runners]"

port=$((20000 + RANDOM % 20000))
(cd "$REPO_ROOT" && exec python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1) & own_listener=$!
(cd "$sibling" && exec python3 -m http.server "$((port + 1))" --bind 127.0.0.1 >/dev/null 2>&1) & sibling_listener=$!
sleep 1
kill_repo_port_owners "$port" "$((port + 1))"
sleep 0.3
{ wait "$own_listener"; } 2>/dev/null || true
! kill -0 "$own_listener" 2>/dev/null || fail "kill_repo_port_owners left the repo's own listener alive"
kill -0 "$sibling_listener" 2>/dev/null || fail "kill_repo_port_owners killed a listener of a sibling checkout"
kill "$sibling_listener" "$in_repo" "$in_sibling" "$elsewhere" "$test_runner" 2>/dev/null || true
rmdir "$sibling"


rm -rf "$sleeper"
echo "dev-kill-lib: ok"
