# E2E Testing Guide

Playwright tests are in `packages/e2e/storefront/` (storefront) and `packages/e2e/manager/`
(manager portal).

Rules, checklist and the final checklist audit for every e2e change: the `e2e-rules` skill
(`.claude/skills/e2e-rules/SKILL.md`).

## Running

```bash
SERVER_URL=http://localhost:3000 \
  STOREFRONT_URL=http://localhost:5173 \
  MANAGER_URL=http://localhost:5174 \
  ERP_IMPORT_TOKEN=dev-import-token-change-me-0000 \
  ERP_CALLBACK_API_KEY=dev-callback-key-change-me-0000 \
  pnpm --filter @mivend/e2e test
```

Requires a running dev stack (`make dev`) and seeded data. Manager-portal roles self-provision
at server boot (issue #134, `RoleProvisioningService`), so by the time the server is up
`seed-erp.mjs` can already find them when creating manager-portal Administrators:

```bash
make seed
```

Auth state is stored in `packages/e2e/.auth/storefront-user.json` and
`packages/e2e/.auth/manager-{operator,manager,departmentHead}.json` (all gitignored).
Delete these files if tests fail with auth errors after a server restart — Playwright recreates
them via `global-setup`.

## Staging-integration order exchange suite (`make e2e-integration`, #255)

Manual only, never in `make e2e`/CI: `packages/e2e/integration/` with its own
`playwright.integration.config.ts`. Needs a running `make dev-staging-integration`; reads URLs,
the test customer (`STAGING_TEST_CUSTOMER_*`), the superadmin and the optional manager login
(`STAGING_TEST_MANAGER_*`) from `apps/server/.env.central.staging-integration`. It builds a mixed
cart from the live catalog, checks out and cancels in the UI, and checks the contour DB with
read-only SELECTs (`docker exec ... psql`, `default_transaction_read_only`). Scenarios: placement
(RESERVED, one `order.confirmed`), ERP registration, repeated placement, registration quantities vs
local reservations, storefront and manager cancel, cancel before the outbox publishes (restarts the
contour with an unreachable schema registry and restores it), cleanup. The first ERP wait decides
for the run whether the exchange answers; ERP-dependent scenarios are skipped, not failed, when it
does not. Teardown restores the contour, cancels every order of the run (staff cancel) and ends its
sessions. A summary with skip reasons is printed at the end. Subset:
`make e2e-integration E2E_ARGS="01-placement"`.

Price type visibility groups (#235, `05`-`07`, read-only except `07`) need the optional test manager
(`STAGING_TEST_MANAGER_*`) and skip with a reason without it; the manager's allowed and hidden
types are derived from the contour DB (branch allow-list and default), never hardcoded. `05` visits
the manager portal and storefront pages, records every GraphQL response and greps text and JSON
for the confidential codes and for floor/purchase fields.
`06` calls the Admin API directly as the test manager (denied prices, floor, rules, registry) and as the superadmin
to prove the same data exists.
`07` creates discount grant requests (one in the portal for an allowed type, two as the superadmin for hidden and
confidential types after the manager's own attempts are denied), checks the registry, the approvals inbox and the
pages, and rejects them in `afterAll` and in teardown (found by run id and a per-run marker in the justification;
rejected rows stay in the registry, they consume nothing). It skips when the contour has no approval workflow for
discount grants (`workflow_definition` is empty on a fresh staging DB; the staging contour has it registered once by hand with `upsertWorkflowDefinition`, one step, and it is kept). The allowed type is the first allowed
type that is not the branch default; the hidden-type tests skip with a reason when the contour has no hidden customer
type or no confidential type. `05`-`07` also skip loudly when the manager has no allowed or no hidden type, so a
denial claim is never vacuous. A failed grant cleanup logs the first GraphQL error.

Counterparty visibility groups (#262, `08`-`11`) check who sees which counterparty on the contour, against the branch scope of
`docs/access-control.md`. Fixed actors by role (`manager` own-scope per branch, `department-head` per branch, `operator`,
a central `general-director`) and fixed fixture counterparties (two per branch, one without a branch, two permanently
inactive) are a standing baseline: the ERP ids and logins are read from the staging-integration env file
(`STAGING_FIXTURE_*_ERPIDS`, `STAGING_TEST_{HEAD_A,OPERATOR_A,HEAD_B,MANAGER_B,DIRECTOR}_*`, `STAGING_TEST_CUSTOMER_B_*`) and
never committed. Expected sets are computed from the contour data (own, team rows, active grants, branch), never hardcoded.
`08` calls the Admin API as each actor (list total, summary, by id, by search), `09` opens the manager portal (list size, KPI,
search, detail page, CSV export, no hidden row in any GraphQL response), `10` checks write denials and a branch move
(rows a spec changes are restored in `finally`), `11` calls the Shop API as a customer of each branch, `12` checks a visibility grant (#123): a head sees the clients of a manager of another branch while the grant is active, the grant is revoked in `finally`, and a head with only the grant permission cannot grant to themselves or to someone outside their team. Every "hidden" claim is
paired with proof that the superadmin sees the row, and the groups skip with a reason when a login or fixture list is missing.
Roles without `ReassignCounterpartyManager` are refused by permission, not by scope; the scope refusal is tested with the
roles that hold it.

Order visibility (#263 stage 1, `13`, read-only) takes one real placed order per counterparty branch (and one
without a branch) and checks, for every actor, `order(id)`, the `orders` list and, for hidden orders,
`orderReservations` and `addNoteToOrder` against the read-time branch rule of `docs/access-control.md`. A hidden order
answers exactly like a missing id. `14` sets a servicing branch override on the point of a real order through
`updateTradingPointDetails`, checks the order moves to that branch's head and away from the home one, and removes the
override in `finally`.

## Manager portal role projects

`playwright.config.ts` defines one project per manager-portal role under test —
`manager-operator`, `manager-manager`, `manager-department-head` — all running the same spec
files in `packages/e2e/manager/`, pre-authenticated as the corresponding seeded account from
`.tests/accounts.md`. A spec that asserts role-specific UI (e.g. which dashboard KPI cards are
visible) reads `testInfo.project.name` to know which role it's running as — see
`packages/e2e/manager/dashboard/dashboard.spec.ts` for the pattern. Keep the expectations there in
sync with `packages/manager/src/api/dashboard-config.ts` whenever that config changes.

Coverage so far: `manager/dashboard/`, `manager/orders/` (list + detail, including reservation
confirm/release), `manager/customers/` (list, CSV export, row navigation), and `manager/customers/counterparty-inn.spec.ts` (#225 inn guard: seeded twin/missing-inn counterparties from `fixtures/seed-inn.ts` through `erp-import`, `manager-portal-admin` only). All of them read a
single deterministic order created by `global-setup.ts` (`createConfirmedOrder`, see
`helpers/manager-order.ts`) and written to `.auth/e2e-order.json` (read via
`helpers/e2e-order.ts`) — this avoids depending on whatever orders already happen to exist in the
dev DB, which is not deterministic (real usage, other test runs, manual QA all leave orders
behind).

`global-setup.ts` also assigns the e2e counterparty (`e2e-cnt-001`) to `petr.manager@mivend.dev`
via the real `reassignCounterpartyManager` mutation (logged in as `anna.portaladmin@mivend.dev`:
since Vendure 3.7.3 a department head cannot read other administrators, so her own reassignment
is refused), and relies on `make seed`'s `departmentBranch` mapping (`dept-sales` to the central branch): both e2e
counterparties carry `departmentId: 'dept-sales'` and get their branch from `BranchAssignmentService` (#65) — this is what makes
`manager-manager`'s `"own"` access scope see the same test data as `manager-operator`/
`manager-department-head`'s `"department"` scope. All three role projects run the exact same
spec files with no skips.

## Sessions opened by a run are ended in teardown

Every login (UI or API) opens a server session. `global-setup.ts` records the run start;
`global-teardown.ts` logs in as each test account, ends the sessions created since then whose user
agent carries the `mivend-e2e` marker (`helpers/user-agent.ts`), and fails the run if one stays
active (issue #231). A developer's own browser session is never touched. Rules for new specs:

- Browser specs reuse the `storageState` session. Admin API calls take their token from
  `adminTokenFor()` (`helpers/api-tokens.ts`): one session per account for the whole run, re-logged
  in only if it was ended. Only specs that test login or ending sessions log in themselves.
- A spec that logs in as an account not listed in `global-teardown.ts`'s `ACCOUNTS` adds it there.
- A browser context created inside a spec (`browser.newContext`) or a raw `fetch` login passes the
  marked user agent (`E2E_BROWSER_USER_AGENT` / `E2E_API_USER_AGENT`), or its session is missed.
- The server caps active sessions per user (`SESSION_MAX_ACTIVE_PER_USER`, default 20): more than
  ~20 logins of one account inside a run would end the oldest, i.e. the stored `storageState` one.

## Checkout and credit limits, proformas per organization

Two UI + API sets under `packages/e2e/storefront/`, both run in the `storefront` project with an
empty storage state (each test logs in as a seeded buyer through the Shop API):

- `checkout-credit/` - the real checkout page and API assertions for cash / bank transfer / card within
  the limit (credit-limited and prepayment buyer), over the limit with the branch's `credit.limit`
  checkout policy warn/hold and the acknowledgement, a card payment of excess + total, and negative
  paths (bypass without acknowledgement, stale card amount, unknown method, `confirmPaymentReceived`).
- `proforma-organizations/` - one proforma per organization, `<order>-NN` numbering and sum, idempotent
  on-demand request, versioning after `modifyOrder` (v2 badge, superseded notice, disabled pay), customer
  isolation, and the PDF content (pdf.js from cdnjs, text extraction in a blank page).

Prerequisites: `make seed` (run id v12 gives `credit-limited@buyer.example` and `prepay@buyer.example` their
contracts with a seeded organization, otherwise the contract guard blocks checkout). The PDF tests need
the worker process (the `generate-document` job; `make dev` starts it with the rest of the stack): on CI
(`CI` set) a missing worker fails them, locally they skip with a visible reason. Per-test budgets live in
`packages/e2e/timeouts.ts`. The seeded organization for the checkout buyers' contracts depends on the seed run
id (bumped in `infrastructure/scripts/seed-erp.mjs`, commit 618311d9): after pulling a bump, re-run `make seed`. The tests release the buyers'
reservations and cancel their orders before and after each test; `over-limit` raises the stock of three
SKUs through an ERP-import stock record and restores the branch setting afterwards.

## Gotchas learned from experience

### 1. IntersectionObserver auto-loadMore makes row counts non-deterministic

`ProductListView` uses `IntersectionObserver` to trigger `loadMore` automatically when the sentinel
element enters the viewport. After `waitForLoadState('networkidle')`, the observer may or may not
have fired an extra load. This means the total row count is unstable (24 or 48).

**Rule:** never assert an absolute product count. Compare relatively:

```typescript
// BAD
expect(countAfter).toBe(countBefore);

// GOOD
expect(countAfter).toBeGreaterThanOrEqual(countFiltered);
```

If you must assert an exact count, disable auto-loadMore in the component or scroll to a specific
position first to control when the observer fires.

### 2. Cart state persists across test sessions

Vendure's active order (cart) is tied to the session cookie, which is reused across runs.
If a previous run added items to the cart, the next run sees `cartQty > 0` on all products —
"Add" buttons are replaced by `−/+` steppers and tests that look for "Add" will time out.

**Rule:** any test that depends on cart state must clear it first:

```typescript
const base = process.env.STOREFRONT_URL ?? 'http://localhost:5173';
await page.request.post(`${base}/shop-api`, {
    data: { query: 'mutation { removeAllOrderLines { __typename } }' },
    headers: { 'Content-Type': 'application/json' },
});
```

> **Why the storefront URL, not the backend directly?**
> `page.request` sends the browser's session cookie. That cookie was obtained via the storefront
> proxy (`localhost:5173`), so browsers scope it to that origin. Calling `localhost:3000` directly
> bypasses the proxy and the request arrives without a session, clearing a different (anonymous)
> cart instead of the test user's cart.

### 3. Stale auth cookies after server restart

Vendure stores sessions in Postgres (the `session` table; no Redis in this project since issue
#128). When the dev stack is reset (`make dev-reset` or `make dev-fresh`), the database is wiped.
The stored cookies in `.auth/storefront-user.json` become invalid immediately. Tests that rely on
auth will fail silently — the page loads but the user is not logged in.

**Fix:** delete `.auth/storefront-user.json` before the next test run. Playwright's `global-setup`
will re-login and write a fresh file.

### 4. `inStock: null` crashes Elasticsearch

The `search` query accepts `inStock: Boolean`. Passing `null` causes a 400 from ES.
`JSON.stringify` keeps `null` but removes `undefined`.

**Rule:** use `undefined` when the filter is inactive, never `null`:

```typescript
inStock: filters?.value.inStock ? true : undefined;
```

### 5. `waitForLoadState('networkidle')` is not sufficient after filter changes

After toggling a filter, the composable fires a new `search` request. `networkidle` waits for no
in-flight requests, but the Vue reactivity update (DOM re-render) may happen a tick later.

**Rule:** after a filter action, wait for a product element to be visible before counting:

```typescript
await page.waitForLoadState('networkidle');
await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
```

### 6. Auth state is shared across parallel tests in the same worker

Tests in the `storefront` project use `storageState: '.auth/storefront-user.json'`. All tests
share this cookie. Mutations that change server-side state (cart, orders) affect subsequent tests
in the same run. Use `beforeEach` cleanup or test isolation where needed.

### 7. A UI-driven cart mutation can rotate the session cookie out from under every later test

`storageState: '.auth/storefront-user.json'` (gotcha #6) is a **static snapshot**,
written once by `global-setup` and then reloaded unchanged into a fresh context for
every single test file. That's fine as long as every test talks to the server via
`page.request` (the `gql()` helper) — those calls don't touch that file.

But a test that mutates the cart through a **real UI interaction** (clicking "Add to
cart" on an actual page, as opposed to calling `addItemToOrder` via `gql()`) uses the
browser page's own live fetch/cookie jar. If that mutation causes the server to rotate
the session cookie (observed empirically: authenticated `addItemToOrder` through the
app's own client did this), Playwright's _live_ page cookie jar picks up the new value
transparently and the test itself still passes — but the static file on disk still has
the old, now-invalidated session ID. Every test file that runs afterward loads a fresh
context from that stale file, gets rejected/falls back to guest/no-price-type, and
price/discount assertions fail in ways that look like a product bug (raw
un-discounted prices, `activeCustomer: null`) even though nothing product-side is
actually broken.

This was diagnosed by elimination: increasing wait times before the UI interaction
made no difference (ruling out a timing race), but removing the offending test file
from the run immediately restored every other test to green.

**Rule:** any test that clicks a real UI control to mutate the cart/order (not just
`gql()`) must re-save the auth state at the end so later tests get the fresh cookie:

```typescript
await page
    .context()
    .storageState({ path: path.join(__dirname, '../../.auth/storefront-user.json') });
```

See `storefront/orders/add-to-cart-toast.spec.ts` for a working example.
