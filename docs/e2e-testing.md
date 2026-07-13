# E2E Testing Guide

Playwright tests are in `packages/e2e/storefront/` (storefront) and `packages/e2e/manager/`
(manager portal).

## Running

```bash
SERVER_URL=http://localhost:3000 \
  STOREFRONT_URL=http://localhost:5173 \
  MANAGER_URL=http://localhost:5174 \
  ERP_IMPORT_TOKEN=dev-token \
  pnpm --filter @mivend/e2e test
```

Requires a running dev stack (`make dev`) and seeded data. For manager portal tests, seed access
roles _before_ the ERP seed, since `seed-erp.mjs` skips creating manager-portal Administrators
for any role it can't find:

```bash
make seed-access-roles
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
via the real `reassignCounterpartyManager` mutation (logged in as `olga.depthead@mivend.dev`,
who has `ReassignCounterpartyManager` within her own department) — this is what makes
`manager-manager`'s `"own"` access scope see the same test data as `manager-operator`/
`manager-department-head`'s `"department"` scope. All three role projects run the exact same
spec files with no skips.

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

Vendure stores sessions in Redis. When the dev stack is reset (`make dev-reset` or `make dev-fresh`),
Redis is wiped. The stored cookies in `.auth/storefront-user.json` become invalid immediately.
Tests that rely on auth will fail silently — the page loads but the user is not logged in.

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
