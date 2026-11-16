#!/usr/bin/env bash
# Stops this checkout's Storybook dev servers only; another worktree's stay up.
source "$(dirname "$0")/dev-kill-lib.sh"

kill_repo_port_owners 6006 6016 6018
pids=$(pgrep -f "storybook dev" 2>/dev/null | only_this_repo | tr '\n' ' ')
# shellcheck disable=SC2086
[ -z "${pids// /}" ] || kill -9 $pids 2>/dev/null || true

exit 0
