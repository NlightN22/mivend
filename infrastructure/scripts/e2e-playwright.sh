#!/usr/bin/env bash
# One Playwright run on the current e2e stack in two passes: @read-only tests on E2E_PARALLEL_WORKERS workers, the rest on one.
set -u
workers=${E2E_PARALLEL_WORKERS:-3}
status=0
pnpm --filter @mivend/e2e test "$@" --grep @read-only --workers="$workers" --output=test-results-read-only \
    --pass-with-no-tests || status=1
pnpm --filter @mivend/e2e test "$@" --grep-invert @read-only --workers=1 --pass-with-no-tests || status=1
exit $status
