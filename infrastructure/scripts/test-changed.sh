#!/usr/bin/env bash
# Runs the unit, integration and access tests of the packages changed since $BASE and of the packages that depend on them.
# DRY=1 prints the plan only. A quick loop while working; the full make test / test-int / test-access stay required before audit and release.
set -euo pipefail

BASE="${BASE:-origin/main}"
LOCK=/tmp/mivend-test.lock
root="$(git rev-parse --show-toplevel)"
cd "$root"

git rev-parse --verify --quiet "$BASE" >/dev/null || { echo "test-changed: unknown base '$BASE' (set BASE=<ref>)"; exit 1; }

changed_json="$(pnpm ls -r --depth -1 --json --filter "...[$BASE]" 2>/dev/null)"
mapfile -t names < <(printf '%s' "$changed_json" | node -e '
const root = process.argv[1];
const pkgs = JSON.parse(require("fs").readFileSync(0, "utf8"));
for (const p of pkgs) if (p.path !== root) console.log(p.name);
' "$root")
root_changed="$(printf '%s' "$changed_json" | node -e '
const root = process.argv[1];
const pkgs = JSON.parse(require("fs").readFileSync(0, "utf8"));
console.log(pkgs.some(p => p.path === root) ? "yes" : "no");
' "$root")"

if [ "$root_changed" = "yes" ]; then
    echo "test-changed: a root file changed (configs, Makefile, root package.json or the like): unit tests run in full, integration in every package."
    names=()
    while IFS= read -r n; do names+=("$n"); done < <(pnpm ls -r --depth -1 --json | node -e '
const root = process.argv[1];
for (const p of JSON.parse(require("fs").readFileSync(0, "utf8"))) if (p.path !== root) console.log(p.name);
' "$root")
    unit_args=()
else
    unit_args=(--changed "$BASE")
fi

if [ "${#names[@]}" -eq 0 ] && [ "$root_changed" = "no" ]; then
    echo "test-changed: nothing changed since $BASE, nothing to run."
    exit 0
fi

mapfile -t int_pkgs < <(pnpm ls -r --depth -1 --json | node -e '
const fs = require("fs");
const wanted = new Set(process.argv.slice(1));
for (const p of JSON.parse(fs.readFileSync(0, "utf8"))) {
  if (!wanted.has(p.name)) continue;
  const scripts = JSON.parse(fs.readFileSync(p.path + "/package.json", "utf8")).scripts ?? {};
  if (scripts["test:integration"]) console.log(p.name);
}
' "${names[@]}")

run_access=no
for n in "${names[@]}"; do
    case "$n" in server|@mivend/plugin-*|@mivend/shared) run_access=yes ;; esac
done

echo "test-changed: base $BASE"
echo "  changed packages and dependents: ${names[*]:-none}"
echo "  unit: ${unit_args[*]:-all files}"
echo "  integration: ${int_pkgs[*]:-none}"
echo "  access matrix: $run_access"
[ "${DRY:-}" = 1 ] && exit 0

flock "$LOCK" pnpm exec vitest run "${unit_args[@]}" --passWithNoTests
if [ "${#int_pkgs[@]}" -gt 0 ]; then
    filters=()
    for n in "${int_pkgs[@]}"; do filters+=(--filter "$n"); done
    flock "$LOCK" pnpm "${filters[@]}" --no-bail test:integration
fi
if [ "$run_access" = yes ]; then
    pnpm build:plugins
    flock "$LOCK" pnpm --filter server test:access
fi
