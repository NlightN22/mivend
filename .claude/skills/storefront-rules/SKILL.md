---
name: storefront-rules
description: Rules specific to packages/storefront (the customer-facing client portal) — thin pages, codegen-only GraphQL, i18n, virtual scroll, one Pinia store per domain. Read alongside the frontend-rules skill (common ui-kit rules) whenever working in packages/storefront.
---

# Storefront rules

Read the **`frontend-rules`** skill first (common ui-kit conventions shared with `packages/manager`)
— this skill covers what's specific to the customer-facing storefront. Full architecture:
`docs/frontend.md`.

1. **Pages are thin.** No business logic in `pages/` — all logic goes to composables or stores.
   A page component should only compose: layout + components + store calls.

2. **Never edit `src/api/generated/`** — it is overwritten by codegen on every run.
   Run `pnpm --filter @mivend/storefront codegen` after changing `.graphql` operation files.

3. **All GraphQL operations must be typed via codegen.** Raw string queries with hand-written
   types are forbidden. Every query/mutation lives in a `.graphql` file next to the page or
   component that uses it.

4. **No hardcoded UI strings in templates.** Use `$t('key')` from vue-i18n.
   All strings are defined in `src/i18n/ru.ts`.

5. **Virtual scroll for long lists.** Use `ElTableV2` for any list that may exceed 100 rows.
   Standard `ElTable` only for short static lists (e.g. cart items).

6. **One Pinia store per domain.** Stores do not import each other.
   Cross-domain logic belongs in a composable, not in a store.
