#!/usr/bin/env bash
# Kill stale branch-instance dev processes (server + worker) before starting a fresh branch
# stack — WITHOUT touching the central instance's ts-node-dev/tsc processes, which match the
# exact same command-line pattern and would otherwise be killed by a naive `pgrep -f
# ts-node-dev` (see dev-kill.sh, which is deliberately central/general-stack-wide).
#
# Branch processes are identified by ancestry, not by command-line pattern: dotenv-cli is
# invoked with "-e apps/server/.env.branch" (see package.json's dev:branch/dev:worker:branch),
# so we find those root PIDs first, then kill their full descendant tree (ts-node-dev spawns a
# child node process whose own command line has no branch-identifying marker at all).

collect_descendants() {
    local pid=$1
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        collect_descendants "$child"
        echo "$child"
    done
}

roots=$(pgrep -f "apps/server/\.env\.branch\b" 2>/dev/null || true)

all_pids=""
for root in $roots; do
    all_pids="$all_pids $(collect_descendants "$root") $root"
done

if [ -n "$(echo "$all_pids" | tr -d '[:space:]')" ]; then
    # shellcheck disable=SC2086
    kill -9 $all_pids 2>/dev/null || true
fi

# Catch any straggler still bound to the branch instance's own ports (central uses 3000/3002,
# manager/storefront use 5173-5176 — see dev-kill.sh; these are branch-only, safe to force-free).
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 3003/tcp 2>/dev/null || true

exit 0
