#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "FAIL: $1"; exit 1; }
alive() { kill -0 "$1" 2>/dev/null; }

work=$(mktemp -d)
trap 'for f in "$work"/*.pgid "$work"/*.grp; do [ -f "$f" ] && kill -9 -- "-$(cat "$f")" 2>/dev/null; done; rm -rf "$work"' EXIT

export STUCK_STATUS_FILE="$work/status.json" STUCK_INTERVAL_SECS=1 STUCK_CPU_PCT=50 STUCK_BUSY_SECS=2
export STUCK_COMM='^python3$' STUCK_PGID_GLOB="$work/*.pgid"

port_live=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')
printf 'while True: pass\n' > "$work/spin.py"
printf 'import socket\ns = socket.socket()\ns.bind(("127.0.0.1", %s))\ns.listen()\nwhile True: pass\n' "$port_live" > "$work/serve.py"

printf '#!/usr/bin/env bash\necho $$ > "$WORK/$1.pid"\nshift\nexec "$@"\n' > "$work/child.sh"
printf '#!/usr/bin/env bash\necho $$ > "$1"\nshift\nfor c in "$@"; do bash "$WORK/child.sh" $c &\ndone\nwait\n' > "$work/group.sh"
export WORK="$work"
start_group() {
    local name=$1
    shift
    setsid bash "$work/group.sh" "$work/$name.${GROUP_EXT:-pgid}" "$@" &
    sleep 1
}

start_group tracked "stuck python3 $work/spin.py" "serving python3 $work/serve.py" "sibling sleep 602"
GROUP_EXT=grp start_group other "other python3 $work/spin.py"
stuck=$(cat "$work/stuck.pid"); serving=$(cat "$work/serving.pid")
sibling=$(cat "$work/sibling.pid"); other=$(cat "$work/other.pid")

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

STUCK_KILL=1 python3 "$here/stuck-scan.py" 6 2>/dev/null
alive "$stuck" && fail "tracked stuck process was not killed"
alive "$serving" || fail "serving sibling was killed"
alive "$sibling" || fail "idle sibling was killed"
alive "$other" || fail "untracked stuck process was killed"

echo "stuck-scan: ok"
