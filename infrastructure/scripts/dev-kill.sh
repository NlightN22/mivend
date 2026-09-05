#!/usr/bin/env bash
# Kill stale dev server + storefront processes before starting a fresh local-contour stack.
#
# Issue #68 follow-up (audit-caught regression in the first version of this fix): a leaf-PID
# cmdline filter does NOT protect ts-node-dev — verified directly on live processes. dotenv-cli
# ("-e apps/server/.env.branch" / "-e apps/server/.env.central.staging-integration") is the
# PARENT of `pnpm --filter server dev`, which execs ts-node-dev, which spawns a further child node
# process — none of those descendants' own /proc/<pid>/cmdline carries the env-file text, only
# the dotenv-cli ancestor does (same discovery already documented in dev-kill-branch.sh's own
# comment). So this script protects ts-node-dev via an ancestor-then-descendant-tree walk from
# those dotenv-cli roots (same proven pattern as dev-kill-branch.sh/dev-kill-staging-integration.sh),
# not a leaf-cmdline filter.
#
# concurrently and vite are different: the sub-commands/`--mode` flag passed to them are literal
# argv entries (not shell-expanded), so THEIR OWN cmdline genuinely does carry a usable marker
# (e.g. concurrently's argv literally contains the string "pnpm dev:central:staging-integration";
# vite's contains "--mode staging-integration") — a plain substring filter is correct for those
# two specifically.
collect_descendants() {
    local pid=$1
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        collect_descendants "$child"
        echo "$child"
    done
}

# Roots belonging to OTHER contours/instances — this script (and everything it kills below) must
# never touch these PIDs or anything descended from them.
other_roots=$(pgrep -f "apps/server/\.env\.branch\b|apps/server/\.env\.central\.staging-integration\b" 2>/dev/null || true)
protected_pids=" "
for root in $other_roots; do
    protected_pids="$protected_pids $root $(collect_descendants "$root") "
done

is_protected() {
    case "$protected_pids" in
        *" $1 "*) return 0 ;;
        *) return 1 ;;
    esac
}

exclude_other_contours() {
    while read -r pid; do
        [ -z "$pid" ] && continue
        is_protected "$pid" && continue
        cmdline=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)
        case "$cmdline" in
            *"staging-integration"* | *"dev:branch"* | *"worker:branch"* | *"apps/server/.env.branch"*)
                continue
                ;;
        esac
        echo "$pid"
    done
}

pids=$(pgrep -f "ts-node-dev" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

# Matches both a standalone "tsc --watch" (manual single-plugin debugging)
# and the normal "tsc -b packages/plugins/tsconfig.json --watch" orchestrator
# (see AGENTS.md's "Monorepo dist/ and dev watching") — a plain "tsc --watch"
# substring match misses the -b invocation entirely, which would let stale
# tsc -b processes pile up silently across make dev restarts.
pids=$(pgrep -f "tsc -b|tsc --watch" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "concurrently/dist/bin/concurrently" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

pids=$(pgrep -f "vite" 2>/dev/null | exclude_other_contours)
[ -n "$pids" ] && kill -9 $pids 2>/dev/null || true

fuser -k 3000/tcp 2>/dev/null || true
fuser -k 3002/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
fuser -k 5174/tcp 2>/dev/null || true
fuser -k 5175/tcp 2>/dev/null || true
fuser -k 5176/tcp 2>/dev/null || true

exit 0
