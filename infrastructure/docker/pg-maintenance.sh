#!/bin/sh
# Nightly database upkeep, run by crond in the pg-maintenance service (docs/deployment.md "Nightly maintenance").
set -u
log() { echo "$(date '+%F %T') pg-maintenance: $*"; }

log "VACUUM (ANALYZE) of every table"
vacuumdb --analyze --echo >/dev/null || log "VACUUM (ANALYZE) failed"

attempts="${MAINTENANCE_FULL_ATTEMPTS:-3}"
for table in $(echo "${MAINTENANCE_FULL_TABLES:-}" | tr ',' ' '); do
    n=1
    while :; do
        log "VACUUM FULL $table (attempt $n of $attempts)"
        PGOPTIONS="-c lock_timeout=${MAINTENANCE_LOCK_TIMEOUT:-10s}" vacuumdb --full --table "$table" && break
        [ "$n" -ge "$attempts" ] && { log "VACUUM FULL $table skipped after $attempts failed attempts"; break; }
        n=$((n + 1))
        sleep "${MAINTENANCE_FULL_RETRY_SECONDS:-60}"
    done
done
log "done"
