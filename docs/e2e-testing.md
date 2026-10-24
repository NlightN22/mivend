# E2E Testing Guide

Playwright tests are in `packages/e2e/storefront/` (storefront) and `packages/e2e/manager/`
(manager portal).

Rules, checklist and the final checklist audit for every e2e change: the `e2e-rules` skill
(`.claude/skills/e2e-rules/SKILL.md`).

## Running

```bash
make e2e-dev                                   # full suite, E2E_SHARDS (4) shards
make e2e-dev E2E_ARGS="storefront/orders --project=storefront"
make e2e-cart / make e2e-smoke / make e2e-ui / make e2e-resilience
```

Each target boots its own throwaway stack (#274, `apps/server/src/__tests__/e2e-stack/`): a database
`mivend_e2e_<timestamp>` with the numbering sequences, a RabbitMQ vhost and an Elasticsearch index prefix of the
same name, the server (`:3020`), both workers, and the storefront (`:5193`) and manager (`:5194`) as Vite dev
servers. It seeds the database with `infrastructure/scripts/seed-erp.mjs`, runs Playwright with
`SERVER_URL`/`STOREFRONT_URL`/`MANAGER_URL`/`E2E_DB_NAME` pointing at it, then stops everything and drops the
database, vhost and indices. Boot and seed take about 75 s. `make dev` does not need to run, and its database
(`mivend_central`) is never touched; `make seed` stays a dev-only command.

No single run may take longer than 30 minutes. The full suite takes about an hour in one Playwright run, so
`make e2e-dev` without `E2E_ARGS` runs it as `--shard=i/E2E_SHARDS`, each shard on its own fresh stack (15-20 min
each); a run with `E2E_ARGS` is one stack. Specs therefore never depend on data another spec leaves behind: what a
list or filter needs is seeded by `global-setup` (`fixtures/list-pages.ts` gives every manager list a second page).

The runner enforces the cap: it stops the test run when it exceeds `E2E_RUN_TIMEOUT_MIN` (30) or when the server,
a worker or a portal dies, and the run fails. The test command runs in its own process group, which teardown
kills with the stack's groups, so Playwright and Chrome never outlive the stack. SIGINT, SIGTERM and SIGHUP all go
through the same teardown.

`make e2e-resilience` runs `manager/resilience` on its own stack and SIGSTOPs that stack's server, found by its
`DB_NAME`; `make dev` is never frozen.

`skip-guard-reporter.ts` prints the skips by reason and fails the run when a skip's reason is not on its
allow-list (a spec that runs under one role project, or needs a permission only some roles hold). Missing data is
seeded, never skipped. The guard checks only the reason text, so a skip with an allowed reason must have a condition
on `testInfo.project.name` alone. `manager/resilience` is not part of the suite at all: `playwright.config.ts` ignores it unless
`E2E_RESILIENCE` is set.

Runs are serialised on `/tmp/mivend-e2e.lock`, held for the whole make target including every shard; `run.ts`
refuses to start without it, because its leftover sweep drops every `mivend_e2e_*` database. A second run waits. A run killed with SIGKILL leaves its processes,
database, vhost and indices behind; the next run removes them first. Server, worker and portal logs are in
`apps/server/.e2e-stack/`. Auth state in `packages/e2e/.auth/` is written by `global-setup` and removed at teardown.

## Staging-integration order exchange suite (`make e2e-integration`, #255)

Manual only, never in `make e2e-dev`/CI: `packages/e2e/integration/` with its own
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

**What stays here (#263).** This suite validates the real ERP exchange plus a few end-to-end
scenarios on real data: groups `01`-`04` only. The former visibility groups `05`-`22` were removed:
role x entity visibility matrices are integration tests in `make test-access`
(`apps/server/src/__tests__/access/`, see `docs/testing-strategy.md`), and the thin
see-own/cannot-see-other browser layer runs in `make e2e-dev` (below). Do not add visibility groups here.

## Visibility browser layer (#263)

`packages/e2e/visibility/` (projects `visibility-manager` and `visibility-storefront`) is the thin
see-own/cannot-see-other layer that replaces the browser parts of staging groups `05`-`22`.
Its seed runs only on the throwaway e2e database and must never run against staging-integration,
whose database is never seeded (`docs/environments.md`).
`global-setup.ts` seeds its data through erp-import and the Admin API (`fixtures/visibility/`): branches A/B, one actor per role and scope, clients `a-own`, `a-free`,
`a-point` (point serviced by branch B), `b-own`, `b-team` (manager-a observer), `none` (no branch),
a standing visibility grant, branch price type allow-lists, three pending discount grants and one
placed, paid order per customer. Run:
`make e2e-dev E2E_ARGS="visibility --project=visibility-manager --project=visibility-storefront"`.

## E2E groups registry

Canonical rules: `docs/testing-strategy.md` "E2E groups". Run one with `make e2e-group G=<name>` (suite `dev`) or
`make e2e-integration-group G=<name>` (suite `integration`); the table below is the only name-to-args mapping and is
read by `infrastructure/scripts/e2e-group.sh`. Add a row for every new folder or filename prefix.

| Group | Suite | Covers | Args |
| --- | --- | --- | --- |
| `storefront-auth` | dev | storefront login, trading-point selection (no stored session) | `--project=storefront-noauth` |
| `storefront-account` | dev | storefront account pages | `--project=storefront storefront/account` |
| `storefront-api` | dev | storefront REST/Swagger docs surface | `--project=storefront storefront/api` |
| `storefront-cart` | dev | cart behaviour | `--project=storefront storefront/cart` |
| `cart-totals` | dev | cart totals and discount invariants | `--project=storefront-cart-totals` |
| `storefront-catalog` | dev | catalog, search, filters, category tree, product card | `--project=storefront storefront/catalog` |
| `storefront-checkout-credit` | dev | checkout, credit limits | `--project=storefront storefront/checkout-credit` |
| `storefront-documents` | dev | customer documents | `--project=storefront storefront/documents` |
| `storefront-favorites` | dev | favorites | `--project=storefront storefront/favorites` |
| `storefront-home` | dev | home page | `--project=storefront storefront/home` |
| `storefront-orders` | dev | customer orders (placement, list, detail, cancel) | `--project=storefront storefront/orders` |
| `storefront-proforma` | dev | proforma invoices and per-organization proformas | `--project=storefront storefront/proforma-invoices storefront/proforma-organizations` |
| `storefront-session` | dev | session-ended bar | `--project=storefront storefront/session` |
| `manager-auth` | dev | manager login, password reset (no stored session) | `--project=manager-noauth` |
| `manager-catalog` | dev | manager category tree | `--project=manager-operator manager/catalog` |
| `manager-customers` | dev | customers, counterparties, history filters | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/customers` |
| `manager-dashboard` | dev | dashboard KPIs per role | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/dashboard` |
| `manager-discounts` | dev | discount grants | `--project=manager-operator manager/discounts` |
| `manager-layout` | dev | mobile nav, pagination scroll | `--project=manager-operator manager/layout` |
| `manager-orders` | dev | manager orders list, detail, delivery | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/orders` |
| `manager-proforma-payments` | dev | proforma invoices and payments smoke | `--project=manager-operator manager/proforma-invoices-payments` |
| `manager-settings` | dev | roles, users, security settings | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/settings` |
| `manager-resilience` | dev | recovery after transient failure (use make e2e-resilience) | `manager/resilience` |
| `visibility-storefront` | dev | own-data, price-type, category visibility (storefront) | `--project=visibility-storefront` |
| `visibility-manager` | dev | entity lists, counterparties, price types, servicing team, categories (manager) | `--project=visibility-manager` |
| `category-visibility` | dev | category visibility in both portals (#264) | `--project=visibility-storefront --project=visibility-manager categories` |
| `smoke` | dev | critical-route subset tagged @smoke (use make e2e-smoke) | `--grep @smoke --project=storefront-noauth --project=storefront` |
| `exchange-placement` | integration | order placement and ERP exchange | `01-placement` |
| `exchange-cancel` | integration | order cancel after publish | `02-cancel` |
| `exchange-cancel-before-publish` | integration | order cancel before publish | `03-cancel-before-publish` |
| `exchange-cleanup` | integration | run cleanup | `04-cleanup` |

`category-feed` (e2e-integration, #264) is added with that issue's spec.

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
`helpers/e2e-order.ts`), so specs never depend on orders other specs leave behind in the run.

`global-setup.ts` also assigns the e2e counterparty (`e2e-cnt-001`) to `petr.manager@mivend.dev`
via the real `reassignCounterpartyManager` mutation (logged in as `anna.portaladmin@mivend.dev`:
since Vendure 3.7.3 a department head cannot read other administrators, so her own reassignment
is refused), and relies on `seed-erp.mjs`'s `departmentBranch` mapping (`dept-sales` to the central branch): both e2e
counterparties carry `departmentId: 'dept-sales'` and get their branch from `BranchAssignmentService` (#65) — this is what makes
`manager-manager`'s `"own"` access scope see the same test data as `manager-operator`/
`manager-department-head`'s `"department"` scope. All three role projects run the exact same
spec files with no skips.

## Sessions

The database, and with it every session, is dropped after the run, so there is no session teardown.
Browser specs reuse the `storageState` session; Admin API calls take their token from `adminTokenFor()`
(`helpers/api-tokens.ts`): one session per account for the whole run. Only specs that test login or ending
sessions log in themselves. The server caps active sessions per user (`SESSION_MAX_ACTIVE_PER_USER`, default
20): more than ~20 logins of one account inside a run would end the oldest, i.e. the stored `storageState` one.
The `mivend-e2e` user agent mark (`helpers/user-agent.ts`) stays: the session specs and the staging suite's
teardown use it.

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

Prerequisites: `seed-erp.mjs` gives `credit-limited@buyer.example` and `prepay@buyer.example` their
contracts with a seeded organization, otherwise the contract guard blocks checkout. The PDF tests need
the worker process (the `generate-document` job; the e2e stack starts it): on CI
(`CI` set) a missing worker fails them, locally they skip with a visible reason. Per-test budgets live in
`packages/e2e/timeouts.ts`. The tests release the buyers'
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

### 2. Cart state persists across tests in a run

Vendure's active order (cart) is tied to the session cookie, which every test of a project reuses.
If an earlier test added items to the cart, the next one sees `cartQty > 0` on all products —
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
> proxy, so browsers scope it to that origin. Calling the server port directly bypasses the proxy and
> the request arrives without a session, clearing a different (anonymous) cart instead.

### 3. `inStock: null` crashes Elasticsearch

The `search` query accepts `inStock: Boolean`. Passing `null` causes a 400 from ES.
`JSON.stringify` keeps `null` but removes `undefined`.

**Rule:** use `undefined` when the filter is inactive, never `null`:

```typescript
inStock: filters?.value.inStock ? true : undefined;
```

### 4. `waitForLoadState('networkidle')` is not sufficient after filter changes

After toggling a filter, the composable fires a new `search` request. `networkidle` waits for no
in-flight requests, but the Vue reactivity update (DOM re-render) may happen a tick later.

**Rule:** after a filter action, wait for a product element to be visible before counting:

```typescript
await page.waitForLoadState('networkidle');
await expect(page.locator('.mv-product-row').first()).toBeVisible({ timeout: 10000 });
```

### 5. Auth state is shared across parallel tests in the same worker

Tests in the `storefront` project use `storageState: '.auth/storefront-user.json'`. All tests
share this cookie. Mutations that change server-side state (cart, orders) affect subsequent tests
in the same run. Use `beforeEach` cleanup or test isolation where needed.

### 6. A UI-driven cart mutation can rotate the session cookie out from under every later test

`storageState: '.auth/storefront-user.json'` (gotcha #5) is a **static snapshot**,
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
