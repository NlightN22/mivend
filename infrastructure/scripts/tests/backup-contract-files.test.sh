#!/usr/bin/env bash
set -euo pipefail
script="$(cd "$(dirname "$0")/.." && pwd)/backup-contract-files.sh"
fail() { echo "FAIL: $1"; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/bin"
cat >"$work/bin/docker" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$DOCKER_LOG"
case "$1" in
    volume) [ "${VOLUME_MISSING:-}" = 1 ] && exit 1 || exit 0 ;;
    run) printf 'tar-bytes' ;;
esac
STUB
chmod +x "$work/bin/docker"
export PATH="$work/bin:$PATH" DOCKER_LOG="$work/log"

out=$(bash "$script" shop "$work/backups")
[ -s "$out" ] || fail "archive not written: $out"
case "$out" in "$work"/backups/contract-files-*.tgz) ;; *) fail "unexpected name $out" ;; esac
grep -q 'volume inspect shop_contract-files' "$work/log" || fail "volume not checked"
grep -q 'run --rm -v shop_contract-files:/v:ro' "$work/log" || fail "volume not mounted read-only"
[ -z "$(ls "$work/backups" | grep '\.tmp$' || true)" ] || fail "temp file left behind"

if VOLUME_MISSING=1 bash "$script" shop "$work/backups2" >/dev/null 2>&1; then
    fail "a missing volume must fail the backup"
fi
[ ! -e "$work/backups2" ] || fail "nothing is created when the volume is missing"
echo "backup-contract-files: ok"
