#!/usr/bin/env bash
# Prints the hottest statements from pg_stat_statements (read-only). Needs the extension, see docs/deployment.md.
# Default target is the production compose postgres; for another database set PSQL, e.g.
#   PSQL="docker exec -i <postgres-container> psql -U <user> -d <db>" infrastructure/scripts/pg-hot-queries.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
if [ -z "${PSQL:-}" ]; then
    set -a
    . "$here/../docker/.env.production"
    set +a
    PSQL="docker compose --env-file $here/../docker/.env.production -f $here/../docker/docker-compose.yml exec -T postgres psql -U $POSTGRES_USER -d $POSTGRES_DB"
fi

# shellcheck disable=SC2086
$PSQL -v ON_ERROR_STOP=1 < "$here/pg-hot-queries.sql"
