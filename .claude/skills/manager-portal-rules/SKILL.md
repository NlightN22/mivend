---
name: manager-portal-rules
description: Rules specific to packages/manager (the B2B/backoffice manager portal) — URL query-string sync for filters/sort/page, mobile tab-bar overflow collapse, scoped toolbar search, out-of-order-response guarding for reactive fetches. Read alongside the frontend-rules skill (common ui-kit rules) whenever working in packages/manager. For tables specifically, manager-table-standard is the authority.
---

# Manager portal rules

Read the **`frontend-rules`** skill first (common ui-kit conventions shared with
`packages/storefront`) — this skill covers what's specific to the manager/backoffice portal. For
building or restyling a table, **`manager-table-standard`** is the authority and takes precedence
over anything below that overlaps with it.

1. **Every page with search/filter/sort/pagination controls must sync that state to the URL
   query string, bidirectionally.** On mount, read initial filter values from `route.query`
   (via `useRoute()`); on every filter change, write them back via `router.replace({ query })`
   (use `replace`, not `push`, so filter tweaks don't spam browser history — only real
   navigation should create a history entry). The goal: any filtered/sorted/paginated view is a
   shareable link that reproduces exactly what the sender was looking at — "send me the
   overdue orders for branch X" should be a URL, not a screenshot with verbal instructions.
    - **A one-off mount-time read of a single param (e.g. reading `?search=` once to prefill a
      field, or `?unassigned=true` to preselect a filter) is not compliant** — it's one-way and
      silently drops every other filter field, and typically doesn't even survive the _user's
      own_ subsequent filter changes back into the URL. Real compliance is symmetric: every
      filter field that has a value is reflected in the query string, and every filter field
      supported by the query string is restored on load.
    - Applies to search inputs, status/enum selects, manager/branch/department pickers, chip
      filters, sort column/direction, and the current page number — not to transient UI-only
      state (e.g. a form being open, a hover state).
    - See issue tracking the page-by-page rollout of this rule (existing pages predate it and
      need retrofitting one at a time) for the current status per page.

2. **A tab bar must never be a plain unwrapped flex/scroll row once it holds more than ~4-5
   tabs on a mobile viewport.** Industry consensus (Material Design 3, Apple HIG, and general
   mobile nav UX guidance) puts the practical ceiling at 4-6 tabs before touch targets get
   cramped or the row stops fitting — past that, collapsing extra tabs behind a "More" control
   is the standard fix, not a wider/scrollable bar. Real incident: `CustomerDetailPage.vue`'s
   7-tab row (Overview/Orders/Invoices/Payments/Discounts/Documents/History) had no
   `overflow-x` handling at all, so on a narrow mobile viewport the overflowing buttons
   stretched the _entire document_ horizontally — which, combined with `position: fixed` on
   `MvAppMobileNav`, dragged the app's bottom navigation bar out of the visible viewport
   entirely. A horizontally-scrollable row with edge-fade affordance (the pattern already used
   by `MvKpiCarousel`) fixes the document-overflow bug but doesn't fix the underlying UX
   problem — a scrollable row with no visible affordance is easy to miss, and 7 tabs is past
   the point where scrolling is the right answer anyway.
   **Fix pattern**: keep the 3-4 most-used tabs visible, collapse the rest into a "More ▾"
   control that opens a small dropdown menu — the same primary/overflow split
   `DefaultLayout.vue` already uses for the mobile bottom nav (5 slots + a "More" sheet for
   everything else). **This collapse is mobile-only** — desktop has room to show the full row,
   so gate it on the same `max-width: 800px` breakpoint `MvAppTopbar`/`MvAppMobileNav` already
   use (via a `window.matchMedia` listener, not a CSS-only `display:none` trick, since which
   tabs are "primary" vs "overflow" changes what actually renders, not just what's visible) —
   collapsing on desktop too was an early mistake in the reference implementation, caught by
   the developer noticing "More" showing up in the normal desktop view where all 7 tabs fit
   comfortably in one row. See `CustomerDetailPage.vue`'s `primaryTabs`/`overflowTabs`/`isMobile`
   for the reference implementation — `team/TeamPage.vue`'s department tabs follow the same
   shape (`primaryDepartments`/`overflowDepartments`), replacing an earlier `flex-wrap: wrap`
   row that avoided the overflow bug but didn't match this pattern. That makes **two** inline
   copies; if a third page needs this same pattern, extract it into a shared `ui-kit` component
   instead of copying the markup a third time (per the ui-kit "single source of truth" rule
   above) — two concrete instances isn't quite enough yet to know the right generic shape
   (fixed enum of tabs vs. a dynamic list like departments), so a bespoke component would still
   be premature.

3. **A list page's toolbar search box defaults to searching only that list's own non-hideable
   identifying column** (e.g. `Order #`/`code` for orders, an invoice number, a payment
   reference) — never silently promise cross-column search the backend doesn't do. Concretely:
   that column is declared `required: true` in the table's own column config (never hideable via
   the column-toggle), and the search input is wired to that one column only. Real, full
   multi-column search (matching against status/state/payment/etc., not just the identifier) is
   a deliberate per-table opt-in — each list's own DB columns and enum/label mapping need their
   own backend query change (an `OR` across real columns, pushed into SQL per the pagination rule
   above — never "fetch everything, filter client-side") — and is out of scope until requested
   for that specific list. See `CustomerOrdersDataTable.vue`'s `CODE_COLUMN` for the reference
   shape.

4. **Any reactive-params-driven fetch (page/filter/sort change → refetch) must guard against an
   out-of-order response overwriting fresher state — use `useLatestRequest` (`@mivend/ui-kit`),
   never a bare `async function load() { ... }` with no ordering guard.** Real incident: neither
   `CustomerOrdersTab.vue` nor `CustomerInvoicesTab.vue` had this originally — PrimeVue's paginator
   doesn't disable itself while a page fetch is in flight, so a second page-change click (or just
   real network latency through a VPN/proxy, which a local `localhost` dev loopback never
   surfaces) can start a second fetch before the first one's response resolves; whichever response
   arrives _last_ wins by default, not whichever was requested last, so a user could see "page 2"
   showing page 3's rows with page 3 itself empty. `useLatestRequest(fetcher, onResult)` returns
   `{ loading, run }`: `run()` is what a `watch([...deps], () => void run())` should call, and only
   the _latest_ call's result is ever applied — a stale response is silently discarded, not
   applied. If a fetch needs a second `await` afterward (e.g. Orders' per-page payment-summary
   lookup), fold it into the same `fetcher` function as one atomic unit — a second, independent
   `await` performed outside `fetcher` (e.g. inside `onResult`) is not covered by the guard.
   This is a "latest-wins" guard, not true cancellation — it doesn't abort the stale network
   request itself (this project's `adminApi` client has no `AbortSignal` support to cancel
   through yet); adding that would be the more complete fix if wasted stale requests become a
   real cost, not just a correctness bug.
