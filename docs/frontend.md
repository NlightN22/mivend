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

## Home widgets

"New arrivals", "On sale" and "Popular" take ids from `newArrivalProductIds`, `saleProductIds` and `popularProductIds`
(`popular-products` plugin). A product is offered only when it is enabled, in the channel, in stock at the viewer's
branch warehouses, has a variant with an organization (as in the catalog) and has no variant in a private category
(matched by category slug, as the catalog hides it). The scroll row repeats its list for the endless wrap only when
there are more cards than fit, so short rows show each product once.

## Catalog filters

- One filter sidebar for both portals: `MvCatalogFacets` in ui-kit, with one `MvFacetGroup` per facet
  (checkbox rows with an optional icon, first 7 rows, "Show all" expands to a searchable list). Never
  build a portal-local filter block; add the variant to ui-kit.
- Manufacturer is a `manufacturer` Facet whose FacetValue `code` is the ERP manufacturer id
  (`ManufacturerFacetService`). With `SEARCH_BACKEND=external` its counts come from search-service and
  clicks are mapped back to ERP ids in the search plugin. The icon is optional (`iconUrl`); without one a
  letter avatar is shown.
- Code matches (#307): a query containing an article, part number or manufacturer code returns `SearchResponse.skuMatches / partNumberMatches / manufacturerCodeMatches` (`{ items, total }`, null when empty, disjoint, priority sku > part number > manufacturer code, full-text `items` exclude them). The first page asks each group for up to 100 hits, later pages and facets-only requests ask for 0 items but exact totals; the storefront lists the groups first with a badge, suggestions and the manager portal put them ahead of full-text hits. Both backends serve them: external through search-service, internal through Elasticsearch (`internal-code-matches.*`, `code-match-query.ts`): the index holds separator-stripped lower-case product-level keyword fields (`product-skusNormalized`, `product-partNumberNormalized`, `product-oemCodesNormalized`), exact and prefix hits match on them, each group runs the same filters as the full-text search and excludes the higher-priority kinds. The internal side fills `matchReasons` for article matches only. Existing contours need a full reindex (admin `reindex`) after upgrading, otherwise the new fields are empty. The manager catalog shows the code groups on top of its first page and its counter/pager counts full-text hits only, so a later page never ends up empty. A very short code such as `10` is a prefix query like on search-service, so it can fill the article group up to the 100 cap ahead of full-text hits (same behaviour on both backends, no minimum length). Facet values and collections span the three code groups plus the full-text hits (internal: the `facetUnion` query mode, no code exclusion), so the filter panel and category counts stay populated for an article query.
- Category navigation is `MvCategoryNav` + `collectionSlug`, not a facet (the `category` facet is hidden).
- Sort and price filter use Vendure's `SearchInput.sort {name, price}` and `priceRangeWithTax` (minor
  units) on both backends. The shop query `searchCapabilities { sortKeys priceRange }` says what the
  active backend honours; the storefront shows only those sort options and hides the price block
  otherwise. External: price range and price sort send `priceTypeId` (the viewer's effective `PriceType.externalId`:
  main-contract/assigned type, else the branch default; omitted when it has no externalId, then
  search-service uses its fixed indexed type), so the order follows the displayed tier.
  Internal (Elasticsearch): name sort only; its index holds Vendure's own imported list price, not the customer's price-entry price, so price sort/range would mislead. The catalog shows all products (`availableOnly` is always sent explicitly, search-service defaults it
  to true; `availabilityMode: onHandAndErp` is always sent too, but it only affects the filter and totals when `availableOnly` is true (the provider's `hasAvailableOffer` fields always follow the `status` rule): offer active AND quantity > 0 AND ERP availability missing or > 0, i.e. the "One availability formula" in order-flow.md without allocations, which search cannot know. The internal Elasticsearch backend ignores the mode: it has no ERP availability, so its in-stock filter stays on-hand only, a pinned no-op, real implementation tracked in #177); the in-stock toggle narrows to the viewer's branch. Manager catalog hides the price
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
