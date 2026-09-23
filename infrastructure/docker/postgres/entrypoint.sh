#!/bin/sh
set -e

# Issue #140: locale is fixed at initdb time and can't be changed later — fail fast instead of
# silently defaulting to a locale that sorts Cyrillic wrong. See docs/environments.md.
if [ -z "$DB_ICU_LOCALE" ]; then
    echo "entrypoint.sh: DB_ICU_LOCALE must be set (e.g. ru-RU) — refusing to start with an" >&2
    echo "unspecified locale; see docs/environments.md" >&2
    exit 1
fi
export POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=$DB_ICU_LOCALE ${POSTGRES_INITDB_ARGS:-}"

# Start postgres in background using the official entrypoint
docker-entrypoint.sh postgres "$@" &
PG_PID=$!

# The official image's two-phase first init can drop a connection mid-command, so every step
# retries — see docs/testing-strategy.md's e2e-smoke debugging trail.
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

# TCP, not the unix socket: only the real instance binds TCP, the temp init one never does —
# avoids racing the init scripts' own ALTER USER ("tuple concurrently updated").
retry pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1

# Idempotent; unix-socket peer auth avoids depending on pg_hba.conf host rules.
retry su -s /bin/sh postgres -c "psql -d template1 -c 'ALTER USER postgres WITH LOGIN'" >/dev/null 2>&1

# Create application database if it does not exist
if [ -n "$POSTGRES_APP_DB" ]; then
    retry su -s /bin/sh postgres -c \
        "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_APP_DB'\" | grep -q 1 \
         || psql -c 'CREATE DATABASE $POSTGRES_APP_DB'" >/dev/null 2>&1
fi

wait $PG_PID
