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

# Keeps only the pids whose cwd is inside this checkout; the trailing slash keeps /opt/app out of /opt/app-wt-1.
only_this_repo() {
    local pid
    while read -r pid || [ -n "$pid" ]; do
        [ -n "$pid" ] || continue
        case "$(readlink "/proc/$pid/cwd" 2>/dev/null)/" in
            "$REPO_ROOT/"*) echo "$pid" ;;
        esac
    done
}

# A test runner's path contains "vite", so a plain "vite" pattern would kill every vitest run.
skip_test_runners() {
    local pid
    while read -r pid || [ -n "$pid" ]; do
        [ -n "$pid" ] || continue
        case "$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" in
            *vitest*) ;;
            *) echo "$pid" ;;
        esac
    done
}

kill_repo_port_owners() {
    local port pids
    for port in "$@"; do
        pids=$(fuser "$port/tcp" 2>/dev/null | tr -s ' ' '\n' | only_this_repo | tr '\n' ' ')
        # shellcheck disable=SC2086
        [ -z "${pids// /}" ] || kill -9 $pids 2>/dev/null || true
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
        if [[ "$(readlink "/proc/$member/cwd" 2>/dev/null)/" == "$REPO_ROOT"/* ]]; then
            kill -9 -- "-$pgid" 2>/dev/null || true
            return 0
        fi
    done
}
