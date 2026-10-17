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

## Manager portal role projects

`playwright.config.ts` defines one project per manager-portal role under test —
`manager-operator`, `manager-manager`, `manager-department-head` — all running the same spec
files in `packages/e2e/manager/`, pre-authenticated as the corresponding seeded account from
`.tests/accounts.md`. A spec that asserts role-specific UI (e.g. which dashboard KPI cards are
visible) reads `testInfo.project.name` to know which role it's running as — see
`packages/e2e/manager/dashboard/dashboard.spec.ts` for the pattern. Keep the expectations there in
sync with `packages/manager/src/api/dashboard-config.ts` whenever that config changes.

Coverage so far: `manager/dashboard/`, `manager/orders/` (list + detail, including reservation
confirm/release), `manager/customers/` (list, CSV export, row navigation). All of them read a
single deterministic order created by `global-setup.ts` (`createConfirmedOrder`, see
`helpers/manager-order.ts`) and written to `.auth/e2e-order.json` (read via
`helpers/e2e-order.ts`) — this avoids depending on whatever orders already happen to exist in the
dev DB, which is not deterministic (real usage, other test runs, manual QA all leave orders
behind).

`global-setup.ts` also assigns the e2e counterparty (`e2e-cnt-001`) to `petr.manager@mivend.dev`
via the real `reassignCounterpartyManager` mutation (logged in as `anna.portaladmin@mivend.dev`:
since Vendure 3.7.3 a department head cannot read other administrators, so her own reassignment
is refused), and sets both e2e counterparties' `branchId` to the central `Branch.id` through
`upsertCounterparty` (erp-import never writes it) — this is what makes
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
