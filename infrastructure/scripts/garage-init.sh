#!/usr/bin/env bash
# Idempotent: assigns the single-node layout, then creates the bucket and key for one contour.
# Usage: garage-init.sh <bucket> <access-key-id GK + 24 hex> <secret 64 hex>
set -euo pipefail
BUCKET="$1"; KEY_ID="$2"; SECRET="$3"
G="docker exec docker-garage-1 /garage"

NODE_ID=$($G node id -q | cut -d@ -f1)
if $G status | grep -q "NO ROLE ASSIGNED"; then
    VERSION=$($G layout show | grep -oP 'layout version: \K[0-9]+')
    $G layout assign -z dc1 -c 1G "$NODE_ID"
    $G layout apply --version "$((VERSION + 1))"
fi
$G bucket info "$BUCKET" >/dev/null 2>&1 || $G bucket create "$BUCKET"
$G key info "$KEY_ID" >/dev/null 2>&1 || $G key import --yes -n "$BUCKET" "$KEY_ID" "$SECRET"
$G bucket allow --read --write --owner "$BUCKET" --key "$KEY_ID"
