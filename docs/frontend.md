# Frontend architecture

Storefront for B2B clients. Located at `packages/storefront/`.

## Stack

| Layer      | Library                                   | Notes                                               |
| ---------- | ----------------------------------------- | --------------------------------------------------- |
| Framework  | Vue 3 (Composition API, `<script setup>`) |                                                     |
| Build      | Vite 6                                    |                                                     |
| UI         | Element Plus                              | Virtual-scroll tables (`ElTableV2`), B2B components |
| State      | Pinia                                     | One store per domain                                |
| Routing    | vue-router 4                              | History mode, auth guard                            |
| GraphQL    | graphql-codegen                           | Types generated from Vendure Shop API schema        |
| i18n       | vue-i18n 9                                | Russian only for now; structured for expansion      |
| Type check | vue-tsc                                   |                                                     |

## Folder structure

```
packages/storefront/
├── src/
│   ├── api/
│   │   ├── client.ts             # Base fetch wrapper (auth, error handling)
│   │   ├── codegen.ts            # graphql-codegen configuration
│   │   └── generated/            # Auto-generated types — do not edit manually
│   │
│   ├── components/               # Reusable components, grouped by domain
│   │   ├── catalog/              # ProductCard, OemSearchInput, PriceTag, ...
│   │   ├── order/                # OrderTable, OrderStatusTag, ...
│   │   └── ui/                   # Thin wrappers over Element Plus if needed
│   │
│   ├── composables/              # Shared logic extracted from components
│   │   # useInfiniteList, useOemSearch, useDebounce, ...
│   │
│   ├── i18n/
│   │   └── ru.ts                 # All UI strings in Russian
│   │
│   ├── layouts/
│   │   ├── DefaultLayout.vue     # Header + sidebar + router-view
│   │   └── AuthLayout.vue        # Centered layout for login/error pages
│   │
│   ├── pages/                    # One file per route, thin — delegates to components
│   │   ├── auth/
│   │   │   └── LoginPage.vue
│   │   ├── catalog/
│   │   │   ├── CatalogPage.vue   # Search + infinite product list
│   │   │   └── ProductPage.vue   # Product detail + add to cart
│   │   ├── cart/
│   │   │   └── CartPage.vue
│   │   ├── orders/
│   │   │   └── OrdersPage.vue    # Order history with virtual-scroll table
│   │   └── account/
│   │       └── AccountPage.vue   # Credit limit, price type, trade points
│   │
│   ├── router/
│   │   └── index.ts              # Routes + auth guard
│   │
│   ├── stores/                   # Pinia stores, one per domain
│   │   ├── auth.ts
│   │   ├── cart.ts
│   │   └── catalog.ts
│   │
│   ├── App.vue
│   └── main.ts
│
├── codegen.ts                    # graphql-codegen config (root level)
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Key rules

- **Pages are thin.** No business logic in page components — delegate to composables and stores.
- **Never edit `src/api/generated/`** — it is overwritten by codegen on every run.
- **All GraphQL operations are typed.** Raw string queries with manual types are forbidden.
  Run `pnpm --filter @mivend/storefront codegen` after changing `.graphql` operation files.
- **One Pinia store per domain.** Stores do not import each other — use composables for
  cross-domain logic.
- **i18n from the start.** No hardcoded Russian strings in templates — use `$t('key')`.
- **Virtual scroll for long lists.** Use `ElTableV2` for order history and product lists
  that may exceed 100 rows. Standard `ElTable` only for short static lists.

## GraphQL operations

Operation files live next to the component that uses them:

```
src/pages/catalog/catalog.operations.graphql
src/pages/orders/orders.operations.graphql
```

Codegen picks them up via glob and generates typed composables into `src/api/generated/`.

## Catalog filters

- One filter sidebar for both portals: `MvCatalogFacets` in ui-kit, with one `MvFacetGroup` per facet
  (checkbox rows with an optional icon, first 7 rows, "Show all" expands to a searchable list). Never
  build a portal-local filter block; add the variant to ui-kit.
- Manufacturer is a `manufacturer` Facet whose FacetValue `code` is the ERP manufacturer id
  (`ManufacturerFacetService`). With `SEARCH_BACKEND=external` its counts come from search-service and
  clicks are mapped back to ERP ids in the search plugin. The icon is optional (`iconUrl`); without one a
  letter avatar is shown.
- Category navigation is `MvCategoryNav` + `collectionSlug`, not a facet (the `category` facet is hidden).
- Sort and price filter use Vendure's `SearchInput.sort {name, price}` and `priceRangeWithTax` (minor
  units) on both backends. The shop query `searchCapabilities { sortKeys priceRange }` says what the
  active backend honours; the storefront shows only those sort options and hides the price block
  otherwise. External: search-service sorts/filters by ONE fixed indexed price type, not the customer's
  own tier, so the order can differ from displayed customer prices (per-type indexes: search-platform#161).
  Internal (Elasticsearch): name sort only; its index holds Vendure's own imported list price, not the customer's price-entry price, so price sort/range would mislead. The catalog shows all products (`availableOnly` is always sent explicitly, search-service defaults it
  to true); the in-stock toggle narrows to the viewer's branch. Manager catalog hides the price
  block (its price/in-stock filters are inert). `inStock` IS applied: it narrows search-service to the viewer's branch warehouses
  (`filters.warehouseIds`), and the list shows `SearchResult.stockLevel` (see docs/order-flow.md).
- A request with no query, category or filter (home page, catalog root) is answered from mivend's own
  DB, not search-service: one paginated id query, no facets, ordered by id (so newest-imported products
  do not come first) or by name. search-service
  rejects such a request and has nothing to rank (price sort and a price range are the exceptions, they go
  to search-service). The in-stock filter on the bare catalog is applied in
  that same query (SQL in plugin-reservation's `in-stock-filter.ts`, kept in sync with
  `ReservationAvailabilityService`): only products with an enabled variant whose branch ATP is above 0 in the viewer's warehouses; a viewer with no warehouses gets nothing.
  A branch with no resolvable stock locations likewise gets an empty in-stock list (no fallback to the default stock location, unlike `getAvailableToPromiseBatch`).
- Mobile: no filter sidebar is shown on phones, only search. This is deliberate; do not revisit per page.

## Page priority

1. Login + auth guard
2. Catalog with OEM search
3. Product detail
4. Account (credit limit, price type)
5. Orders history
6. Cart + checkout

## Brand

Brand shown anywhere in the storefront comes from the Shop API `manufacturer { name }` field on
`Product`/`SearchResult` via `brandOf` — not from a `brand` facet (none exists). See
`docs/pricing.md` "Brand / manufacturer".
