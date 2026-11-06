#!/usr/bin/env bash
# Data a spec must not leave behind: snapshot <file> before a group, check <file> <group> after it (only increases count).
set -euo pipefail
snapshot() {
    docker exec docker-postgres-central-1 psql -U postgres -d "$E2E_DB_NAME" -tA -c "
        SELECT 'active reservations: ' || count(*) FROM reservation WHERE status = 'active'
        UNION ALL
        SELECT 'orders in ' || state || ': ' || count(*) FROM \"order\"
        WHERE state NOT IN ('Cancelled', 'AddingItems', 'ArrangingPayment', 'Draft') GROUP BY state
        ORDER BY 1"
}
case "$1" in
snapshot) snapshot > "$2" ;;
check)
    snapshot | awk -F': ' 'NR == FNR { before[$1] = $2; next } $2 > before[$1] + 0 { print $1 ": " before[$1] + 0 " -> " $2 }' "$2" - > "$2.diff"
    if [ -s "$2.diff" ]; then
        echo "e2e leak: group '$3' left more data behind than it found:" >&2
        cat "$2.diff" >&2
        exit 1
    fi
    ;;
*) echo "usage: e2e-leak.sh snapshot|check <file> [group]" >&2; exit 2 ;;
esac
