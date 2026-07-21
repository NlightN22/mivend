#!/bin/sh
set -e

# Start postgres in background using the official entrypoint
docker-entrypoint.sh postgres "$@" &
PG_PID=$!

# Retries a command a bounded number of times, tolerating transient failures — necessary because
# the official postgres image's own entrypoint runs a two-phase startup on first init (a
# unix-socket-only "temp" instance that runs /docker-entrypoint-initdb.d/*, then a full shutdown,
# then the real listening instance). A single successful `psql` check only proves *some* instance
# is currently reachable, not which phase it's in — the temp instance can start shutting down at
# any point after that check succeeds, including mid-command. Without retrying each step
# individually, a command that races the temp-instance shutdown fails once, `set -e` kills this
# whole script, and the container exits(1) — a real incident this fixes (first-ever CI run of
# this image, see docs/testing-strategy.md's e2e-smoke debugging trail).
retry() {
    attempt=0
    max_attempts=30
    while [ "$attempt" -lt "$max_attempts" ]; do
        if "$@"; then
            return 0
        fi
        attempt=$((attempt + 1))
        sleep 1
    done
    echo "entrypoint.sh: command failed after ${max_attempts} attempts: $*" >&2
    return 1
}

# Wait for the REAL instance specifically — via TCP, not the default unix-socket connection.
# The official image's two-phase startup only ever binds the *temp* init instance to the unix
# socket (never TCP); the real, final instance binds both. A unix-socket check (this script's
# previous approach) succeeds during the temp phase too, which raced this script's own custom
# ALTER USER against /docker-entrypoint-initdb.d/01-create-test-db.sql's own
# `ALTER USER postgres WITH PASSWORD ... LOGIN` — two concurrent ALTER USER statements on the
# same pg_authid row, one of which fails with "tuple concurrently updated" and aborts the whole
# official entrypoint (a fatal error in an init script kills the container). Waiting on TCP
# instead structurally can't observe the temp phase at all, so this race can't happen — this is
# a real fix, not just tolerating the race with more retries (which the previous version of this
# script tried and didn't fully close, since exiting the retry loop and starting the next step
# is still not synchronized with the init script's own completion).
retry pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1

# Ensure the postgres role can log in — idempotent, safe to run every startup. Back to the
# unix-socket connection (peer-auth as the `postgres` OS user, bypassing any LOGIN/password
# check entirely) now that the TCP wait above guarantees we're talking to the real instance, not
# the temp one — the actual fix was making the *wait* TCP-specific, not this connection's own
# transport, and unix-socket peer auth is simpler/more reliable than depending on pg_hba.conf's
# host-connection trust rules (which this project doesn't control the exact contents of).
retry su -s /bin/sh postgres -c "psql -d template1 -c 'ALTER USER postgres WITH LOGIN'" >/dev/null 2>&1

# Create application database if it does not exist
if [ -n "$POSTGRES_APP_DB" ]; then
    retry su -s /bin/sh postgres -c \
        "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_APP_DB'\" | grep -q 1 \
         || psql -c 'CREATE DATABASE $POSTGRES_APP_DB'" >/dev/null 2>&1
fi

wait $PG_PID
