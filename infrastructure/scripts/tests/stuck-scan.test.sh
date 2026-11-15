#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "FAIL: $1"; exit 1; }
alive() { kill -0 "$1" 2>/dev/null; }

work=$(mktemp -d)
trap 'for f in "$work"/*.pgid "$work"/*.grp "$work"/*.stale "$work"/*.foreign; do [ -f "$f" ] && { kill -9 -- "-$(cat "$f")" 2>/dev/null || true; }; done; rm -rf "$work" "${sibling_dir:-}"' EXIT

export STUCK_STATUS_FILE="$work/status.json" STUCK_INTERVAL_SECS=1 STUCK_CPU_PCT=15 STUCK_BUSY_SECS=2
export STUCK_ROOT="$(cd "$here/../.." && pwd)"
export STUCK_COMM='^python3$' STUCK_PGID_GLOB="$work/*.pgid"

port_live=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
printf 'while True: pass\n' > "$work/spin.py"
printf 'i = 0\nwhile True:\n    i += 1\n    if i %% 200000 == 0: print(i, flush=True)\n' > "$work/grow.py"
printf 'import socket\ns = socket.socket()\ns.bind(("127.0.0.1", %s))\ns.listen()\nwhile True: pass\n' "$port_live" > "$work/serve.py"

printf '#!/usr/bin/env bash\necho $$ > "$WORK/$1.pid"\nlog="$WORK/$1.log"\nshift\necho started > "$log"\nexec "$@" >> "$log" 2>&1\n' > "$work/child.sh"
printf '#!/usr/bin/env bash\necho $$ > "$1"\nshift\nfor c in "$@"; do bash "$WORK/child.sh" $c &\ndone\nwait\n' > "$work/group.sh"
export WORK="$work"
start_group() {
    local name=$1
    shift
    setsid bash "$work/group.sh" "$work/$name.${GROUP_EXT:-pgid}" "$@" &
    sleep 1
}

start_group tracked "stuck python3 $work/spin.py" "serving python3 $work/serve.py" "sibling sleep 602" "growing python3 $work/grow.py"
GROUP_EXT=grp start_group other "other python3 $work/spin.py"
sibling_dir="$(cd "$here/../.." && pwd)-sibling-$$"
mkdir "$sibling_dir"
(cd "$sibling_dir" && GROUP_EXT=stale start_group stale "stale python3 $work/spin.py")
GROUP_EXT=foreign start_group foreign "foreign python3 $work/spin.py"
chown nobody "$work"/foreign.foreign 2>/dev/null || true
stuck=$(cat "$work/stuck.pid"); serving=$(cat "$work/serving.pid")
sibling=$(cat "$work/sibling.pid"); growing=$(cat "$work/growing.pid"); stale=$(cat "$work/stale.pid"); foreign=$(cat "$work/foreign.pid"); other=$(cat "$work/other.pid")

python3 "$here/stuck-scan.py" 6
jq -e --argjson p "$stuck" '[.stuck[].pid] | index($p) != null' "$work/status.json" >/dev/null || fail "spinning non-listening process not reported"
jq -e --argjson p "$serving" '[.stuck[].pid] | index($p) == null' "$work/status.json" >/dev/null || fail "busy but serving process reported"
alive "$stuck" && alive "$serving" && alive "$other" || fail "detection-only scan killed something"

STUCK_CHECK=strict bash "$here/stuck-check.sh" 2>"$work/warn" && fail "strict pre-flight passed with stuck processes"
grep -q "spin.py" "$work/warn" || fail "pre-flight did not list the stuck process"
bash "$here/stuck-check.sh" 2>/dev/null || fail "non-strict pre-flight failed"
touch -d '10 minutes ago' "$work/status.json"
STUCK_CHECK=strict bash "$here/stuck-check.sh" 2>&1 | grep -q . && fail "stale file was not ignored"
STUCK_STATUS_FILE="$work/missing.json" STUCK_CHECK=strict bash "$here/stuck-check.sh" 2>&1 | grep -q . && fail "missing file was not ignored"

STUCK_PGID_GLOB="$work/*.pgid $work/*.stale $work/*.foreign" STUCK_KILL=1 python3 "$here/stuck-scan.py" 8 2>/dev/null
alive "$stuck" && fail "tracked stuck process was not killed"
alive "$serving" || fail "serving sibling was killed"
alive "$sibling" || fail "idle sibling was killed"
alive "$other" || fail "untracked stuck process was killed"
alive "$growing" && fail "tracked stuck process with a growing log was not killed"
alive "$stale" || fail "process of a group running outside the repo was killed"
alive "$foreign" || fail "process named by a foreign-owned group file was killed"

# A child with a piped stdout (make dev) is killed and its entry file touched to respawn it.
touch -d '1 hour ago' "$work/main.ts" "$work/worker.ts"
printf '#!/usr/bin/env bash\necho $$ > "$1"\nshift\nfor c in "$@"; do (exec python3 "$WORK/spin.py" $c) | cat &\ndone\nwait\n' > "$work/pipe-group.sh"
setsid bash "$work/pipe-group.sh" "$work/piped.pgid" "$work/main.ts" "$work/worker.ts" &
sleep 1
pgrep -f "spin.py $work/main.ts" >/dev/null || fail "piped server entry did not start"
server_entry=$(pgrep -f "spin.py $work/main.ts" | head -1); worker_entry=$(pgrep -f "spin.py $work/worker.ts" | head -1)
STUCK_COMM='^python3$' STUCK_PGID_GLOB="$work/piped.pgid" STUCK_KILL=1 python3 "$here/stuck-scan.py" 8 2>/dev/null
alive "$server_entry" && fail "piped stuck server entry was not killed"
alive "$worker_entry" && fail "piped stuck worker entry was not killed"
[ "$(stat -c %Y "$work/main.ts")" -gt "$(date -d '30 minutes ago' +%s)" ] || fail "entry file was not touched to respawn"
kill -9 -- "-$(cat "$work/piped.pgid")" 2>/dev/null || true

# A child that keeps being stuck is killed STUCK_MAX_KILLS times, then left alone and reported as giving_up.
printf '#!/usr/bin/env bash\necho $$ > "$1"\nshift\nwhile true; do python3 "$WORK/spin.py" "$@"; done\n' > "$work/loop.sh"
setsid bash "$work/loop.sh" "$work/loop.pgid" "$work/loop.ts" &
sleep 1
STUCK_PGID_GLOB="$work/loop.pgid" STUCK_MAX_KILLS=2 STUCK_KILL=1 python3 "$here/stuck-scan.py" 30 2>"$work/loop.err"
[ "$(grep -c 'killed tracked' "$work/loop.err")" -eq 2 ] || fail "looping child was not killed exactly STUCK_MAX_KILLS times"
grep -q "giving up" "$work/loop.err" || fail "giving up was not logged"
jq -e '[.stuck[] | select(.giving_up)] | length == 1' "$work/status.json" >/dev/null || fail "giving_up not in the status file"
kill -9 -- "-$(cat "$work/loop.pgid")" 2>/dev/null || true

echo "stuck-scan: ok"
