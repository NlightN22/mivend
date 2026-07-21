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

# Wait until postgres accepts connections via unix socket (as OS user, bypasses role LOGIN check)
retry su -s /bin/sh postgres -c "psql -d template1 -c 'SELECT 1'" >/dev/null 2>&1

# Ensure the postgres role can log in — idempotent, safe to run every startup. Retried like every
# other step here: a transient failure (e.g. the temp init instance shutting down between the
# wait above and this command) must not kill the whole container.
retry su -s /bin/sh postgres -c "psql -d template1 -c 'ALTER USER postgres WITH LOGIN'" >/dev/null 2>&1

# Create application database if it does not exist
if [ -n "$POSTGRES_APP_DB" ]; then
    retry su -s /bin/sh postgres -c \
        "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_APP_DB'\" | grep -q 1 \
         || psql -c 'CREATE DATABASE $POSTGRES_APP_DB'" >/dev/null 2>&1
fi

wait $PG_PID
