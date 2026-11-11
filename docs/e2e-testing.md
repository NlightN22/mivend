# E2E Testing Guide

Playwright tests are in `packages/e2e/storefront/` (storefront) and `packages/e2e/manager/`
(manager portal).

Rules, checklist and the final checklist audit for every e2e change: the `e2e-rules` skill
(`.claude/skills/e2e-rules/SKILL.md`).

## Running

```bash
make e2e-dev                                   # full suite, E2E_SHARDS (4) shards
make e2e-dev E2E_ARGS="storefront/orders --project=storefront"
make e2e-groups G="manager-customers manager-orders"   # several registry groups on one stack
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

`skip-guard-reporter.ts` fails the run on any skipped test (zero skips). A test that applies to some role projects only
is selected by an `@on:<project>` tag, never skipped (next section); missing data is seeded. `manager/resilience` is
not part of the suite at all: `playwright.config.ts` ignores it unless `E2E_RESILIENCE` is set.

Every Playwright run is two passes on the same stack (`infrastructure/scripts/e2e-playwright.sh`): tests tagged
`@read-only` on `E2E_PARALLEL_WORKERS` workers (default 3), then everything else on one worker. The second pass reuses
the seed and sessions of the first (`global-setup` writes `.auth/setup-done`). Rules: `docs/testing-strategy.md` "E2E parallelism".

## Several groups on one stack (#316)

`make e2e-groups G="manager-customers manager-orders"` validates every name, boots one stack, and runs the groups
one after another through the same two passes; `make e2e-group G=<name>` is unchanged and still runs one group. The
stack boot and the seed (about 90 s plus the 30-45 s picker seed) are paid once instead of once per group. The target
holds the same `/tmp/mivend-e2e.lock` as every e2e target.

Between groups `infrastructure/scripts/e2e-leak.sh` compares a snapshot of the stack database before and after each
group: active reservations and orders in any state except Cancelled, AddingItems, ArrangingPayment and Draft. Carts (AddingItems, ArrangingPayment, Draft) are deliberately not counted, and only an increase counts. A difference
stops the run with `e2e leak: group '<name>' left data behind` and the diff, so the next group never starts on top of
leftovers. A failing group does not stop the others from running, and the target still exits non-zero at the end.

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
| `storefront-auth` | dev | storefront login, set-password and account activation pages, trading-point selection, guest theme switch (no stored session) | `--project=storefront-noauth` |
| `storefront-account` | dev | storefront account pages | `--project=storefront storefront/account` |
| `storefront-api` | dev | storefront REST/Swagger docs surface | `--project=storefront storefront/api` |
| `storefront-cart` | dev | cart behaviour | `--project=storefront storefront/cart` |
| `cart-totals` | dev | cart totals and discount invariants | `--project=storefront-cart-totals` |
| `storefront-catalog` | dev | catalog, search, filters, category tree, product card | `--project=storefront storefront/catalog` |
| `storefront-checkout-credit` | dev | checkout, credit limits | `--project=storefront storefront/checkout-credit` |
| `storefront-checkout-no-point` | dev | checkout without a trading point | `--project=storefront storefront/checkout-no-point` |
| `storefront-documents` | dev | customer documents | `--project=storefront storefront/documents` |
| `storefront-favorites` | dev | favorites | `--project=storefront storefront/favorites` |
| `storefront-home` | dev | home page | `--project=storefront storefront/home` |
| `storefront-layout` | dev | phone layout: no page scrolls horizontally at 360px | `--project=storefront storefront/layout` |
| `storefront-markup` | dev | markup rule (negative discount percent) in catalog, cart and order (#283) | `--project=storefront storefront/markup` |
| `storefront-orders` | dev | customer orders (placement, list, detail, cancel) | `--project=storefront storefront/orders` |
| `storefront-proforma` | dev | proforma invoices and per-organization proformas | `--project=storefront storefront/proforma-invoices storefront/proforma-organizations` |
| `storefront-session` | dev | session-ended bar | `--project=storefront storefront/session` |
| `storefront-theme` | dev | storefront theme: system default before mount, live follow, menu choice persisted (#313) | `--project=storefront storefront/theme` |
| `manager-acting` | dev | acting-as-customer sessions: attribution, isolation from the customer's own cart and sessions, single-use ticket, finish, credit check (#322) | `--project=manager-operator manager/acting` |
| `manager-auth` | dev | manager login, password reset, sign-in through the corporate account against the local mock OIDC provider (no stored session) | `--project=manager-noauth` |
| `manager-bulk-operations` | dev | bulk operations wizard: select all, parameters, review, run and result | `--project=manager-portal-admin manager/bulk-operations` |
| `manager-catalog` | dev | manager category tree | `--project=manager-operator --project=manager-portal-admin manager/catalog` |
| `manager-customers` | dev | customers, counterparties, history filters | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/customers` |
| `manager-dashboard` | dev | dashboard KPIs per role | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/dashboard` |
| `manager-discounts` | dev | discounts list: number first, search, status chips, Filter builder, row opens the request, phone cards | `--project=manager-operator manager/discounts` |
| `manager-layout` | dev | mobile nav, pagination scroll, no nested vertical scrollbar | `--project=manager-operator --project=manager-portal-admin manager/layout` |
| `manager-orders` | dev | manager orders list, detail, delivery | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/orders` |
| `manager-proforma-payments` | dev | proforma invoices and payments smoke | `--project=manager-operator manager/proforma-invoices-payments` |
| `manager-settlements` | dev | settlements list: type chips, filter, sort, menu entry, phone card | `--project=manager-portal-admin manager/settlements` |
| `manager-settings` | dev | roles, users, security settings | `--project=manager-operator --project=manager-manager --project=manager-department-head --project=manager-portal-admin manager/settings` |
| `manager-team` | dev | Team directory: search, department filter, status chips, deactivated administrators (#311) | `--project=manager-operator manager/team` |
| `manager-resilience` | dev | recovery after transient failure (use make e2e-resilience) | `manager/resilience` |
| `visibility-storefront` | dev | own-data, price-type, category visibility incl. hidden-category URL empty catalog (storefront) | `--project=visibility-storefront` |
| `visibility-manager` | dev | entity lists, counterparties, price types, servicing team, categories (manager) | `--project=visibility-manager` |
| `category-visibility` | dev | category visibility in both portals (#264); alias that overlaps `visibility-storefront` and `visibility-manager` (their category specs) | `--project=visibility-storefront --project=visibility-manager categories` |
| `smoke` | dev | critical-route subset tagged @smoke (use make e2e-smoke) | `--grep @smoke --project=storefront-noauth --project=storefront` |
| `exchange-placement` | integration | order placement and ERP exchange | `01-placement` |
| `exchange-cancel` | integration | order cancel after publish | `02-cancel` |
| `exchange-cancel-before-publish` | integration | order cancel before publish | `03-cancel-before-publish` |
| `exchange-cleanup` | integration | run cleanup | `04-cleanup` |
| `category-feed` | integration | category visibility on the real ERP feed: deleted parent, inactive, revive, late parent, move, tombstone (#264); all scenarios passed on the real feed with the ERP owner on 2026-10-27 | `05-category-feed 06-category-feed` |

`category-feed` needs ERP-side fixture categories whose ids sit in the staging env file as `STAGING_FEED_CAT_<KEY>` (keys in
`packages/e2e/integration/category-feed.ts`); `06` waits for the ERP owner's steps, so run it with the owner at hand. Each scenario first waits (`[category-feed] WAITING FOR INITIAL STATE`, 15 min) for its ERP-sent state; for the late parent that is up to 70 min (Integration Service accepts an orphan child after 1 h) and the owner step plus child/parent visibility up to 40 min.
The ERP feed sends `isActive = NOT(deletion mark)` and never `isDeleted=true`, so "deleted" and "inactive" fixtures
look identical (`feedHidden`/`isPrivate`); specs must not assume `isDeleted` from the feed. Revive = the owner clears
the deletion mark. `06` prints `[category-feed] WAITING FOR ERP OWNER: <step>` (15 min each, one step at a time):
clear the deletion mark on REVIVE_PARENT; register LATE_PARENT for sending; change the parent of MOVE_CHILD from
MOVE_FROM to MOVE_TO. The tombstone scenario sends the tombstone itself (Integration Service `POST /api/ingestion/v1/entities/delete`,
source id `INTEGRATION_RESYNC_SOURCE_SYSTEM`; both it and `INTEGRATION_SERVICE_BASE_URL` come only from the staging env file and the helper fails naming the missing key) until the ERP sends one (ERP-side issue for category deletion tombstones).

`category-feed` is the explicit exception to the 30-minute run limit: it waits for manual ERP-owner steps (per-step bounds 15/40 min, test timeout up to 125 min).

Deliberate omissions of #264 (see #291): authorized-staff checks run as superadmin because no seeded role other than superadmin holds `UpdateCatalog`; search and suggestions are not covered on the access stand (the external search backend is dead there); the hidden-category products rule (owner decision, `docs/category-hierarchy.md`) is covered by the `visibility-storefront` and `visibility-manager` category specs (16, 15) and the access stand `category-products.test.ts` (browse path only, text search is covered by unit/parity tests).

## Picker seed (#312)

`fixtures/seed-picker.ts` adds 510 filler counterparties named `Zza Picker Filler NNNN` plus `Zzz Picker Target` (with a
portal customer) and `Zzz Picker No Portal` (without one), so the new-order picker spec finds a counterparty beyond
the old 500-row cap. The `Zz` names sort after every other seed counterparty, so helpers that read the first page of
`counterparties` keep finding their own records. `global-setup.ts` sends them after the main seed in chunks of 100 (one
batch exceeds the server body limit) and assigns the two `Zzz Picker` counterparties to the manager account, whose
own-scope role would otherwise not see them. Cost: about 30-43 s of `global-setup` per stack (`e2e picker seed: Ns` line).
Only `manager/acting` uses it, so `e2e-picker-seed.sh` sets `E2E_PICKER_SEED=0` (skipped) when no selected group can run that spec; a batch seeds it if any group may (#336). Unknown or unfiltered args seed it.

## Speed (#336)

Measure on a calm host only (nothing else running; check `uptime` and `free -h`), wall time AND CPU time (`/usr/bin/time -v`: user+sys, max RSS), one change at a time, each timing twice:

1. Baseline: `/usr/bin/time -v make e2e-groups G="manager-orders manager-customers manager-proforma-payments storefront-catalog"`; note the `e2e stack:` and `e2e picker seed:` lines.
2. Same batch with `E2E_PICKER_SEED=1` forced, to isolate the picker seed gain.
3. `E2E_PARALLEL_WORKERS=2`, `3`, `4` on the same batch (read-only pass; watch CPU time and load for timeouts).
4. Per group inside the batch: `make e2e-groups G="<one group>"` repeated, to split stack boot, setup, read-only pass and write pass.

Measured on a quiet 8-core host (batch: manager-orders, manager-customers, manager-proforma-payments, storefront-catalog; one run each):

| Config | Wall | user+sys CPU | Result |
| --- | --- | --- | --- |
| baseline, 3 read-only workers | 20:16 | 1627 s | all passed |
| 4 read-only workers | 20:38 | 1695 s | 1 failure in manager-orders (list filter survives a reload), load peaked at 12 |
| 2 read-only workers | 21:10 | 1617 s | all passed |

Per group (read-only pass + write pass, baseline): manager-orders 5.2m + 2.6m, manager-customers 1.0m + 2.5m, manager-proforma-payments 1.0m (no write pass), storefront-catalog 5.2m. Stack boot is 111 s of the wall (server 42 s, seed 69 s). The average CPU use is about 1.3 cores of 8, so the batch is bound by serial waits, not by cores: the worker count does not matter between 2 and 4 and 4 only adds flakiness. Do not raise `E2E_PARALLEL_WORKERS`.

Not measured: the forced picker seed (`E2E_PICKER_SEED=1`, expected gain is the 30-45 s seed) and repeated single groups. Next lever is the wait time inside the slow specs (storefront-catalog read-only pass, manager-orders both passes), not parallelism.

Candidates (analysis in #336): read-only workers vs cores, a combined read-only pass across groups, two stacks, event-based waits replacing `waitForTimeout`.

## Manager portal role projects

`playwright.config.ts` defines one project per manager-portal role under test (`manager-operator`, `manager-manager`,
`manager-department-head`, `manager-portal-admin`), each pre-authenticated as the corresponding seeded account from
`.tests/accounts.md`, all over `packages/e2e/manager/`. A role changes the result only for scope, permission and
visibility, so a scenario runs under every role only when it tests one of those (`docs/testing-patterns.md`:
authorization, data isolation).

**Declaring the roles (#318).** A test or `describe` title carries `@on:<project>` tags, one per project it runs
under; no tag means all four. `helpers/role-projects.ts` turns them into each project's `grep`, so a test outside a
project's list is not collected and is not a skip. Do not write `test.skip` on the project name. A test that reads
`testInfo.project.name` to assert role-specific UI (the dashboard KPI cards) is a role-dependent test and carries no tag.
Add `@read-only` as well for a test that changes no shared data (see "E2E parallelism" in `docs/testing-strategy.md`).

Decision per spec (R = all four roles; O = operator, M = manager, D = department head, P = portal admin):

| Spec | Runs under | Why |
| --- | --- | --- |
| `dashboard`: KPI cards | R | cards depend on the role |
| `dashboard`: panels, filter chips | O | same component for every role |
| `orders/orders-list`: seeded order row, row click | R | order visibility is scope-dependent (own / department) |
| `orders/orders-list`: KPI carousel | O | UI mechanics |
| `orders/order-detail`: layout, reservation confirm/release | R | detail read scope; confirm is a permissioned write |
| `orders/order-create-picker` | O, M | department scope and own scope see the picker target differently |
| `orders/order-delivery` | O | API-level, always the operator token |
| `orders/orders-pagination` | O | UI mechanics |
| `customers/customers`: list, Overview, Orders tab, other-customer grant leak | R | scope and isolation |
| `customers/customers`: CSV export, row click, Documents tab, own-customer grant | O | same code for every role |
| `customers/customers`: trading point edit and reactivate | R | `UpdateTradingPoint` is permissioned |
| `customers/customers`: History tab visible / absent | D (and P is leadership too) / O, M | `ReadEntityHistory` is leadership-only |
| `customers/customers`: contact diff, reassign manager | D | needs `ReadEntityHistory` + `ReassignCounterpartyManager` |
| `customers/counterparty-inn`, `activation-filter-typing` | P | bulk activation needs portal admin rights |
| `customers/customer-history-filters` | P | UI-kit overlay behaviour, role-independent |
| `catalog/category-tree`: sidebar, hidden marks, listing | O | display, role-independent |
| `catalog/category-tree`: visibility page | P | needs `UpdateCatalog` |
| `settings/settings-roles`, `settings-users`: positive | P | `ManageAccessControl` / `ManageAdministratorLifecycle` |
| `settings/settings-roles`, `settings-users`: negative | O, M, D | the other roles must be refused |
| `settings/settings-security` | O | admin-api session mechanics, role-independent |
| `discounts`, `proforma-invoices-payments`, `layout/mobile-nav`, `team` | O | role-independent display: the pages render the same component for every role, and their scope visibility is covered by `make test-access` (proforma, payment, discount-grant, dashboard matrices) and `visibility/` (entity lists, servicing team) |
| `settlements` | P | needs `ReadSettlementDocument`; scope is covered by `make test-access` (settlement-admin-visibility) |
| `layout/pagination-scroll` | P | UI mechanics |

Run time per group drops because a role-independent scenario costs one run instead of four.

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
`manager-department-head`'s `"department"` scope. 

## Sessions

The database, and with it every session, is dropped after the run, so there is no session teardown.
Browser specs reuse the `storageState` session; Admin API calls take their token from `adminTokenFor()`
(`helpers/api-tokens.ts`): one session per account for the whole run. Only specs that test login or ending
sessions log in themselves. The server caps active sessions per user (`SESSION_MAX_ACTIVE_CUSTOMER`/`SESSION_MAX_ACTIVE_STAFF`, `20`
in the local examples): more than ~20 logins of one account inside a run would end the oldest, i.e. the stored `storageState` one.
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
