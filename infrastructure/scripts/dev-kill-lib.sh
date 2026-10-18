#!/usr/bin/env bash
# Shared by the dev-kill*.sh scripts; source it, don't run it.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

collect_descendants() {
    local pid=$1
    local children child
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        collect_descendants "$child"
        echo "$child"
    done
}

# A stale pgid file may name a reused group id; kill it only if a member still runs from this repo.
kill_recorded_group() {
    local pidfile=$1 pgid member
    [ -f "$pidfile" ] || return 0
    pgid=$(cat "$pidfile" 2>/dev/null || true)
    rm -f "$pidfile"
    [ -n "$pgid" ] || return 0
    for member in $(pgrep -g "$pgid" 2>/dev/null || true); do
        if [[ "$(readlink "/proc/$member/cwd" 2>/dev/null)" == "$REPO_ROOT"* ]]; then
            kill -9 -- "-$pgid" 2>/dev/null || true
            return 0
        fi
    done
}
