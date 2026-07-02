#!/bin/sh
set -e

# Start postgres in background using the official entrypoint
docker-entrypoint.sh postgres "$@" &
PG_PID=$!

# Wait until postgres accepts connections via unix socket (as OS user, bypasses role LOGIN check)
until su -s /bin/sh postgres -c "psql -d template1 -c 'SELECT 1'" > /dev/null 2>&1; do
    sleep 1
done

# Ensure the postgres role can log in — idempotent, safe to run every startup
su -s /bin/sh postgres -c "psql -d template1 -c 'ALTER USER postgres WITH LOGIN'"

# Create application database if it does not exist
if [ -n "$POSTGRES_APP_DB" ]; then
    su -s /bin/sh postgres -c \
        "psql -tc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_APP_DB'\" | grep -q 1 \
         || psql -c 'CREATE DATABASE $POSTGRES_APP_DB'"
fi

wait $PG_PID
