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
- `DiscountRule` entity: `erpId (natural key), priceTypeCode, facetCode?, facetValueCode?, percent, validFrom, validTo` — `facetCode`/`facetValueCode` both null = global discount (rare, supported). Multiple matching active rules → highest `percent` wins. No overlap/open-ended-period handling needed (business periods are always fully bounded, non-overlapping).
- `PriceResolutionService.resolve(ctx, variantId)` — **single shared entrypoint** for `{ customerPrice, compareAtPrice }`. Used by both `ProductVariantPriceResolver` (price-entry, raw `products`/`product` queries) and `SearchService`/`SearchResultResolver` (plugin-search, ES-backed `search` query) — do not duplicate discount logic in a third place; always go through this service.
- Facet matching merges **both** `ProductVariant.facetValues` and `Product.facetValues` — erp-import's product handler assigns brand/category facets to the Product, not the variant, so matching only variant-level facets misses everything.
- Shop API: `customerPrice: Int` and `compareAtPrice: Int` on `ProductVariant` and on ES `SearchResult`. `compareAtPrice` is `null` unless a discount is actually active (no strikethrough otherwise).
- Admin API: `upsertDiscountRule` / `bulkUpsertDiscountRules`, mirrors `upsertPriceEntry` pattern.
- ERP import: `discountRule` record type (`packages/plugins/erp-import/src/handlers/discount-rule.handler.ts`) — imports via `@mivend/plugin-price-entry`'s exported `DiscountRuleService` (not raw SQL, unlike `price.handler.ts`).
- `MvProductCard`/`MvProductRow` (ui-kit) previously always struck through the raw retail `price` whenever `customerPrice` was present — that violated "retail price never shown" and was unrelated to any real discount. Fixed: strikethrough now only renders from `compareAtPrice`/`oldPrice`, and raw `price` is only shown as a fallback when `customerPrice` is undefined.
- `ProductPage.vue`/`ProductBuyPanel.vue` now wired to `customerPrice`/`compareAtPrice` too (was catalog-only initially).
- **`CustomerPriceCalculationStrategy`** (`apps/server/src/customer-price-calculation.strategy.ts`) — registered as `orderOptions.orderItemPriceCalculationStrategy`. Reuses `PriceResolutionService` so the price actually charged in an order (`OrderLine.unitPrice`) matches what the customer saw in the catalog/product page — previously Vendure's default strategy just used raw `ProductVariant.listPrice`, making `customerPrice`/discounts catalog-display-only and cosmetic.

---

## Pricing model (business rules — do not deviate)

See **`docs/pricing.md`** for the full architecture (entities, resolution flow,
real-order pricing via `CustomerPriceCalculationStrategy`, ERP import, and the
volume/weight-tier design agreed but not yet built). Summary:

- Storefront does **not** show retail prices. Retail is irrelevant.
- Each counterparty is assigned a **price type** (e.g. WHOLESALE) — this is the base price.
- `DiscountRule` (facet + mandatory time-window, % discount) applies on top — built in
  issue #14. Volume/weight-tiered discounts are a separate, not-yet-built follow-up.
- `compareAtPrice` = base `PriceEntry` price (before discount), shown as strikethrough only when discount active.
- `customerPrice` = price after applying the best matching discount.
- **`compareAtPrice` must NOT be `variant.price`** (Vendure's built-in field). It comes from `PriceEntry`.
- `customerPrice` now drives the **real order price** too (`CustomerPriceCalculationStrategy`) — not just catalog display.

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
- ✅ `MvFavoriteButton` shared ui-kit component — favorites toggle works identically in catalog grid and list views
- ✅ `plugin-price-entry`: `DiscountRule` (facet + time-window % discounts) + `PriceResolutionService` as the single shared source for `customerPrice`/`compareAtPrice`, used by catalog (grid/list/product page) *and* real order pricing
- ✅ Real order pricing: `CustomerPriceCalculationStrategy` makes `OrderLine.unitPrice` match the discounted price shown in the storefront (previously cosmetic-only)
- ✅ Volume-tiered discount ladders: weight (`DiscountRule.minWeightKg` + `ProductVariant.weight`) and spend amount (`DiscountRule.minAmount`), both via order-context aggregation in `PriceResolutionService`/`CustomerPriceCalculationStrategy` — see `docs/pricing.md`
- ✅ Counterparty → price type now correctly populates `customer_price_type` (was silently writing to an unused Vendure `CustomerGroup`)
- ✅ E2E: orders (incl. ERP status flow) + favorites + catalog + discounts + auth + account segments green (51+ tests); full suite last run 94/95 (one flaky test since fixed)

---

## Recent changes (last session)

- **`SyncPlugin` wired into `vendure-config.ts`** — it existed in code but was never registered, so `POST /erp/callback/order-status` 404'd. Now initialized with `StubErpAdapter` (RabbitMQ/Redis already provisioned in docker-compose).
- **Fixed a process-crashing bug** in `ErpOrderService.updateStatus()` (`packages/plugins/erp-order/src/erp-order.service.ts`): a full `repo.save(order)` recomputed Vendure's calculated Order fields (`discounts`, `taxSummary`), which require `lines`/`surcharges` to be joined — this crashed the entire Nest process. Replaced with `repo.update(id, {...})`, a plain SQL update that skips entity recompute.
- **E2E order-status-flow** (`packages/e2e/storefront/orders/order-status-flow.spec.ts`): place order → POST ERP callback → verify status badge on `/orders/:id` and `/orders`. Note: Vendure reuses one active order per session across repeated checkouts (`OrderPlacedEvent` fires only once per order id), so the test compares two sequential callback statuses rather than asserting a fixed baseline — do the same in any new order-status test to avoid flakiness.
- **E2E orders helpers extracted** to `packages/e2e/storefront/orders/helpers.ts` (shared by `orders.spec.ts` and `order-status-flow.spec.ts`); `placeTestOrder()` now returns `{ id, code }` straight from the `transitionOrderToState` mutation response instead of a separate `myOrders` "most recent" query (that was a race condition).
- **`MvFavoriteButton`** (`packages/ui-kit/src/components/MvFavoriteButton/`) — extracted shared favorites toggle (`mv-favorite-btn` / `mv-favorite-btn--active` classes, `aria-label="Toggle favorite"`). Used by `MvProductCard` (grid) and now also `MvProductRow` (list, previously had no favorites toggle at all). `ProductListView.vue` wires `favoritesStore` to both.
- **`FavoriteProductRow.vue`** (favorites page list view) — previously had no way to remove an item in list view; now reuses the same toggle (`isFavorited=true`, click → `remove`).
- **E2E favorites** (`packages/e2e/storefront/favorites/favorites.spec.ts`) — empty state, add from catalog (grid + list), persist across reload, remove, heart icon state.
- Removed debug `console.log` calls from `auth.ts`.
- Confirmed **New Arrivals widget is not actually broken** — verified live via screenshot; see Known problems for nuance.

---

## Planned next work

- **Manager portal for discount management** (planned, not started): discount rules
  (flat, weight-tiered, and amount-tiered) are **not** expected to come from the ERP in
  production —
  the `discountRule` ERP-import record type exists for dev/test seeding convenience
  only. The real path is a manager-facing portal on Vendure's Admin API with a
  multi-step approval workflow (director, department heads), calling the already-exposed
  `upsertDiscountRule`/`bulkUpsertDiscountRules` Admin mutations directly — no data-layer
  changes needed when this is built.
- UX for volume discounts (not built): a static promo block in the cart (not a live
  "N kg to next tier" calculator) plus a temporary corner toast when adding a qualifying
  item to cart from the catalog.
- **Wire `/documents` to real backend** (no backend entity yet)
- **#19**: Counterparty portal roles
- **#23**: `plugin-popular-products` — after real orders exist
- Checkout: wire "Pay online" to real acquiring plugin

---

## Known problems and limitations

- **New Arrivals widget** — filter is `createdAt > 7 days ago`; not actually broken (verified live), just means on a freshly reseeded DB every product qualifies as "new" since all rows were just inserted. Cosmetic-only in dev, will behave correctly once seed data ages.
- **Collections not in ERP seed** — `make seed` does NOT create collections. On DB reset, mega-menu empty.
- **No codegen** — raw GQL strings with manual types.
- **TradingPointsPage** is 451 lines (over 300 limit) — deferred refactor.
- **DocumentsFilters.vue** dead file in `src/pages/documents/` — not used, can be deleted.
- **ES must be running** for E2E tests — `make up` before `make test-e2e`. ES yellow status (single node, no replicas) is normal in dev.
- `make lint`: 0 errors, ~55 warnings (pre-existing in `.stories.ts` + router lazy imports + erp-order new files). `eslint.config.js` now sets `argsIgnorePattern: '^_'` for `no-unused-vars` (needed for strategy interfaces with unused trailing args, e.g. `CustomerPriceCalculationStrategy`).
- `make test`: 93/93 green.
- E2E: orders (incl. order-status-flow + volume-discount + amount-discount) + favorites + catalog (incl. discounts) + auth + account segments (48+ tests) green; full suite last verified 94/95 (one flaky test since fixed). Note: hit a one-off `SequentialOrderCodeStrategy` unique-code race during a run (documented risk) — didn't reproduce on retry, not investigated further.
- **`tsc --noEmit` on `plugin-price-entry` reports spurious `"@vendure/core" has no exported member ..."` errors** even on trivial imports, reproducible on a from-scratch minimal file — environment/dependency-resolution quirk, not a real type error (dist/ still emits correct JS via `tsc --watch` despite it, and everything works at runtime — verified via live GraphQL/e2e). `make lint`/`make test` are unaffected (different resolution path) and remain the authoritative gates. Not investigated further — flag if it recurs or blocks `make build`.

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
