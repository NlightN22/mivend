#!/usr/bin/env bash
# Prints the hottest statements from pg_stat_statements (read-only). Needs the extension, see docs/deployment.md.
# Default target is the production compose postgres; for another database set PSQL, e.g.
#   PSQL="docker exec -i <postgres-container> psql -U <user> -d <db>" infrastructure/scripts/pg-hot-queries.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
if [ -z "${PSQL:-}" ]; then
    env_file="$here/../docker/.env.production"
    POSTGRES_USER="$(grep -m1 '^POSTGRES_USER=' "$env_file" | cut -d= -f2-)"
    POSTGRES_DB="$(grep -m1 '^POSTGRES_DB=' "$env_file" | cut -d= -f2-)"
    PSQL="docker compose --env-file $env_file -f $here/../docker/docker-compose.yml exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
fi

# shellcheck disable=SC2086
$PSQL -v ON_ERROR_STOP=1 < "$here/pg-hot-queries.sql"
