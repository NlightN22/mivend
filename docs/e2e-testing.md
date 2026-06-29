# E2E Testing Guide

Playwright tests are in `packages/e2e/storefront/`.

## Running

```bash
SERVER_URL=http://localhost:3000 \
  STOREFRONT_URL=http://localhost:5173 \
  ERP_IMPORT_TOKEN=dev-token \
  pnpm --filter @mivend/e2e test
```

Requires a running dev stack (`make dev`) and seeded data (`make seed`).

Auth state is stored in `packages/e2e/.auth/storefront-user.json` (gitignored).
Delete this file if tests fail with auth errors after a server restart — Playwright recreates it via `global-setup`.

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
await page.request.post('http://localhost:3000/shop-api', {
    data: { query: 'mutation { removeAllOrderLines { __typename } }' },
    headers: { 'Content-Type': 'application/json' },
});
```

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
