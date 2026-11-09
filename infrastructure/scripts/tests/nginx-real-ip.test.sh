#!/usr/bin/env bash
# Renders each portal nginx template, runs a throwaway nginx and checks that rate-limit buckets are per real client.
set -euo pipefail
root="$(cd "$(dirname "$0")/../../.." && pwd)"
command -v nginx >/dev/null || { echo "FAIL: nginx binary is required"; exit 1; }
work="$(mktemp -d)"
pid=
cleanup() { [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT
fail() { echo "FAIL: $1"; exit 1; }

port=18999
vars='${API_TARGET} ${LISTEN_PORT} ${SITE_NAME} ${SITE_FAVICON_URL} ${MANAGER_PUBLIC_URL} ${TRUSTED_PROXY_CIDR}'
code() { curl -s -o /dev/null -w '%{http_code}' -H "X-Real-IP: $1" "http://127.0.0.1:$port$2"; }
burst() { curl -s -o /dev/null -w '%{http_code}\n' -H "X-Real-IP: $1" "http://127.0.0.1:$port$2&n=[1-300]" | grep -c 429 || true; }

start() {
    local tpl=$1 cidr=$2
    API_TARGET=http://127.0.0.1:1 LISTEN_PORT=$port SITE_NAME=Shop SITE_FAVICON_URL=/f.svg MANAGER_PUBLIC_URL= TRUSTED_PROXY_CIDR=$cidr \
        envsubst "$vars" <"$root/packages/$tpl/nginx.conf.template" >"$work/site.conf"
    printf 'pid %s/nginx.pid;\nerror_log %s/error.log;\nevents {}\nhttp {\n access_log off;\n include %s/site.conf;\n}\n' "$work" "$work" "$work" >"$work/nginx.conf"
    nginx -p "$work" -c "$work/nginx.conf" -g 'daemon off;' 2>>"$work/start.log" &
    pid=$!
    for _ in $(seq 50); do curl -s -o /dev/null "http://127.0.0.1:$port/" && return; sleep 0.1; done
    fail "$tpl: nginx did not start: $(cat "$work/start.log")"
}
stop() { kill "$pid"; wait "$pid" 2>/dev/null || true; pid=; }

check() {
    local tpl=$1 path=$2
    start "$tpl" 127.0.0.0/8
    [ "$(burst 10.1.1.1 "$path")" -gt 0 ] || fail "$tpl: client A was never limited"
    [ "$(code 10.1.1.2 "$path")" != 429 ] || fail "$tpl: client B shares client A's bucket"
    stop
    start "$tpl" 203.0.113.0/24
    burst 10.1.1.1 "$path" >/dev/null
    [ "$(burst 10.1.1.2 "$path")" -gt 100 ] || fail "$tpl: X-Real-IP from an untrusted peer must be ignored"
    stop
}

check storefront '/shop-api?auth=1'
check manager '/admin-api?auth=1'
check dashboard '/admin-api?x=1'
echo "nginx-real-ip: ok"
