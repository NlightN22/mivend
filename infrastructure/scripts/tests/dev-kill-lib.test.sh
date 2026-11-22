#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/../dev-kill-lib.sh"

fail() { echo "FAIL: $1"; exit 1; }

started=()
scratch=()
cleanup() {
  local pid
  for pid in ${started[@]+"${started[@]}"}; do
    kill $(collect_descendants "$pid") "$pid" 2>/dev/null || true
  done
  rm -rf ${scratch[@]+"${scratch[@]}"}
}
trap cleanup EXIT
trap 'exit 1' INT TERM

wait_until() {
  local timeout=$1 i
  shift
  for ((i = 0; i < timeout * 20; i++)); do
    "$@" && return 0
    sleep 0.05
  done
  return 1
}

is_alive() {
  local state
  state=$(ps -o stat= -p "$1" 2>/dev/null) || return 1
  [ -n "$state" ] && [ "${state:0:1}" != Z ]
}
is_dead() { ! is_alive "$1"; }

assert_alive_for_a_moment() {
  local i
  for ((i = 0; i < 6; i++)); do
    is_alive "$1" || return 1
    sleep 0.05
  done
}

has_comm() { [ "$(cat "/proc/$1/comm" 2>/dev/null)" = "$2" ]; }
is_own_group_leader() { [ "$(ps -o pgid= -p "$1" 2>/dev/null | tr -d ' ')" = "$1" ]; }
tree_is_deep() { [ "$(collect_descendants "$1" | wc -w)" -ge 3 ]; }
is_listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# A child must not inherit the shared test-lock descriptor, or a leftover keeps every later run queued.
close_inherited_fds() {
  local f n
  for f in /proc/$BASHPID/fd/*; do
    n=${f##*/}
    if [ "$n" -gt 2 ] 2>/dev/null; then eval "exec $n>&-" 2>/dev/null || true; fi
  done
}

spawn_in() {
  local dir=$1
  shift
  (cd "$dir" && close_inherited_fds && exec "$@") &
  started+=($!)
  disown $!
  spawned=$!
}

free_ports() {
  python3 - "$1" <<'EOF'
import socket, sys
socks = [socket.socket() for _ in range(int(sys.argv[1]))]
for s in socks:
    s.bind(("127.0.0.1", 0))
print(" ".join(str(s.getsockname()[1]) for s in socks))
EOF
}

sleeper=$(mktemp -d)
scratch+=("$sleeper")
cp /bin/sleep "$sleeper/leaf"
cp /bin/sleep "$sleeper/vitest-run"

spawn_in / bash -c "bash -c '\"$sleeper/leaf\" 30 & \"$sleeper/leaf\" 30 & wait' & wait"
root=$spawned
wait_until 10 tree_is_deep "$root" || fail "tree too shallow to test: [$(collect_descendants "$root" | tr '\n' ' ')]"
expected=$(pstree -p "$root" | grep -o '([0-9]*)' | tr -d '()' | grep -v "^$root$" | sort -n | tr '\n' ' ')
actual=$(collect_descendants "$root" | sort -n | tr '\n' ' ')
[ "$expected" = "$actual" ] || fail "collect_descendants: expected [$expected], got [$actual]"
kill $root $actual 2>/dev/null || true

spawn_in / setsid sleep 30
foreign=$spawned
wait_until 10 is_own_group_leader "$foreign" || fail "foreign sleeper did not become a group leader"
pidfile=$(mktemp)
scratch+=("$pidfile")
ps -o pgid= -p "$foreign" | tr -d ' ' > "$pidfile"
kill_recorded_group "$pidfile"
assert_alive_for_a_moment "$foreign" || fail "kill_recorded_group killed a group running outside the repo"
[ ! -f "$pidfile" ] || fail "pidfile not removed"
kill "$foreign"

spawn_in "$REPO_ROOT" setsid sleep 30
own=$spawned
wait_until 10 is_own_group_leader "$own" || fail "repo sleeper did not become a group leader"
ps -o pgid= -p "$own" | tr -d ' ' > "$pidfile"
kill_recorded_group "$pidfile"
wait_until 10 is_dead "$own" || fail "kill_recorded_group left the repo's own group alive"

sibling="$REPO_ROOT-sibling-$$"
mkdir -p "$sibling"
scratch+=("$sibling")
spawn_in "$REPO_ROOT" "$sleeper/leaf" 30
in_repo=$spawned
spawn_in "$sibling" "$sleeper/leaf" 30
in_sibling=$spawned
spawn_in / "$sleeper/leaf" 30
elsewhere=$spawned
spawn_in "$REPO_ROOT" "$sleeper/vitest-run" 30
test_runner=$spawned
for pid in "$in_repo" "$in_sibling" "$elsewhere"; do
  wait_until 10 has_comm "$pid" leaf || fail "process $pid did not start"
done
wait_until 10 has_comm "$test_runner" vitest-run || fail "test runner $test_runner did not start"
kept=$(printf '%s\n' "$in_repo" "$in_sibling" "$elsewhere" "$test_runner" | only_this_repo | tr '\n' ' ')
[ "$kept" = "$in_repo $test_runner " ] || fail "only_this_repo: expected [$in_repo $test_runner ], got [$kept] (a sibling checkout sharing the path prefix must not match)"
runners=$(printf '%s\n' "$in_repo" "$test_runner" | skip_test_runners | tr '\n' ' ')
[ "$runners" = "$in_repo " ] || fail "skip_test_runners: expected [$in_repo ], got [$runners]"

read -r port sibling_port <<< "$(free_ports 2)"
spawn_in "$REPO_ROOT" python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1
own_listener=$spawned
spawn_in "$sibling" python3 -m http.server "$sibling_port" --bind 127.0.0.1 >/dev/null 2>&1
sibling_listener=$spawned
wait_until 20 is_listening "$port" || fail "repo listener did not bind port $port"
wait_until 20 is_listening "$sibling_port" || fail "sibling listener did not bind port $sibling_port"
kill_repo_port_owners "$port" "$sibling_port"
wait_until 10 is_dead "$own_listener" || fail "kill_repo_port_owners left the repo's own listener alive"
assert_alive_for_a_moment "$sibling_listener" || fail "kill_repo_port_owners killed a listener of a sibling checkout"

echo "dev-kill-lib: ok"
