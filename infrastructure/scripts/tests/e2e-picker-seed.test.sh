#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/e2e-picker-seed.sh"
fail() { echo "FAIL: $1"; exit 1; }
expect() {
    local want=$1
    shift
    local got
    got=$(bash "$script" "$@")
    [ "$got" = "$want" ] || fail "args '$*': want $want, got $got"
}
expect 1 --project=manager-operator manager/acting
expect 1 --project=manager-operator --project=manager-manager
expect 1 --shard=1/2
expect 1
expect 0 --project=storefront storefront/cart
expect 0 --project=storefront-noauth
expect 0 --project=manager-noauth
expect 0 --project=visibility-manager
expect 0 --project=manager-operator --project=manager-portal-admin manager/catalog
expect 0 --grep @smoke --project=storefront-noauth --project=storefront
echo "e2e-picker-seed: ok"
