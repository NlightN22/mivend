#!/usr/bin/env bash
# Clears one account's second factor so it can enrol again (docs/two-factor.md "Operational reset").
# Usage: infrastructure/scripts/two-factor-reset.sh <account email> <reason>
# Run from the repository root on the host of the compose stack; the server container holds the database settings.
set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <account email> <reason, free text for the audit log>" >&2
    exit 2
fi

exec docker compose -f infrastructure/docker/docker-compose.yml \
    --env-file infrastructure/docker/.env.production \
    exec server node dist/two-factor-reset.cli.js "$@"
