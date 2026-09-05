#!/usr/bin/env bash
# Runs the given command as the leader of a brand-new process group (via `setsid`) and records
# that leader's PID to $1 — since it's a session/group leader, its PID also IS the process
# group id, so a future dev-kill script can reliably `kill -9 -- -<pgid>` the WHOLE tree in one
# shot, regardless of how many generations of children it has spawned by then.
#
# Fixes a real, lived incident (2026-09-05): the previous kill scripts only found processes by
# walking descendants from a currently-alive `dotenv-cli` ancestor matched via its own cmdline
# (e.g. "-e apps/server/.env.central.staging-integration"). If that ancestor had already died in
# an earlier, partial kill — its own `ts-node-dev --respawn` child survives independently
# (respawn doesn't care that its parent died, it just gets reparented, e.g. to PID 1) — the
# script had no way to find or kill that orphan anymore, since the identifying ancestor was gone.
# Each subsequent `make dev-*` run then killed only the newest traceable generation and started
# one more on top, while every older orphan kept running forever, silently fighting the new one
# for the same port / Kafka consumer group. A process's group membership, unlike its parent link,
# survives reparenting — so kill-by-group can never lose track of a live descendant this way.
#
# `-w` (wait) keeps this blocking/foreground, exactly like running the command directly — `make
# dev` still occupies the terminal and streams logs the same way it always has.
set -euo pipefail

pidfile="$1"
shift

exec setsid -w bash -c 'echo $$ > "$0"; exec "$@"' "$pidfile" "$@"
