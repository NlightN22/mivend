---
name: e2e-rules
description: Use before writing, changing, fixing or reviewing any Playwright test in packages/e2e (storefront or manager portal), and before fixing a failing make e2e-dev run. Rules for seed data, keeping tests in step with the UI, idempotent cleanup of orders/reservations/sessions, running only your own specs, plus a mandatory checklist and a final audit of that checklist.
---

# e2e-rules: Playwright tests in packages/e2e

Read `docs/e2e-testing.md` (running, role projects, session teardown, gotchas) and
`test-design` first. This skill adds the rules that are not negotiable and the checklist that
closes every e2e change.

## 1. Data comes from `make seed`, never from a test-side shortcut

- A test that fails with "X not found" (counterparty, trading point, SKU, role, warehouse) means
  the local contour is missing seed data. Run `make seed` (or the matching `make seed-*` target)
  and re-run. Do not hardcode ids, do not create the record ad hoc in one spec.
- Data a test needs that no seed provides goes into the seed set (`erp-import` records /
  `seed-erp.mjs`, see `backend-plugin-rules`) or into `global-setup.ts`/`fixtures/` as an
  idempotent upsert used by every project — never into a single spec.
- Look records up by stable business keys (`erpId`, SKU, name), never by a database id
  (`/customers/2`, `fv=20`): ids differ between contours and reseeds.
- Only the local contour (`make dev`). Never staging-integration, never synthetic rows there.

## 2. Tests follow the interface, not the other way round

- When the UI changed on purpose (an issue redesigned the page, renamed a label, changed a number
  format), the test is what is wrong: update selectors and assertions to the current UI and name
  the issue in the commit message.
- Change product code only for a real defect (the API errors, data is wrong, a business rule is
  broken). Report it separately from the test drift; never weaken an assertion to hide it.
- A product decision (what the UI should do) is not made in a test fix — stop and ask.
- Selectors: roles/labels/visible text scoped to a region (`main`, a card, a table) over CSS
  classes; `exact` where a label is a prefix of another; no `networkidle` as a readiness signal —
  wait for the element/response that matters.
- Displayed formats (order number `100-0000447`, proforma `<order>-NN`) come from the shared
  formatter (`readE2eOrder().displayCode`), never re-implemented in the spec.

## 3. Every test is idempotent and cleans up after itself

The dev DB is shared and never reset between runs. A test must pass on its 1st and its 50th run,
and leave the contour as it found it.

- **Unique per run**: any external key the test sends (`erpOrderId`, document `erpId`, batch id)
  includes a per-run/per-order suffix; fixed values hit unique constraints on the rerun.
- **Orders**: an order a test places is cancelled (or otherwise finished) in `afterEach`/
  `afterAll` via the API, so its **reservations are released**. A test that relies on stock must
  not depend on earlier runs having cleaned up — assert availability first and fail clearly.
- **Cart**: clear the cart before a test that builds one (`clearCart`), not only after.
- **Proforma invoices, payments, documents** created by a test are closed/paid/cancelled by that
  test or its helper, never left open for the next run to trip over.
- **Sessions**: log in through `adminTokenFor` / the storefront auth helpers and send the e2e
  user agent; new login accounts are added to `global-teardown.ts`'s list.
- **Shared fixtures** (`global-setup.ts`) are upserts: running setup twice changes nothing.
- Cleanup runs even when the test fails (hooks, `try/finally`), and a cleanup failure fails the
  run loudly — never swallow it.

## 4. Run only your own specs

- A full `make e2e-dev` takes over an hour. While fixing, run one spec file and one project:
  `make e2e-dev E2E_ARGS="<path/to/file.spec.ts> --project=<name>"`.
- Before starting, check no other `playwright test` is running (`ps -eo args | grep "playwright test"`
  — not `pgrep -f`, which matches itself). Never run in parallel with another agent.
- Do not restart the contour or reseed while someone else's run is active.
- Final verification of a change is scoped, not the full suite: run in batches only the spec
  groups the change touches (a directory such as `storefront/orders` or `manager/customers`, with
  the affected projects), one batch at a time under the shared lock. The full `make e2e-dev` is run
  only on an explicit request, when no other session is editing plugin sources.
- Serialise every run on one lock so runs from different agents never overlap:
  `flock /tmp/mivend-e2e.lock make e2e-dev E2E_ARGS="<dir-or-file> --project=<name>"`.
- Another session editing plugin sources restarts the dev server; "fetch failed" mid-run is a
  restart, re-run that batch.

## 5. Checklist (fill in before committing)

Copy into your report and tick every item, or write why it does not apply.

- [ ] Every "not found" failure was resolved by `make seed` / seed or fixture change, not a hardcoded id.
- [ ] No database ids in selectors, URLs or lookups; records found by business key.
- [ ] Each changed assertion matches the current, intended UI; the issue that changed it is named.
- [ ] Product defects found are fixed in product code (with a test at the right level) or reported — none hidden by a weakened test.
- [ ] Open product decisions are listed for the user, not decided in the test.
- [ ] Every external key the test sends is unique per run.
- [ ] Orders placed are cancelled/finished in hooks; their reservations are released.
- [ ] Carts, proforma invoices, payments, documents created by the test are cleaned up.
- [ ] New login accounts are in `global-teardown.ts`; logins use the e2e user agent.
- [ ] `global-setup.ts`/fixture changes are idempotent upserts.
- [ ] The spec passes twice in a row on the same contour (proves idempotency).
- [ ] Only own specs were run, one at a time, with an explicit `--project`.
- [ ] `make lint` passes; commits stage explicit paths, hooks on, no push.

## 6. Final stage: audit the checklist

Before reporting done, audit your own checklist against the diff — not from memory:

1. `git diff <base>..HEAD -- packages/e2e` and read every changed spec/helper.
2. For each ticked item, point to the line that satisfies it (hook, unique suffix, cleanup call,
   seed change). An item without evidence is unticked.
3. Grep the diff for red flags: numeric ids in URLs/filters, fixed `erpOrderId`/`erpId` literals,
   `networkidle`, `waitForTimeout`, `.catch(() => {})`, `test.skip` added without a reason.
4. Re-run each changed spec a second time; any new order/reservation left behind fails the audit.
5. Report: the filled checklist, the audit result per item, product defects, open decisions.

If any item fails the audit, fix it and repeat; the change is not done until the audit passes.
