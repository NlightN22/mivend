---
name: e2e-rules
description: Use before writing, changing, fixing or reviewing any Playwright test in packages/e2e (storefront or manager portal), and before fixing a failing make e2e-dev run. Rules for seed data, keeping tests in step with the UI, in-run cleanup of orders/reservations, running only your own specs, plus a mandatory checklist and a final audit of that checklist.
---

# e2e-rules: Playwright tests in packages/e2e

Read `docs/e2e-testing.md` (running, role projects, sessions, gotchas) and
`test-design` first. This skill adds the rules that are not negotiable and the checklist that
closes every e2e change.

## 1. Data comes from the e2e stack's seed, never from a test-side shortcut

Every `make e2e-*` run boots a throwaway stack on its own fresh database (#274, `docs/e2e-testing.md`
"Running"), seeded by `seed-erp.mjs` and `global-setup.ts`. `make dev` and its database are not involved.

- A test that fails with "X not found" (counterparty, trading point, SKU, role, warehouse) means
  the seed is missing it. Add it to the seed (below). Do not hardcode ids, do not create the record
  ad hoc in one spec.
- Data a test needs that no seed provides goes into the seed set (`erp-import` records /
  `seed-erp.mjs`, see `backend-plugin-rules`) or into `global-setup.ts`/`fixtures/`, used by every
  project — never into a single spec.
- Look records up by stable business keys (`erpId`, SKU, name), never by a database id
  (`/customers/2`, `fv=20`): ids depend on seed order and differ between contours.
- Never staging-integration, never synthetic rows there.

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

## 3. Every test leaves the run's data as it found it

The database is fresh per run, but all specs of a run share it and one storage state per project.
A test must pass in any order and alone.

- **Unique within the run**: an external key the test sends (`erpOrderId`, document `erpId`, batch id)
  includes a per-test/per-order suffix when another spec or a retry could send it too.
- **Orders**: an order a test places is cancelled (or otherwise finished) in `afterEach`/
  `afterAll` via the API, so its **reservations are released** for later specs. A test that relies
  on stock asserts availability first and fails clearly.
- **Cart**: clear the cart before a test that builds one (`clearCart`), not only after.
- **Proforma invoices, payments, documents** created by a test are closed/paid/cancelled by that
  test or its helper, never left open for a later spec to trip over.
- **Sessions**: log in through `adminTokenFor` / the storefront auth helpers and send the e2e
  user agent; stay under the per-user session cap (`docs/e2e-testing.md` "Sessions").
- Cleanup runs even when the test fails (hooks, `try/finally`), and a cleanup failure fails the
  run loudly — never swallow it.

## 4. Run only your own specs

- A full `make e2e-dev` takes over an hour. While fixing, run one spec file and one project:
  `make e2e-dev E2E_ARGS="<path/to/file.spec.ts> --project=<name>"`.
- Every e2e target takes `/tmp/mivend-e2e.lock` itself; a second run waits for the first.
- Final verification of a change is scoped, not the full suite: run only the spec groups the
  change touches (a directory such as `storefront/orders` or `manager/customers`, with the affected
  projects). The full `make e2e-dev` is run only on an explicit request.
- The e2e server does not restart on source edits; changes to plugin sources need `make e2e-*` again.

## 5. Checklist (fill in before committing)

Copy into your report and tick every item, or write why it does not apply.

- [ ] Every "not found" failure was resolved by a seed or fixture change, not a hardcoded id.
- [ ] No database ids in selectors, URLs or lookups; records found by business key.
- [ ] Each changed assertion matches the current, intended UI; the issue that changed it is named.
- [ ] Product defects found are fixed in product code (with a test at the right level) or reported — none hidden by a weakened test.
- [ ] Open product decisions are listed for the user, not decided in the test.
- [ ] Every external key another spec or a retry could also send is unique per test.
- [ ] Orders placed are cancelled/finished in hooks; their reservations are released.
- [ ] Carts, proforma invoices, payments, documents created by the test are cleaned up.
- [ ] Logins use the e2e user agent and token helpers.
- [ ] The spec passes alone and inside its whole group.
- [ ] Only own specs were run, one at a time, with an explicit `--project`.
- [ ] `make lint` passes; commits stage explicit paths, hooks on, no push.

## 6. Final stage: audit the checklist

Before reporting done, audit your own checklist against the diff — not from memory:

1. `git diff <base>..HEAD -- packages/e2e` and read every changed spec/helper.
2. For each ticked item, point to the line that satisfies it (hook, unique suffix, cleanup call,
   seed change). An item without evidence is unticked.
3. Grep the diff for red flags: numeric ids in URLs/filters, fixed `erpOrderId`/`erpId` literals,
   `networkidle`, `waitForTimeout`, `.catch(() => {})`, `test.skip` added without a reason.
4. Check each changed spec's hooks: an order/reservation it leaves for later specs fails the audit.
5. Report: the filled checklist, the audit result per item, product defects, open decisions.

If any item fails the audit, fix it and repeat; the change is not done until the audit passes.
