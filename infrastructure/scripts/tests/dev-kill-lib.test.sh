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

rm -rf "$sleeper"
echo "dev-kill-lib: ok"
