#!/usr/bin/env bash
# Prints the e2e groups a diff touches. Usage: e2e-map.sh [base-ref] [head-ref]; base defaults to the last-green sha.
# Record a green run with: e2e-map.sh --green [sha]. Groups are rows of the docs/e2e-testing.md registry.
set -euo pipefail
JOURNAL="${E2E_GREEN_FILE:-$HOME/.mivend-e2e-last-green}"
if [ "${1:-}" = "--green" ]; then git rev-parse "${2:-HEAD}" >"$JOURNAL"; echo "last green: $(cat "$JOURNAL")"; exit 0; fi
BASE="${1:-$(cat "$JOURNAL" 2>/dev/null || echo origin/main)}"
HEAD_REF="${2:-HEAD}"
groups=""
add() { groups="$groups $*"; }
while IFS= read -r f; do
  case "$f" in
    packages/e2e/storefront/*/*) d="${f#packages/e2e/storefront/}"; add "$(grep -oE "^\| \`storefront-[a-z-]+\`.*storefront/${d%%/*}( |\`)" docs/e2e-testing.md | head -1 | grep -oE '`[^`]+`' | head -1 | tr -d '`')" ;;
    packages/e2e/manager/*/*) d="${f#packages/e2e/manager/}"; add "$(grep -oE "^\| \`manager-[a-z-]+\`.*manager/${d%%/*}( |\`)" docs/e2e-testing.md | head -1 | grep -oE '`[^`]+`' | head -1 | tr -d '`')" ;;
    packages/e2e/*|docs/*|*.md|.claude/*|.github/*) ;;
    packages/storefront/src/*) add smoke storefront-layout storefront-home storefront-catalog storefront-cart storefront-orders storefront-account ;;
    packages/manager/src/*) add manager-layout manager-orders manager-customers manager-settlements manager-settings manager-dashboard ;;
    packages/ui-kit/*) add smoke storefront-layout manager-layout ;;
    packages/plugins/access-control/*|packages/plugins/counterparty/*|packages/plugins/search/*) add visibility-storefront visibility-manager manager-customers ;;
    packages/plugins/reservation/*|packages/plugins/checkout*/*|packages/plugins/erp-order/*) add storefront-orders storefront-cart manager-orders ;;
    packages/plugins/settlement/*|packages/plugins/documents/*|packages/plugins/acquiring/*) add storefront-account storefront-documents storefront-proforma manager-settlements manager-proforma-payments ;;
    packages/plugins/price-entry/*|packages/plugins/discount*/*|packages/plugins/pricing*/*) add cart-totals storefront-catalog storefront-cart ;;
    packages/plugins/*|packages/shared/*|apps/server/*) add smoke visibility-storefront visibility-manager ;;
    Makefile|package.json|pnpm-lock.yaml|infrastructure/*) add smoke ;;
  esac
done < <(git diff --name-only "$BASE" "$HEAD_REF")
printf '%s\n' $groups | grep -v '^$' | sort -u | tr '\n' ' '; echo
