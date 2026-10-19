---
name: e2e-integration
description: Use when asked to write, extend or fix end-to-end tests for the staging-integration contour (make e2e-integration, packages/e2e/integration/). Rules for what such tests may create, how groups are split into numbered spec files, which data to ask sp.auditor for, and the plan, run, screenshot and audit order.
---

# e2e-integration: Playwright suite for the staging-integration contour

Scope is only `make e2e-integration` (`packages/e2e/integration/`, config `playwright.integration.config.ts`).
The local contour (`make e2e`, `e2e-rules` skill) is a different suite; do not mix them or move scenarios there
unless the owner asks. Read `docs/e2e-testing.md` ("Staging-integration order exchange suite"),
`docs/environments.md` and `test-design` first.

## Rules

- Never run it in CI or from `make test`/`make test-int`; it is manual, one worker, no retries.
- **Reads** go through `integration/contour-db.ts` (`select`, read-only by construction) or the product API/UI.
- **Writes only through the product** (UI or API, as the user would), never SQL inserts. Prefer entities that
  consume neither stock nor limits (discount grants, approval requests). Entities that do consume them (orders,
  reservations) are allowed, but say so in the plan and release them in teardown (`run-state`, `run-cleanup.ts`).
  An exception that cannot be released needs the owner's explicit agreement first.
- Every entity a spec creates gets a per-run suffix, is recorded in the run state and removed or closed in
  `afterAll`/teardown even when the spec fails; a cleanup failure fails the run.
- Missing ERP-owned data (counterparties, prices, products) is requested from the `sp.auditor` session
  (SendMessage), not invented and not inserted.
- ERP waits use `erp-wait.ts` helpers with the shared timeouts (`timeouts.ts`), never fixed sleeps.
- Logins come from `contour-env.ts` (`STAGING_TEST_*` in the staging env file); never print or commit secrets.
  A new role gets its own `storageState` next to `customer-session.ts`.

## Structure

- One theme per numbered file: `NN-<theme>.spec.ts`, ordered so read-only groups run before order-placing ones.
  Do not append unrelated scenarios to an existing file; shared steps go to a helper file (under ~200 lines).
- Positive and negative cases of one rule live in the same group; check the API response, not only the UI
  (hidden in the UI is not the same as denied by the API).
- Subset run: `make e2e-integration E2E_ARGS="05-price-types"`.

## Procedure

1. `test-design` plan (invariants, scope, positive/negative, data needed, what stays uncovered).
2. List data gaps, ask `sp.auditor` for what the ERP must provide.
3. Implement the group; keep files small.
4. Run only the new group; take screenshots yourself (`check-page`/Playwright), send them to the user.
5. Update `docs/e2e-testing.md` for the new group, commit, push, send to the `mivend.audit` session.
