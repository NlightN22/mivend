#!/usr/bin/env bash
# One Playwright run on the current e2e stack in two passes: @read-only tests on E2E_PARALLEL_WORKERS workers, the rest on one.
set -u
export E2E_PICKER_SEED=${E2E_PICKER_SEED:-$(bash "$(dirname "$0")/e2e-picker-seed.sh" "$@")}
workers=${E2E_PARALLEL_WORKERS:-3}
total=$(pnpm --filter @mivend/e2e test "$@" --list 2>/dev/null | sed -n 's/^Total: \([0-9]*\) test.*/\1/p')
[ "${total:-0}" -gt 0 ] || { echo "e2e: no test matches: $*" >&2; exit 1; }
json=${PLAYWRIGHT_JSON_OUTPUT_NAME:-}
status=0
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/read-only PLAYWRIGHT_JSON_OUTPUT_NAME=${json:+read-only-$json} \
    pnpm --filter @mivend/e2e test "$@" --grep @read-only --workers="$workers" --output=test-results-read-only \
    --pass-with-no-tests || status=1
pnpm --filter @mivend/e2e test "$@" --grep-invert @read-only --workers=1 --pass-with-no-tests || status=1
exit $status
