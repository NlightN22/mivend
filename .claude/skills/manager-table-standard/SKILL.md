---
name: manager-table-standard
description: Mandatory before adding a new manager-portal list/table, adding or changing a column on an existing one, or touching any Customer*Tab.vue / Customer*DataTable.vue / *Page.vue+*DataTable.vue pair. Checks the table against the project's standard shape (identifying column, search, filters, mobile hints, pagination) so this isn't re-litigated per table.
---

# Manager portal table standard

This is the single canonical checklist for what a "done" manager-portal list/table looks like in
this project. Reference implementations: `CustomerOrdersTab.vue` +
`CustomerOrdersDataTable.vue` (packages/manager/src/components/customers/) — the fullest-featured
example — and `CustomerInvoicesTab.vue`/`CustomerPaymentsTab.vue` + their `*DataTable.vue` for a
simpler shape. Read one of these before implementing a new table if you haven't already.

Apply this checklist any time you: add a brand-new table, add/change a column on an existing
`MvAdvancedDataTable`-based table, or migrate an older `MvTable`-based table to
`MvAdvancedDataTable`. It applies regardless of whether the table lives under a customer-detail
tab or a top-level `*Page.vue`.

## The standard shape

1. **One identifying/required column with a real toolbar search box bound to it.**
   Every table has exactly one column that's the table's own natural identifier (an order #,
   invoice #, payment #, discount #, invoice number — whatever a human would actually search for
   first). That column:
    - is declared `required: true` in its `AdvancedDataTableColumn` (never hideable via the column
      toggle),
    - has a real `filterConfig` (usually `{ type: 'text', placeholder: '... contains…' }`),
    - is wired as the table's `:search="{ filterKey: '<field>', placeholder: 'Search …' }"` prop on
      `MvAdvancedDataTable`, giving a toolbar search box in addition to the column's own funnel
      filter (see `CustomerInvoicesDataTable.vue`'s `number` column for the minimal example, or
      `CustomerOrdersDataTable.vue`'s `code` column).

2. **Base column order: identifying number first, creation date second**, before any other
   column. If the entity has no exposed creation date yet, add one (`createdAt: DateTime!` on the
   GraphQL type — every entity extending `VendureEntity` already has the DB column, so this is
   usually a schema-only change, see `Invoice.createdAt`/`PaymentAttempt.createdAt` in
   `plugin-acquiring`'s `admin.schema.ts`; a hand-assembled return object like
   `DiscountGrantForCustomer` needs the field copied across explicitly too, see
   `discount-grant.service.ts`'s `findForCounterparty`). Every other column comes after these two,
   in whatever order makes sense for that table. `mobile: { primary: true }` still goes on the
   number column only (point 5 below) — the date column has no special mobile hint by default.

3. **Every filter shown in the UI must be backed by a real server-side (or, for a justified
   bounded/exempt list, real client-side) filter — never a funnel icon with nothing behind it.**
   Before adding `filterConfig` for a column, confirm the backend query actually supports
   filtering by it (a `search`/`status`/whatever arg on the GraphQL query, applied in the
   resolver/service — see `PaymentListOptions.search`, `plugin-acquiring`'s
   `payment-attempt.service.ts`, for the pattern: `payment.number ILIKE :search`). If the
   backend doesn't support a filter yet and the column genuinely needs one to meet this standard,
   **add the backend support as part of the same change** (schema field + resolver/service filter
    - a unit test per the `test-design` skill) — don't ship a filter icon that silently does
      nothing, and don't skip the filter just because backend work is required.
      A `filterConfig: { type: 'none' }` is only correct for a column the backend genuinely cannot
      filter by (state that clearly, in a code comment, same as `CustomerInvoicesDataTable.vue`'s
      `amount`/`order` columns) — not as a default for "haven't checked yet."

4. **A status/enum-shaped column gets a `status`-type filter with real badge variants**, driven by
   a single-source-of-truth `*_BADGE_VARIANT` map in the relevant `api/*.ts` file (AGENTS.md's
   ui-kit rule) — never a plain unstyled `<select>` for something that renders as a colored badge
   in the cells.

4a. **A quick-filter "view chip" row above the table (the segmented All/Unpaid/Partially paid/…
pills — see `CustomerOrdersTab.vue`'s `#view-chips` slot) that represents the same states as a
colored row badge must reuse `@mivend/ui-kit`'s `MvFilterChips` with each chip's `variant` set
from that same `*_BADGE_VARIANT` map from point 4 — never a bespoke `<button>` + scoped CSS in
the page/tab component (that's both a duplicate of `MvFilterChips` and an AGENTS.md ui-kit
rule violation), and never a chip row that's always green-when-active regardless of what it
represents. Real incident this fixes: `CustomerOrdersTab.vue`'s and
`CustomerInvoicesTab.vue`'s view chips each had their own bespoke button styling that only
ever went green on selection, while the row badge one column over for that exact same status
could be neutral/warning/danger — "Unpaid" and "Cancelled" looked identical in the chip row
despite being different colors in the table. See `MvFilterChips.vue`'s own doc comment and
`CustomerOrdersTab.vue`/`CustomerInvoicesTab.vue`'s `VIEWS`/`viewChips` for the reference
shape. A chip with no corresponding status color (e.g. "All") just omits `variant`.
Each chip's count comes from a real lean server COUNT (`options: { take: 0 }`, one GraphQL
request with an alias per chip — see `api/invoices.ts`'s `fetchInvoiceViewCounts`,
`api/customers.ts`'s `fetchCustomerOrderViewCounts`/`fetchDiscountGrantViewCounts`,
`api/payments.ts`'s `fetchPaymentViewCounts`), never a count derived client-side from
whatever page happens to be loaded (that's the same "fetch everything, compute in JS"
antipattern AGENTS.md's Pagination section forbids, just applied to a count instead of a
list).
**If the status enum has more than ~5-6 values, curate the chip set instead of one chip per
enum value\** — a chip row isn't a replacement for the column's own status filter dropdown,
it's a handful of the most operationally relevant shortcuts. `CustomerPaymentsTab.vue` is the
reference for this: `PaymentAttempt.paymentStatus` has 10 values, but the chip row only
surfaces All/Captured/Pending/Failed/Refunded (`fetchPaymentViewCounts`'s own doc comment) —
the rest stay reachable through the table's own status column filter. `CustomerDiscountsTab.vue`
is the reference for the opposite case: only 3 real statuses, so every
`DISCOUNT_GRANT_STATUS_OPTIONS` value gets a chip, no curation needed. Don't default to "all
values" just because it's less thinking — a chip row with 8+ options is exactly the "pestrit"
(visually noisy, rainbow-of-colors) result this pattern exists to avoid.
`MvFilterChips` itself has no external margin (by design — see its own doc comment): when it
sits inline in `MvAdvancedDataTable`'s `#toolbar-start` slot next to the search box (this
table shape), no extra spacing is needed since the toolbar row is already
`align-items: center`; a page that renders it as its own standalone block above a table (e.g.
`DiscountsPage.vue`) adds the spacing itself at the call site. Real incident this fixes: an
earlier version of `MvFilterChips` had a baked-in `margin-bottom`, which — once the component
started being used inline in the toolbar too — visibly pushed the chips upward relative to the
search box, because `align-items: center` centers a flex item's *margin box\*, and a one-sided
bottom margin shifts the visible content off-center within it.

5. **Every column gets a deliberate `mobile` hint**, not a default/omitted one:
    - exactly one column (the identifying number, point 1) is `mobile: { primary: true }`,
    - at most one status-shaped column is `mobile: { badge: true }`,
    - a column that's genuinely desktop-only (e.g. redundant with what's already on the card, or
      low-value on a small screen) is `mobile: { hidden: true }`,
    - everything else renders as a normal label/value pair on the card by default — that's fine,
      but it should be a conscious choice, not an oversight. See
      `MvAdvancedMobileCardList.vue`/`advancedDataTableTypes.ts` in `@mivend/ui-kit` for the hint
      shape, and `CustomerOrdersDataTable.vue`'s `ALL_COLUMNS` for a full worked example with all
      three hints in use.

6. **Server-side pagination unless the list is genuinely, structurally bounded** — see AGENTS.md's
   "Pagination" section for the exemption test (a fixed small set vs. anything that accumulates
   over the business's lifetime). If a table is exempt, say so explicitly in a code comment (see
   `CustomerDiscountsTab.vue`'s doc comment on `DiscountGrantResolver`) — don't let "no pagination"
   be silently indistinguishable from "forgot pagination." An exempt table still uses
   `MvAdvancedDataTable` for its rendering/mobile-card-view/visual consistency; it just doesn't
   need real `skip`/`take` wiring behind it.

7. **URL query-string sync for filters/sort/page** — see AGENTS.md's manager-portal rule and
   `useUrlSyncedState` (`packages/manager/src/composables/useUrlSyncedState.ts`). A table that's
   exempt from pagination (point 6) is not automatically exempt from this — if it has real filters
   a user would want to share/bookmark, sync them too.

8. **`page`/`pageSize` props threaded through correctly.** `MvAdvancedDataTable` requires a `page`
   prop (used by its built-in mobile card view's own pagination — see
   `MvAdvancedMobileCardList.vue`) even though the desktop `<DataTable>` tracks its own paginator
   cursor internally; don't forget to pass it from the owning `*Tab.vue`/`*Page.vue` down through
   the `*DataTable.vue` wrapper.

## Procedure

1. Identify the table's identifying column and confirm point 1 above.
2. Confirm point 2 above (number, then creation date, first) — add `createdAt` to the entity's
   GraphQL type if it isn't exposed yet.
3. For every column that should have a filter (per what the page's UI is supposed to let a user
   do), check the backend actually supports it — grep the resolver/service for the corresponding
   query arg. If missing, plan the backend change now, not as a follow-up.
4. Check every column has a deliberate `mobile` hint (or a deliberate absence of one). If the
   table has view chips above it, confirm they reuse the row badge's `*_BADGE_VARIANT` map (point
   4a) instead of a bespoke color/style.
5. Confirm pagination is either real (server `skip`/`take`) or explicitly exempted with a comment
   explaining why, per AGENTS.md's bounded-list test.
6. Confirm filter/page state is URL-synced if the table has real, user-facing filters.
7. If any backend change is needed, run the `test-design` skill for it before writing code.
8. Implement, then run the `final-check` skill (`make lint` + `make test`, plus
   `pnpm --filter './packages/plugins/**' build` if a plugin changed) before reporting done.
