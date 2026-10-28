#!/usr/bin/env bash
set -euo pipefail
script="$(dirname "$0")/../../docker/nginx/15-site-identity.envsh"

fail() { echo "FAIL: $1"; exit 1; }
run() { (export SITE_FAVICON_DEFAULT=/default.svg "$@"; LC_ALL=C sh -c '. "$0"; printf "%s|%s" "$SITE_NAME" "$SITE_FAVICON_URL"' "$script" 2>/dev/null); }

[ "$(run SITE_NAME='Компонент-М')" = "Компонент-М|/default.svg" ] || fail "non-ASCII name is rejected"
[ "$(run SITE_NAME=Shop2 SITE_FAVICON_URL=/favicon.svg)" = "Shop2|/favicon.svg" ] || fail "valid values changed"
[ "$(run SITE_NAME='a"b')" = "Shop|/default.svg" ] || fail "quote not rejected"
[ "$(run SITE_NAME="$(printf 'a\nb')")" = "Shop|/default.svg" ] || fail "newline not rejected"
echo "site-identity-envsh: ok"
