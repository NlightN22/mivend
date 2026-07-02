# Project Context

Updated: 2026-07-02 14:10

---

## Project purpose

B2B e-commerce portal for ordering auto parts. Customers are legal entities (counterparties) with trading points (delivery addresses). Prices are individual per customer via price types. Stock and catalog sync from an ERP (1C).

## Product direction

Phase 1 (current): working storefront with catalog, cart, account customer zone, customer-specific prices, ERP data intake via REST API, orders lifecycle. Phase 2: branch instances, RabbitMQ sync, full ERP bidirectional flow.

---

## Architecture

Hub-spoke: one central Vendure instance (`apps/server`). Branch instances deferred to Phase 2.

```
packages/
  plugins/
    price-entry/        ✅ custom price types + customerPrice on variant
    customer-pricing/   ✅ customer ↔ price type assignment
    counterparty/       ✅ legal entities + trading points
    erp-import/         ✅ REST push endpoint for ERP data
    search/             ✅ Elasticsearch full-text + OEM cross-reference search
    erp-order/          ✅ order lifecycle: ERP status sync + myOrders Shop API
    sync/               ✅ ERP callback controller (POST /erp/callback/order-status)
  storefront/           ✅ Vue 3 SPA
  ui-kit/               ✅ shared component library
  shared/               types
apps/
  server/               Vendure central instance (bootstrap)
  server/src/worker.ts  Vendure worker (bootstrapWorker + startJobQueue — separate process)
infrastructure/
  docker/               dev compose (postgres, redis, rabbitmq, elasticsearch)
  fixtures/             products.json (29 items), categories.json, prices.json, stock.json
  scripts/              seed-erp.mjs, dev-kill.sh, dev-fresh.sh
```

**Worker is mandatory**: `apps/server/src/worker.ts` runs `bootstrapWorker().then(w => w.startJobQueue())`. Without it BullMQ jobs stay PENDING and ES reindex never completes. Worker runs alongside server via `make dev`.

**Plugin package.json pattern** — every plugin must have:
- `"main": "./dist/index.js"` (NOT `./src/index.ts`)
- `"types": "./dist/index.d.ts"`
- Root `index.ts` re-exporting from `./src/` (without it `tsc` produces no `dist/index.js`)

---

## Frontend

- Vue 3 + TypeScript + Pinia + Vue Router + Element Plus + Vite
- All visual components in `packages/ui-kit/` — never style in pages
- Pages are thin: logic in composables (`src/composables/`) and stores (`src/stores/`)
- Raw GraphQL strings with manual types (codegen not yet set up)
- `AccountSidebar.vue` is a shared sidebar used by `/account`, `/orders`, `/documents` — reuse it on all customer-zone pages

### Catalog filtering (server-side via Elasticsearch)

`useProductList.ts` composable sends all filtering through Vendure `search` query (ES-backed):
- `facetValueFilters: [{ or: [...ids] }]` — facet filters
- `inStock: true | undefined` — stock filter (`null` crashes ES — always use `undefined`)
- Race condition fix: sequence numbers (`loadSeq`) ensure stale responses are discarded
- `ProductListView` uses `IntersectionObserver` for auto-loadMore — page count is NOT stable during tests

### Routes

| Route | File | Notes |
|---|---|---|
| `/` | `HomePage.vue` | New Arrivals + On Sale carousels + Popular products |
| `/catalog` | `CatalogPage.vue` | Facet filter sidebar + ProductListView |
| `/product/:slug` | `ProductPage.vue` | Gallery, specs, analogs, buy panel |
| `/cart` | `CartPage.vue` | CartItemList + CartSummary |
| `/checkout` | `CheckoutPage.vue` | Payment method, delivery, order items |
| `/payment-stub` | `PaymentStubPage.vue` | Mock acquiring page (success/pending/fail) |
| `/order-created` | `OrderCreatedPage.vue` | Post-checkout for invoice/deferred payment |
| `/payment-result` | `PaymentResultPage.vue` | After online payment (status from query) |
| `/orders` | `OrdersPage.vue` | Order cards with filter chips + sticky aside |
| `/orders/:id` | `OrderDetailPage.vue` | Order detail: code, lines, totals, back link |
| `/account` | `AccountPage.vue` | Customer dashboard with sidebar |
| `/account/settings` | `SettingsPage.vue` | Profile, notifications, interface, security, sign out |
| `/account/trading-points` | `TradingPointsPage.vue` | Self-service CRUD |
| `/documents` | `DocumentsPage.vue` | Document list with horizontal filter toolbar |
| `/favorites` | `FavoritesPage.vue` | Favorites/wishlist from localStorage |
| `/access-denied` | `AccessDeniedPage.vue` | 403 page |
| `/:pathMatch(.*)` | `NotFoundPage.vue` | 404 catchall |

### Key stores

- `auth.ts` — `customer`, `counterparty`, `tradingPoint`, `isLoggedIn`, `init()` (idempotent, awaited by router guard)
- `cart.ts` — `lines`, `order`, `totalPrice`, `itemCount` (= number of positions, not total qty)
- `checkout.ts` — `selectedPayment`, `selectedDelivery`, `resultState`
- `favorites.ts` — `items`, `count`, `toggle()`, `has()`, `remove()`, `clear()` — persisted to `localStorage` key `mv_favorites`

### Auth session fix (important)

Router guard is **async** and calls `await authStore.init()` before checking auth. `init()` is idempotent (memoized promise). Logout sets `sessionStorage` key `mv_logged_out=1` to prevent DEV auto-login from re-authenticating. `fetchCurrentCustomer()` bails early if flag is set.

DEV auto-login in `App.vue` skipped if `sessionStorage.getItem('mv_logged_out')` is truthy.

### Cart itemCount

`itemCount = lines.value.length` — counts SKU positions, not total qty.

### Checkout flow

- "Pay online" → `/payment-stub` (mock) → `/payment-result?status=success|pending|fail`
- "Generate invoice" → `/order-created?method=invoice`
- "Deferred payment" → `/order-created?method=deferred`

### Key components

- `ProductListView.vue` — grid/list toggle, IntersectionObserver auto-loadMore; wires cart + favorites to both `MvProductCard` and `MvProductRow`
- `ProductScrollRow.vue` — horizontal carousel; wires cart + favorites to `MvProductCard`
- `CatalogFacets.vue` — sidebar with in-stock checkbox, facet checkboxes with counts, reset button
- `AppHeader.vue` — sticky, uses `MvCatalogDropdown` mega-menu, shows favorites badge count
- `AccountSidebar.vue` — shared sidebar for all /account/* and /orders and /documents pages

### UI Kit notable components

`MvProductCard` props: `name`, `sku`, `brand`, `price`, `customerPrice`, `currency`, `slug`, `showPrices`, `variantId`, `stockVariant`, `cartQty`, `cartLineId`, `isFavorited`.
Emits: `add-to-cart`, `update-cart-qty`, `toggle-favorite`.

`MvProductRow` props: same cart/favorites props as MvProductCard + `multiplicity`, `stock`.
Emits: `add-to-cart`, `update-cart-qty`, `view-analogs`.
Same cart UX as card — stepper when in cart, "+ Add" button when not.

`MvQtyStepper` props: `modelValue`, `min`. Emits: `update:modelValue`. `min=0` allows going to 0.

`MvIconButton` — icon+label button, props: `label`, `variant`, `title`. Icon via slot (inline SVG).

`MvCatalogDropdown` — **must be registered globally in `main.ts`** (already done).

`MvSearchInput` — prop `buttonLabel` (default `'Search'`). Never hardcode button label.

### Cart item remove confirmation

`CartItem.vue`: stepper `min=0`. When user steps down to 0, an inline "Remove? Yes / No" appears instead of silent delete.

---

## Backend

- Vendure 3.6, NestJS 11, TypeORM, PostgreSQL, Redis (BullMQ), Elasticsearch 8
- All customization via plugins — never touch Vendure core
- `RequestContextService.create({ apiType: 'admin' })` for background service access

### Order code strategy

`apps/server/src/order-code.strategy.ts` — `SequentialOrderCodeStrategy` implements `OrderCodeStrategy`.
Format: `ORD-YYYY-NNNNNN` (e.g. `ORD-2026-000001`). Sequence resets per year.
Uses `init(injector)` pattern (NOT `@Injectable()`) to get `TransactionalConnection`.
Registered in `vendure-config.ts` as `orderOptions: { orderCodeStrategy: new SequentialOrderCodeStrategy() }`.

### ERP Order plugin (`@mivend/plugin-erp-order`)

- Shop API custom query: `myOrders(options: OrderListOptions): OrderList!` — requires `Permission.Owner`
  - Returns orders for `ctx.activeUserId`, excludes `AddingItems` and `Cancelled` states
  - Resolver: `packages/plugins/erp-order/src/erp-order.resolver.ts`
  - Schema: `packages/plugins/erp-order/src/api/shop.schema.ts`
- ERP status callback (via EventBus): `ErpOrderStatusEvent(ctx, orderCode, status, erpOrderId?)`
  - `orderCode` = Vendure order code (the cross-reference key, always known at order creation)
  - `erpOrderId` = 1C document code (optional, stored for reference, NOT used as lookup key)
  - Service: `updateStatus(ctx, { orderCode, status, erpOrderId? })` — finds order by `order.code`, saves ERP fields
- Custom fields on Order: `erpStatus` (string), `erpStatusAt` (datetime), `erpOrderId` (string)

### Sync plugin (`@mivend/plugin-sync`) — ERP callback endpoint

- `POST /erp/callback/order-status` — body: `{ orderCode, status, erpOrderId? }`
- Publishes `ErpOrderStatusEvent` to EventBus
- `erp-order` plugin subscribes and calls `updateStatus()`
- Auth: same ERP token as import

### ERP Import plugin (`@mivend/plugin-erp-import`)

- `POST /erp/import/batch` — `{ source, exchangeId, entityType, records[] }`
- `GET /erp/import/runs/:exchangeId` — status
- Auth: `Authorization: Bearer <ERP_IMPORT_TOKEN>` (default `dev-token`)
- Handlers: `product`, `price`, `stock`, `customer`, `counterparty`, `trading-point`, `category`
- `product` handler sets `customFields.onSale` from `ProductRecord.onSale`

### Search plugin (`@mivend/plugin-search`)

- Wraps `ElasticsearchPlugin` from `@vendure/elasticsearch-plugin`
- `ElasticsearchPlugin` must be in top-level `plugins` array (not nested inside SearchPlugin imports)
- Exports `elasticsearchPlugin` for use in `vendure-config.ts`
- Storefront uses `search` Shop API query (not `products`) for catalog listing and filtering

### Price Entry plugin (`@mivend/plugin-price-entry`)

- `PriceEntry` entity: `variantId × priceTypeCode → price`
- Shop API: `customerPrice: Int` on `ProductVariant` (resolved per customer's price type)
- `compareAtPrice` **not yet implemented** — pending discount rule architecture (see issue #14)

---

## Pricing model (business rules — do not deviate)

- Storefront does **not** show retail prices. Retail is irrelevant.
- Each counterparty is assigned a **price type** (e.g. WHOLESALE) — this is the base price.
- **Discount rules** (planned, not yet built) apply on top: by brand/category facet, time-limited, or volume.
- `compareAtPrice` = base `PriceEntry` price (before discount), shown as strikethrough only when discount active.
- `customerPrice` = price after applying best unconditional discount.
- **`compareAtPrice` must NOT be `variant.price`** (Vendure's built-in field). It comes from `PriceEntry`.

---

## Database and data model

PostgreSQL. `synchronize: true` in dev.

Custom entities:
- `PriceType` — price type codes
- `PriceEntry` — variant × price type → price
- `CustomerPricingAssignment` — customer × price type
- `Counterparty` — legal entity
- `TradingPoint` — delivery address linked to counterparty + Vendure Customer
- `ImportRun` / `ImportRunError` — ERP import audit

Custom fields on `Product`: `externalId` (string, unique), `onSale` (boolean, default false).
Custom fields on `Order`: `erpStatus` (string), `erpStatusAt` (datetime), `erpOrderId` (string).

---

## API contracts

- Shop API: `/shop-api` (GraphQL)
- Admin API: `/admin-api` (GraphQL)
- ERP REST: `/erp/import/batch`, `/erp/import/runs/:id`, `/erp/callback/order-status`

`customerPrice` — custom resolver on Shop API `ProductVariant`.
`myOrders` — custom resolver on Shop API Query (requires auth).

Vendure custom fields appear **flat** in `ProductFilterParameter`:
```graphql
filter: { onSale: { eq: true } }   # CORRECT
filter: { customFields: { onSale: ... } }  # WRONG
```

ERP callback payload:
```json
{ "orderCode": "ORD-2026-000001", "status": "PROCESSING", "erpOrderId": "ДО-0012345" }
```
`erpOrderId` is optional. `orderCode` is always the Vendure-generated code (known at order creation, used as cross-reference key).

---

## Implemented so far

- ✅ Vendure central server with Docker dev stack
- ✅ Worker process (`apps/server/src/worker.ts`) — BullMQ job processing, ES reindex
- ✅ Sequential order codes `ORD-YYYY-NNNNNN` via `SequentialOrderCodeStrategy`
- ✅ `plugin-price-entry`: price types + customerPrice resolver
- ✅ `plugin-customer-pricing`: customer ↔ price type assignment
- ✅ `plugin-counterparty`: legal entities + trading points + self-service CRUD
- ✅ `plugin-erp-import`: REST push; handlers for product/price/stock/customer/counterparty/trading-point/category
- ✅ `plugin-search`: Elasticsearch full-text search + OEM cross-reference
- ✅ `plugin-erp-order`: myOrders Shop API query + ERP status callback receiver
- ✅ `plugin-sync`: ERP callback REST endpoint (`POST /erp/callback/order-status`)
- ✅ Storefront catalog with server-side ES filtering (facets + in-stock)
- ✅ Storefront auth with session persistence (async router guard + rememberMe)
- ✅ Catalog, product page, cart, checkout, payment flow pages
- ✅ `/orders` — order cards with filter chips; `/orders/:id` — order detail page
- ✅ `/account` full customer zone + settings + trading points
- ✅ `/documents`, `/favorites`, `/access-denied`, 404
- ✅ E2E Playwright suite: **94/94 green** (catalog, search, filters, cart, checkout, product page, orders)

---

## Recent changes (last session)

- **`SequentialOrderCodeStrategy`** (`apps/server/src/order-code.strategy.ts`) — sequential `ORD-YYYY-NNNNNN` order codes. `init(injector)` pattern, not `@Injectable()`.
- **`plugin-erp-order` rewrite**: added `ErpOrderResolver` with `myOrders` Shop API query; `ErpOrderStatusEvent` now uses `orderCode` as cross-reference key (not `erpOrderId`); `updateStatus()` finds order by `order.code`.
- **`plugin-sync`**: added `POST /erp/callback/order-status` REST endpoint; publishes `ErpOrderStatusEvent`.
- **E2E global-setup**: Bearer token auth (via `vendure-auth-token` response header, not cookie); `ensureCountry()` creates RU country; `ensureShippingMethod()` creates "Free Shipping" if none exist.
- **E2E orders tests** (`packages/e2e/storefront/orders/orders.spec.ts`): new `searchInStock()` helper with ES retry (5 attempts, 3s delay); `goToOrders()` timeout raised to 20s; `clearCart()` transitions to `AddingItems` first.
- **E2E cart tests** (5 files): all `clearCart()` helpers updated to call `transitionOrderToState('AddingItems')` before `removeAllOrderLines` — fixes test pollution when cart is in ArrangingPayment state.
- **Elasticsearch must be running**: `make up` starts ES container. Without it `search` query returns server error. `make test-e2e` requires `make up` first.

---

## Planned next work

- **Clean up debug `console.log` from `auth.ts`** — `[auth] fetchCurrentCustomer — logged_out flag:` etc.
- **Issue #14**: `DiscountRule` entity + service in `plugin-price-entry`
  - `discount_rule`: `id, priceTypeCode, facetCode, facetValueCode, percent, validFrom, validTo`
  - Update `customerPrice` resolver to apply best active unconditional discount
  - Add `compareAtPrice: Int` to Shop API schema — returns `PriceEntry` price when discount applied
  - Add discount fixtures (e.g. 10% on Lukoil brand for WHOLESALE)
- **E2E for order status flow**: create order → verify PENDING status → POST `/erp/callback/order-status` → verify badge updates in UI
- **Wire `/orders` to real backend**: currently shows static cards; needs `myOrders` query wired
- **Wire `/documents` to real backend** (no backend entity yet)
- **#19**: Counterparty portal roles
- **#23**: `plugin-popular-products` — after real orders exist
- Checkout: wire "Pay online" to real acquiring plugin

---

## Known problems and limitations

- **Debug console.log in auth.ts** — still in production code.
- **New Arrivals widget is empty** — filter is `createdAt > 7 days ago`; on fresh DB all products appear (seeded recently).
- **compareAtPrice not in schema** — removed from GQL queries until discount rules built.
- **Collections not in ERP seed** — `make seed` does NOT create collections. On DB reset, mega-menu empty.
- **No codegen** — raw GQL strings with manual types.
- **TradingPointsPage** is 451 lines (over 300 limit) — deferred refactor.
- **DocumentsFilters.vue** dead file in `src/pages/documents/` — not used, can be deleted.
- **`/orders` page uses static card data** — `myOrders` Shop API exists but storefront not wired yet.
- **ES must be running** for E2E tests — `make up` before `make test-e2e`. ES yellow status (single node, no replicas) is normal in dev.
- `make lint`: 0 errors, ~55 warnings (pre-existing in `.stories.ts` + router lazy imports + erp-order new files).
- `make test`: 70/70 green.
- E2E: 94/94 green (requires `make up` + running dev stack).

---

## Commands

```bash
make dev          # infra in Docker + server + worker + storefront + plugin watchers
make up           # Docker infra only (postgres, redis, rabbitmq, elasticsearch)
make dev-fresh    # wipe DB + re-seed + start
make dev-reset    # tear down infra + volumes
make seed         # POST fixtures via ERP REST API (server must be running on :3000)
make lint         # ESLint (0 errors expected, ~55 warnings OK)
make test         # Vitest unit (70 tests, all green)
make test-int     # integration tests (needs infra)
make test-e2e     # Playwright E2E (94 tests; requires make up + running dev stack)
```

Dev defaults:
- Server: `http://localhost:3000`
- Storefront: `http://localhost:5173`
- Admin UI: `http://localhost:3000/admin` (`superadmin` / `superadmin`)
- ERP token: `dev-token`

---

## Do not redo / do not forget

- **`compareAtPrice` ≠ `variant.price`** — never use Vendure's built-in price as strikethrough. Source is `PriceEntry`. Only show when discount rule is active.
- **Retail price is not shown** — no concept of public retail price in the storefront.
- **Vendure custom field filters are flat** — `filter: { onSale: { eq: true } }`, not nested.
- **Vendure GraphQL schema requires server restart** — any change to customFields or plugin schemas needs a restart.
- **`GlobalFlag` not in `@vendure/core`** — use `'TRUE' as const` for `trackInventory`.
- **`MvCatalogDropdown` must be in `main.ts`** global registration.
- **NestJS must be `^11` in all plugin `package.json`** — v10/v11 dual instance breaks TypeORM DI.
- **Collections in Shop API**: filter top-level by `breadcrumbs.length === 2`.
- **GPL-3.0-or-later** in every `package.json`.
- **Business enums in DB**, not code constants.
- **Never import from `plugin-sync`** in other plugins.
- **Auth router guard is async** — `await authStore.init()` before checking `isLoggedIn`. Do not revert to sync guard.
- **Logout flag** — `mv_logged_out` in sessionStorage. DEV auto-login skips if set. `login()` clears it.
- **Cart `itemCount` = positions count** (lines.length), not total qty sum.
- **`MvProductRow`** cart/favorites UX — always pass `cartQty`, `cartLineId`, handle `update-cart-qty`. Emit `[variantId]` not `[qty, variantId]`.
- **`AccountSidebar.vue`** — reuse on every customer-zone page.
- **`MvIconButton`** in ui-kit — use for any small icon+label action button.
- **Never hardcode UI strings** — use props/slots with English defaults.
- **Worker must run separately** from server — calling both `bootstrap()` and `bootstrapWorker()` in same process causes "duplicated custom field" TypeORM error.
- **`inStock: null` crashes ES** — always use `undefined` when filter is inactive, not `null`.
- **ES `ElasticsearchPlugin` must be in top-level `plugins` array** — not nested in SearchPlugin imports.
- **Plugin root `index.ts`** — must re-export from `./src/`, not `./`. Without it `tsc` produces no `dist/index.js`.
- **E2E cart tests** — call `transitionOrderToState('AddingItems')` then `removeAllOrderLines` in clearCart; auto-loadMore makes row count non-deterministic.
- **E2E orders tests** — `searchInStock()` retries 5× with 3s delay (ES may not be ready after seed). `goToOrders()` timeout is 20s.
- **ERP callback key** — `orderCode` (Vendure code, e.g. `ORD-2026-000001`) is the cross-reference. `erpOrderId` (1C doc code) is unknown at order creation — never use it as lookup key.
- **`OrderCodeStrategy` DI** — use `init(injector): void` pattern, instantiate with `new SequentialOrderCodeStrategy()` (no constructor args). Do NOT use `@Injectable()`.
- **Vendure admin API auth** — Bearer token via `vendure-auth-token` response header (not Set-Cookie). Use `Authorization: Bearer <token>` on subsequent requests.
- Always `make lint && make test` before reporting a task done.
