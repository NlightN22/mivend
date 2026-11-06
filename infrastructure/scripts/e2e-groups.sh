#!/usr/bin/env bash
# Runs registry groups one after another on the current e2e stack (the caller holds the lock and the stack env).
set -u
here=$(dirname "$0")
snap=$(mktemp)
trap 'rm -f "$snap" "$snap.diff"' EXIT
failed=""
# global-setup writes the baseline right after seeding, so the first group is compared with the seeded state.
export E2E_LEAK_SNAPSHOT=$snap
for g in "$@"; do
    args=$(bash "$here/e2e-group.sh" dev "$g") || exit 1
    [ -s "$snap" ] && { bash "$here/e2e-leak.sh" snapshot "$snap" || exit 1; }
    echo "e2e group: $g"
    # shellcheck disable=SC2086
    bash "$here/e2e-playwright.sh" $args || failed="$failed $g"
    [ -s "$snap" ] || { echo "e2e leak: no baseline snapshot after group '$g'" >&2; exit 1; }
    bash "$here/e2e-leak.sh" check "$snap" "$g" || exit 1
done
if [ -n "$failed" ]; then
    echo "e2e groups failed:$failed"
    exit 1
fi
