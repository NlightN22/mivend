#!/usr/bin/env bash
# Kill stale staging-integration-contour dev processes (server + worker) before starting a fresh
# staging-integration stack — WITHOUT touching the local contour's or the branch instance's own
# ts-node-dev processes, which match the exact same command-line pattern otherwise (see
# dev-kill.sh / dev-kill-branch.sh for the same problem on their own contours).
#
# Same ancestry-based approach as dev-kill-branch.sh: dotenv-cli is invoked with
# "-e apps/server/.env.central.staging-integration" (see package.json's
# dev:central:staging-integration/dev:worker:staging-integration), so find those root PIDs first,
# then kill their full descendant tree.

collect_descendants() {
    local pid=$1
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        collect_descendants "$child"
        echo "$child"
    done
}

roots=$(pgrep -f "apps/server/\.env\.central\.staging-integration\b" 2>/dev/null || true)

all_pids=""
for root in $roots; do
    all_pids="$all_pids $(collect_descendants "$root") $root"
done

if [ -n "$(echo "$all_pids" | tr -d '[:space:]')" ]; then
    # shellcheck disable=SC2086
    kill -9 $all_pids 2>/dev/null || true
fi

# Catch any straggler still bound to the staging-integration contour's own ports (local uses
# 3000/3002, branch uses 3001/3003 — see dev-kill.sh/dev-kill-branch.sh; these are
# staging-integration-only, safe to force-free).
fuser -k 3010/tcp 2>/dev/null || true
fuser -k 3012/tcp 2>/dev/null || true

exit 0
