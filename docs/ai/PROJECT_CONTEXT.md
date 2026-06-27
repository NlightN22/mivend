# Project Context

Updated: 2026-06-27 18:20

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
| `/` | `HomePage.vue` | New Arrivals widget → On Sale widget → Popular products |
| `/catalog` | `CatalogPage.vue` | Facet filter sidebar + ProductListView |
| `/product/:slug` | `ProductPage.vue` | Gallery, specs, analogs, buy panel |
| `/cart` | `CartPage.vue` | |
| `/checkout` | `CheckoutPage.vue` | Payment method, delivery, order items, result states |
| `/orders` | `OrdersPage.vue` | Order cards with filter chips + sticky aside |
| `/account` | `AccountPage.vue` | Customer dashboard with sidebar |
| `/account/trading-points` | `TradingPointsPage.vue` | Self-service CRUD |
| `/documents` | `DocumentsPage.vue` | Document list with horizontal filter toolbar |

### Key stores

- `auth.ts` — `customer`, `counterparty`, `tradingPoint`, `isLoggedIn`, `init()` (idempotent, awaited by router guard)
- `cart.ts` — `lines`, `order`, `totalPrice`, `itemCount`
- `checkout.ts` — `selectedPayment`, `selectedDelivery`, `resultState`

### Auth session fix (important)

Router guard is **async** and calls `await authStore.init()` before checking auth. `init()` is idempotent (memoized promise). This prevents F5 redirect-to-login. `rememberMe` is passed to Vendure `login` mutation.

### Key components

- `ProductListView.vue` — grid/list toggle, IntersectionObserver infinite scroll
- `ProductScrollRow.vue` — horizontal carousel with arrow buttons, infinite loop
- `AppHeader.vue` — sticky, uses `MvCatalogDropdown` mega-menu
- `AccountSidebar.vue` — shared sidebar for all /account/* and /orders and /documents pages

### UI Kit notable components

`MvProductCard` props: `name`, `sku`, `brand`, `price`, `compareAtPrice`, `customerPrice`, `currency`, `slug`, `showPrices`, `variantId`, `stockVariant`, `stockQuantity`.

`MvIconButton` — 52px icon+label button, props: `label`, `variant` (`default`/`primary`/`orange`), `title`. Icon via slot (use inline SVG). Added to ui-kit for document actions; reuse elsewhere.

`MvCatalogDropdown` — **must be registered globally in `main.ts`** (already done).

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
- ✅ Header mega-menu (Vendure collections)
- ✅ Facet filter sidebar in catalog
- ✅ `ProductListView` with infinite scroll and grid/list toggle
- ✅ `ProductScrollRow` — carousel with arrow buttons, infinite loop
- ✅ HomePage: New Arrivals + On Sale carousels + Popular products grid
- ✅ `onSale` custom field on Product; fixtures have 24 products (10 on sale)
- ✅ Seed via ERP REST API (`make seed`)
- ✅ `/checkout` — payment method selector, delivery selector, order items, result states (success/pending/fail)
- ✅ `/account` — full customer dashboard: sidebar, hero, status cards, recent orders, quick actions, documents snippet, trading point info, frequent products
- ✅ `/orders` — order cards with filter chips, status pills, sticky aside (payment + balance/limits)
- ✅ `/documents` — document list with horizontal toolbar (search + sort + period + trading point selects + type chips + status chips), `MvIconButton` SVG actions
- ✅ `MvIconButton` in ui-kit — reusable icon+label button component

---

## Recent changes (last session)

- `/checkout` page: PaymentMethodSelector, DeliverySelector, CheckoutOrderItems, CheckoutSummary, CheckoutResult
- `/account` dashboard: 8 sub-components, real credit/tradingPoint data from store, hardcoded orders/docs/products
- Auth session fix: async router guard awaits `authStore.init()` (memoized), rememberMe wired to Vendure mutation
- `/orders`: OrderCard, OrdersAside, filter chips, hardcoded data
- `/documents`: DocumentsPage, DocumentsToolbar (3-row horizontal), DocumentRow, DocumentsFilters (unused — left in repo but not rendered)
- `MvIconButton` added to ui-kit: slot for SVG icon, label prop, variant prop
- Document actions: SVG icons (download = arrow+bar, email = envelope, order = doc, pay = card)

---

## Planned next work

- **Issue #14**: `DiscountRule` entity + service in `plugin-price-entry`:
  - `discount_rule`: `id, priceTypeCode, facetCode, facetValueCode, percent, validFrom, validTo`
  - Update `customerPrice` resolver to apply best active unconditional discount
  - Add `compareAtPrice: Int` to Shop API schema — returns `PriceEntry` price when discount applied
  - Add discount fixtures (e.g. 10% on Lukoil brand for WHOLESALE)
- **#18**: i18n — vue-i18n, Russian locale
- **#19**: Counterparty portal roles
- **#15, #16**: Promo banners, favorites
- **#23**: `plugin-popular-products` — after real orders exist
- Real orders backend + wire `/orders` page to live data
- Real documents backend + wire `/documents` page to live data
- Checkout: wire "Pay online" button to real acquiring plugin

---

## Known problems and limitations

- **New Arrivals widget is empty** — seed products were created today; filter is `createdAt > 7 days ago`; on fresh DB all products appear (seeded within the week).
- **compareAtPrice not in schema** — removed from GQL queries until discount rules built. `MvProductCard` supports the prop but won't show until #14 done.
- **Collections not in ERP seed** — `make seed` does NOT create collections. On DB reset, mega-menu empty.
- **No codegen** — raw GQL strings with manual types.
- **TradingPointsPage** is 451 lines (over 300 limit) — deferred refactor.
- **DocumentsFilters.vue** created but not used — left in `src/pages/documents/` as dead file; can be deleted.
- **All customer-zone pages use hardcoded data** (orders, documents, frequent products, stats) — no real backend for these yet.
- `make lint`: 0 errors, 25 warnings (pre-existing in `.stories.ts` files + router lazy imports).
- `make test`: 53/53 green.

---

## Commands

```bash
make dev          # infra in Docker + server + storefront
make dev-fresh    # wipe DB + re-seed + start
make dev-reset    # tear down infra + volumes
make seed         # POST fixtures via ERP REST API (server must be running on :3000)
make lint         # ESLint (0 errors expected)
make test         # Vitest unit (53 tests, all green)
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
- **`AccountSidebar.vue`** — reuse on every customer-zone page (`/account`, `/orders`, `/documents`, future pages).
- **`MvIconButton`** in ui-kit — use for any small icon+label action button, don't recreate inline.
- Always `make lint && make test` before reporting a task done.
