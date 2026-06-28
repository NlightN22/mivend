# Project Context

Updated: 2026-06-28 17:30

---

## Project purpose

B2B e-commerce portal for ordering auto parts. Customers are legal entities (counterparties) with trading points (delivery addresses). Prices are individual per customer via price types. Stock and catalog sync from an ERP (1C).

## Product direction

Phase 1 (current): working storefront with catalog, cart, account customer zone, customer-specific prices, ERP data intake via REST API. Phase 2: branch instances, RabbitMQ sync, full ERP bidirectional flow.

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
    sync/               🔲 outbox + RabbitMQ skeleton (Phase 2)
  storefront/           ✅ Vue 3 SPA
  ui-kit/               ✅ shared component library
  shared/               types
apps/
  server/               Vendure central instance
infrastructure/
  docker/               dev compose
  fixtures/             products.json (24 items), prices.json, stock.json
  scripts/              seed-erp.mjs, dev-kill.sh, dev-fresh.sh
```

---

## Frontend

- Vue 3 + TypeScript + Pinia + Vue Router + Element Plus + Vite
- All visual components in `packages/ui-kit/` — never style in pages
- Pages are thin: logic in composables (`src/composables/`) and stores (`src/stores/`)
- Raw GraphQL strings with manual types (codegen not yet set up)
- `AccountSidebar.vue` is a shared sidebar used by `/account`, `/orders`, `/documents` — reuse it on all customer-zone pages

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

- `ProductListView.vue` — grid/list toggle, IntersectionObserver infinite scroll; wires cart + favorites to both `MvProductCard` and `MvProductRow`
- `ProductScrollRow.vue` — horizontal carousel; wires cart + favorites to `MvProductCard`
- `AppHeader.vue` — sticky, uses `MvCatalogDropdown` mega-menu, shows favorites badge count
- `AccountSidebar.vue` — shared sidebar for all /account/* and /orders and /documents pages

### UI Kit notable components

`MvProductCard` props: `name`, `sku`, `brand`, `price`, `customerPrice`, `currency`, `slug`, `showPrices`, `variantId`, `stockVariant`, `cartQty`, `cartLineId`, `isFavorited`.
Emits: `add-to-cart`, `update-cart-qty`, `toggle-favorite`.
Shows `MvQtyStepper` (min=0) when `cartQty > 0`, "Add to cart" button otherwise. Heart button toggles favorite state.

`MvProductRow` props: same cart/favorites props as MvProductCard + `multiplicity`, `stock`.
Emits: `add-to-cart`, `update-cart-qty`, `view-analogs`.
Same cart UX as card — stepper when in cart, "+ Add" button when not.

`MvQtyStepper` props: `modelValue`, `min`. Emits: `update:modelValue`.
`min=0` allows going to 0 (caller decides if that means remove).

`MvIconButton` — icon+label button, props: `label`, `variant`, `title`. Icon via slot (inline SVG).

`MvCatalogDropdown` — **must be registered globally in `main.ts`** (already done).

`MvSearchInput` — prop `buttonLabel` (default `'Search'`). Never hardcode button label.

### Cart item remove confirmation

`CartItem.vue`: stepper `min=0`. When user steps down to 0, an inline "Remove? Yes / No" appears instead of silent delete. `×` button removed.

---

## Backend

- Vendure 3.6, NestJS 11, TypeORM, PostgreSQL, Redis (BullMQ)
- All customization via plugins — never touch Vendure core
- `RequestContextService.create({ apiType: 'admin' })` for background service access

### ERP Import plugin (`@mivend/plugin-erp-import`)

- `POST /erp/import/batch` — `{ source, exchangeId, entityType, records[] }`
- `GET /erp/import/runs/:exchangeId` — status
- Auth: `Authorization: Bearer <ERP_IMPORT_TOKEN>` (default `dev-token`)
- Handlers: `product`, `price`, `stock` — upsert by SKU/externalId
- `product` handler sets `customFields.onSale` from `ProductRecord.onSale`

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

---

## API contracts

- Shop API: `/shop-api` (GraphQL)
- Admin API: `/admin-api` (GraphQL)
- ERP REST: `/erp/import/batch`, `/erp/import/runs/:id`

`customerPrice` — custom resolver on Shop API `ProductVariant`.

Vendure custom fields appear **flat** in `ProductFilterParameter`:
```graphql
filter: { onSale: { eq: true } }   # CORRECT
filter: { customFields: { onSale: ... } }  # WRONG
```

---

## Implemented so far

- ✅ Vendure central server with Docker dev stack
- ✅ `plugin-price-entry`: price types + customerPrice resolver
- ✅ `plugin-customer-pricing`: customer ↔ price type assignment
- ✅ `plugin-counterparty`: legal entities + trading points + self-service CRUD
- ✅ `plugin-erp-import`: REST push; `onSale` flag supported in product records
- ✅ Storefront auth with session persistence (async router guard + rememberMe)
- ✅ Catalog, product page, cart
- ✅ Header mega-menu (Vendure collections), favorites badge counter
- ✅ Facet filter sidebar in catalog
- ✅ `ProductListView` with infinite scroll and grid/list toggle (cart + favorites wired)
- ✅ `ProductScrollRow` — carousel (cart + favorites wired)
- ✅ HomePage: New Arrivals + On Sale carousels + Popular products grid
- ✅ `onSale` custom field on Product; fixtures have 24 products (10 on sale)
- ✅ Seed via ERP REST API (`make seed`)
- ✅ `/checkout` — payment method selector, delivery selector, order items, dynamic checkout button
- ✅ `/payment-stub` — mock acquiring with success/pending/fail
- ✅ `/order-created` — post-checkout for invoice and deferred payment
- ✅ `/payment-result` — payment outcome page
- ✅ `/account` — full customer dashboard with sidebar
- ✅ `/account/settings` — profile, notifications, interface, security, sign out
- ✅ `/orders` — order cards with filter chips + sticky aside
- ✅ `/documents` — document list with horizontal toolbar + `MvIconButton` SVG actions
- ✅ `/favorites` — favorites page wired to localStorage store (Issue #16 done)
- ✅ `/access-denied` and `/:pathMatch(.*)` (404) error pages
- ✅ `favorites.ts` Pinia store with localStorage persistence + 7 unit tests
- ✅ `MvProductCard` + `MvProductRow` — unified cart/favorites UX (stepper in cart, Add button out)
- ✅ Cart item remove confirmation — inline "Remove? Yes/No" on qty→0
- ✅ `MvIconButton` in ui-kit
- ✅ `MvSearchInput` — `buttonLabel` prop (no hardcoded Russian)

---

## Recent changes (last session)

- **Issue #16 closed**: `favorites.ts` store (localStorage, mv_favorites key) + 7 unit tests
- `MvProductCard`: `isFavorited` prop + `toggle-favorite` emit; filled heart styling
- `MvProductRow`: refactored to cart-aware — `cartQty`/`cartLineId` props, stepper when in cart, "+ Add" button when not; removed internal qty picker
- `ProductListView`: wires both card and row to cart + favorites stores
- `ProductScrollRow`: wires favorites to carousel cards
- `FavoritesPage`: uses real store data, empty state for no favorites
- `AppHeader`: favorites badge count (pink, top-right on heart icon)
- `CartItem`: removed × button; stepper min=0 with inline remove confirmation
- `auth.ts`: logout sets `mv_logged_out` sessionStorage flag; DEV auto-login skips if flag set (prevents re-auth after explicit logout)
- Debug `console.log` still present in `auth.ts` (from logout debugging) — **should be cleaned up**

---

## Planned next work

- **Clean up debug `console.log` from `auth.ts`** (commits `4989846`, `a8cba44` added them)
- **Issue #14**: `DiscountRule` entity + service in `plugin-price-entry`
  - `discount_rule`: `id, priceTypeCode, facetCode, facetValueCode, percent, validFrom, validTo`
  - Update `customerPrice` resolver to apply best active unconditional discount
  - Add `compareAtPrice: Int` to Shop API schema — returns `PriceEntry` price when discount applied
  - Add discount fixtures (e.g. 10% on Lukoil brand for WHOLESALE)
- **#19**: Counterparty portal roles
- **#18**: i18n — vue-i18n, Russian locale (deferred, user declined for now)
- **#23**: `plugin-popular-products` — after real orders exist
- Real orders backend + wire `/orders` page to live data
- Real documents backend + wire `/documents` page to live data
- Checkout: wire "Pay online" button to real acquiring plugin

---

## Known problems and limitations

- **Debug console.log in auth.ts** — `[auth] logout mutation result:`, `[auth] sessionStorage flag set:`, `[auth] fetchCurrentCustomer — logged_out flag:` still in production code.
- **New Arrivals widget is empty** — seed products were created at seed time; filter is `createdAt > 7 days ago`; on fresh DB all products appear.
- **compareAtPrice not in schema** — removed from GQL queries until discount rules built.
- **Collections not in ERP seed** — `make seed` does NOT create collections. On DB reset, mega-menu empty.
- **No codegen** — raw GQL strings with manual types.
- **TradingPointsPage** is 451 lines (over 300 limit) — deferred refactor.
- **DocumentsFilters.vue** created but not used — dead file in `src/pages/documents/`; can be deleted.
- **All customer-zone pages use hardcoded data** (orders, documents, frequent products, stats) — no real backend yet.
- `make lint`: 0 errors, 42 warnings (pre-existing in `.stories.ts` files + router lazy imports).
- `make test`: 60/60 green (including 7 new favorites store tests).

---

## Commands

```bash
make dev          # infra in Docker + server + storefront
make dev-fresh    # wipe DB + re-seed + start
make dev-reset    # tear down infra + volumes
make seed         # POST fixtures via ERP REST API (server must be running on :3000)
make lint         # ESLint (0 errors expected, 42 warnings OK)
make test         # Vitest unit (60 tests, all green)
make test-int     # integration tests (needs infra)
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
- **Logout flag** — `mv_logged_out` in sessionStorage. DEV auto-login skips if set. `login()` clears it. Do not break this.
- **Cart `itemCount` = positions count** (lines.length), not total qty sum.
- **`MvProductRow`** now has cart/favorites UX — always pass `cartQty`, `cartLineId`, handle `update-cart-qty` from parent. Old `add-to-cart` emit signature changed: now emits `[variantId]` not `[qty, variantId]`.
- **`AccountSidebar.vue`** — reuse on every customer-zone page.
- **`MvIconButton`** in ui-kit — use for any small icon+label action button, don't recreate inline.
- **Never hardcode UI strings** — no Russian text in templates. Use props/slots with English defaults.
- Always `make lint && make test` before reporting a task done.
