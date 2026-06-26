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

## Page priority

1. Login + auth guard
2. Catalog with OEM search
3. Product detail
4. Account (credit limit, price type)
5. Orders history
6. Cart + checkout
