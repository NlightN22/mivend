---
name: dashboard-extension-rules
description: Mandatory workflow for adding or changing anything under @vendure/dashboard (native Vendure Dashboard, packages/dashboard) — a new page, alert, or nav item registered via a plugin's `dashboard:` entry point. Covers the required file layout, the plugin-discovery dev-restart gotcha, what to test vs. what to verify live, and the mandatory visual audit before calling it done. Read before touching anything under apps/server/src/dashboard/ or any `*-dashboard.plugin.ts`.
---

# Vendure Dashboard extension rules

`@vendure/dashboard` is a separate standalone React app (`packages/dashboard`, its own Vite dev
server per contour — local `:5175`, staging-integration `:5185`) mounted at `/admin`'s successor,
not the manager portal. A plugin bolts a page/alert/nav-item onto it via a `dashboard: '<path>'`
entry in its `@VendurePlugin({...})` decorator, pointing at a file that calls
`defineDashboardExtension({...})`.

## Required layout

Mirror the existing extensions (`system-health`, `branch-consolidation`,
`default-superadmin-account`, `integration-health`) exactly:

```
apps/server/src/dashboard/<name>/
├── index.ts              # defineDashboardExtension({ alerts, routes })
├── <name>-page.tsx        # React page component, if the extension has a page (not alert-only)
└── <pure-logic>.ts        # plain TS, no React/Vendure imports — the actual derivation logic
apps/server/src/<name>-dashboard.plugin.ts   # tiny, logic-free @VendurePlugin pointing at index.ts
```

**Why this sits under `apps/server/src`, not `packages/plugins/*`**: `@vendure/dashboard`'s
static plugin-discovery step (an AST scan for a compiled `dashboard: '...'` decorator property)
cannot see a pnpm-workspace-symlinked package's dashboard extension — it classifies any symlinked
local package as "local" and never actually feeds it through the compile step needed to discover
the extension. A real relative import from `apps/server/src/vendure-config.ts` is what makes
discovery work. Confirmed via a manual AST-walk during issue #76 — don't re-litigate this by
trying `packages/plugins/*` again for a new extension; put it here.

**The `*-dashboard.plugin.ts` file has zero logic** — its only job is
`dashboard: './dashboard/<name>/index.ts'` in the decorator, so `@vendure/dashboard`'s scanner
has something to find. Register it in `apps/server/src/vendure-config.ts`'s `plugins` array
alongside the others.

## Separate pure logic from React glue — and test only the pure logic

`index.ts`/`<name>-page.tsx` are thin: data fetching (`api.query(...)`), rendering, and wiring
into `defineDashboardExtension`. Any actual decision logic — what counts as "missing", a
threshold check, grouping/aggregating rows, an alert's `shouldShow`/`severity` derivation — goes
in its own plain `.ts` file with no React/`@vendure/dashboard` imports, exactly like
`system-health-check.ts`'s `buildSystemHealthChecklist`/`getMissingChecks` or
`kafka-lag.resolver.ts`'s `groupLagRowsByTopic`. **Unit-test that file.** Do not attempt to unit-
test the React component or the `defineDashboardExtension` call itself — there is no existing
test harness for that in this repo, and building one is out of scope for a single extension.

An alert's `check()` must fail closed (return the "nothing to report" value, e.g. `[]`/`-1`/
`false`) inside a `try/catch` — a viewer lacking the underlying query's permission, or a
transient network error, must never crash the whole `<Alerts>` shell for every other extension.

## Mandatory: one actionable alert per action, never a bundled checklist

If an alert's fix is "go do N different, independently-actionable things" (create a Zone, create
a Tax Category, enable a Payment Method, ...), register **N separate `DashboardAlertDefinition`s**,
each with its own `actions` entry linking straight to the page that fixes that one thing — never
one alert whose `title`/`description` lists multiple unrelated missing items as a comma-joined
string with no link at all. A viewer reading "System configuration incomplete: At least one Zone,
At least one Tax Category, ..." has to go figure out where each of those lives; a viewer reading
"No Tax Category defined yet" next to an "Add a Tax Category" button does not.

**This is not "unjustified duplication" under AGENTS.md's no-excess-code rule** — each item is a
distinct action leading to a distinct destination page, which is exactly the kind of difference
that justifies a separate unit (AGENTS.md's own "modularity first": _"if something can be a
separate file/unit, it should be"_). Bundling them saves a few lines of `index.ts` at the cost of
making every one of them non-actionable — that trade is backwards. `system-health/index.ts`
originally did this (`systemHealthAlert`, one alert covering 6 conditions) citing that same rule
incorrectly; issue #140 split it into 6 standalone alerts (`zoneMissingAlert`,
`taxCategoryMissingAlert`, `taxRateMissingAlert`, `defaultTaxZoneMissingAlert`,
`shippingMethodMissingAlert`, `paymentMethodMissingAlert`) as the reference implementation — each
with its own tiny GraphQL probe query, its own pure predicate in `system-health-check.ts`
(`isZoneMissing`, `isTaxCategoryMissing`, ...), and its own `actions: [{ label: 'Add a Zone',
onClick: () => window.location.href = '/zones' }]`-style link to the exact settings page.

Two shapes, depending on what the alert is actually about:

- **One entity instance is missing/misconfigured** (a Zone, a Branch, a channel's default tax
  zone): link straight to the page that creates/edits it — `branch-consolidation`'s "Add a
  branch" → `/branches`, or `system-health`'s `defaultTaxZoneMissingAlert` → `/channels/${channelId}`
  (built from data the `check()` already fetched, not a static route, since which channel is
  "active" is itself data).
- **Many homogeneous rows need attention** (e.g. "12 products have no ERP VAT code mapped"): if
  the destination list page supports a filter that isolates exactly those rows, link to that
  filtered URL (a query string on the list route) rather than the unfiltered list — the viewer
  should land already looking at the rows that need fixing, not need to re-derive the filter
  themselves. If no such filter exists, link to the plain (unfiltered) list page — that's still
  strictly better than no link, but don't invent a query param the list page doesn't actually
  support.

Only bundle multiple conditions into one alert when they are genuinely **one action with one
destination** (e.g. "review N flagged items on this one review page") — the split is about
distinct _destinations_, not an arbitrary cap on how many conditions one alert may summarize.

## Mandatory: any one-time client-side data load MUST live in `useEffect`, never in the render body

A real, live incident: `if (someList.length === 0) { void loadSomeList(); }` written directly in
a page component's render body (not inside `useEffect`) fires again on every re-render that
happens before the async call's `setState` lands — and a component re-renders more than once
before that for reasons that have nothing to do with this code (`ListPage`'s own pagination/
filter/sort state changes, a sibling `useState` update, React itself re-rendering speculatively).
The result was a request storm: the same lookup query fired 10+ times back to back, starving the
browser's connection pool and stalling the page's _real_ list query behind it — visible live as a
long stuck skeleton loading state, then a batch of cancelled/"blocked" requests in the Network
panel, which looks exactly like a slow backend/timeout problem and is not one.

**No ESLint rule in this repo catches this** — `eslint-plugin-react-hooks` isn't installed here,
and even where it is, its `exhaustive-deps` rule only checks dependency arrays _inside_ a
`useEffect`/similar hook call; it has nothing to say about a plain function invoked straight in
the render body, which is syntactically ordinary, side-effect-free-looking JS with no hook
involved at all. This is a manual review item, not a lint failure:

- Any `if (x.length === 0) { voidSomeLoader(); }`-shaped one-time data load in a component body
  MUST be wrapped in `useEffect(() => { ... }, [])` (or a real dependency array if it should
  legitimately re-run) — never called bare in the render body, guarded or not.
- During the mandatory live visual audit below, actually look at the Network panel's request
  count for each distinct one-time query while the page first loads — don't just eyeball "a lot"
  vs "not a lot", count it, and expect one of exactly two numbers depending on which contour you
  are checking:
    - **Dev contour (`make dev`/`make dev-staging-integration`'s Vite dev server)**: exactly **2**
      firings per query. React's `StrictMode` (dev-only, on by default in `@vendure/dashboard`'s
      own app shell) deliberately double-invokes effects to surface exactly this class of bug — a
      correctly-`useEffect`-wrapped one-time load fires twice here, not once, and that is correct,
      not a regression to chase.
    - **Production build (`make preview-up`/a real deployed container)**: exactly **1** firing per
      query. `StrictMode`'s double-invoke is a dev-only diagnostic aid and does not happen in a
      production build — if a production build still shows 2+ firings of the same one-time query,
      that IS a real bug (the render-body antipattern above, or a missing/wrong dependency array),
      not "expected dev behavior leaking through."
    - Any count other than these two exact numbers for the contour you're checking — in particular
      anything in the double digits — is the request-storm bug above, confirmed live once already
      on this exact page (10+ firings) before the `useEffect` fix.

## Mandatory: any tabular/list page MUST use the native `ListPage` framework component

Every native Dashboard list screen (`Administrators`, `Roles`, **`Sellers`** — see reference
below, `Products`, ...) is built on `@vendure/dashboard`'s own `ListPage` component
(`@/vdb/framework/page/list-page.js`), not a hand-rolled `useState` + `api.query` fetch loop. It
is the single source of every "standard list screen" UI element a reviewer/user will expect by
habit — you do not get to skip pieces of it or reinvent your own subset:

- A **search input + funnel filter icon + bookmark icon** row directly under the title — this is
  `ListPage`'s own faceted-filter UI, not something a page builds itself. If your page has no
  visible filter row, it is not using `ListPage` correctly (or at all) — this exact gap was
  flagged by the user comparing our custom pages against the native `Roles` screen: the filter
  _icon_ alone with no filter _row_ under it means the page skipped `ListPage`'s real filtering
  wiring.
- **Sortable, resizable, show/hide-able columns** with a column-visibility toggle — configured via
  `customizeColumns`/`additionalColumns`/`defaultColumnOrder`/`defaultVisibility`, never a
  fixed hand-written `<TableHeader>` row.
- **Pagination footer** ("Rows per page", "Page N of M", prev/next) — automatic, tied to the
  `listQuery`'s `PaginatedList` shape (`items`/`totalItems`).
- **Bulk actions** (row checkboxes + an actions bar that appears once ≥1 row is selected) via the
  `bulkActions` prop — e.g. delete.
- The **"+ New X" button's standard position** (top-right of the title, blue/primary variant,
  `PlusIcon` + label) is a child `<ActionBarItem itemId="create-button" requiresPermission={[...]}>`
  of `<ListPage>` — not a bespoke button placed wherever felt natural on the page.

**Reference implementation — read before writing any new list page:** `Sellers`
(`node_modules/@vendure/dashboard/.../app/routes/_authenticated/_sellers/sellers.tsx`, and its
sibling `sellers.graphql.ts`/`components/seller-bulk-actions.tsx`). It's deliberately the
smallest complete example (one column, no custom cell logic beyond a name link, one bulk action)
— use it as the literal shape to copy for a new page's skeleton, then add columns/customization on
top the way `administrators.tsx` (same directory tree, `_administrators/administrators.tsx`) does
for a busier list. Both ship in `node_modules/@vendure/dashboard`, so they're always available to
read directly, not just from memory.

**Existing non-compliant pages in this repo — legacy, do not copy their table/list code:**
`branches-page.tsx`, `erp-reconciliation-page.tsx`, `organizations-page.tsx`,
`integration-health-page.tsx` all hand-roll `useState` + `api.query` + a manually-built
`Table`/`TableRow` instead of `ListPage` — none of them has the standard filter row, column
visibility, or bulk-actions. They predate this rule. **Do not use them as a reference for a new
list-style page** — only their non-list bits (a single-metric summary panel, a create-only form
with no list of existing records) are still legitimate hand-rolled layout, built on `Page`/
`PageLayout`/`PageActionBar` (from `../layout-engine/page-layout.js`), never `ListPage`. If you
are touching one of these files for an unrelated reason and it's a real list of records (e.g.
`branches-page.tsx`'s branch list), migrating it to `ListPage` while you're in there is
encouraged, not required — but a **new** page must use `ListPage` from the start, no exceptions,
for any screen whose core content is a list of records with more than a handful of rows.

## Mandatory: never redeclare an auto-generated column via `additionalColumns`

If the list item type implements `Node` (required anyway — see the backend note below), `ListPage`
auto-generates a column for **every plain scalar field** on it, using the field name as the column
key. A field you also want to customize (a link, a formatted value, a fallback for null) must go
in **`customizeColumns`** (overrides the auto-generated column in place), never
**`additionalColumns`** (always adds a _second_, separately-keyed column). Putting a real scalar
field name (e.g. `shortName`, `inn`, `departmentId`) into `additionalColumns` produces two React
children with the same key — a duplicated column visible on screen, plus a
`Warning: Encountered two children with the same key` console error. This is not hypothetical —
it has shipped twice in this repo (`pending-erp-users-page.tsx`'s `departmentId` column, and
`counterparty-list-page.tsx`'s `shortName`/`inn`/`priceType` columns, both live incidents). Only a
key that matches **no** real field on the type (a synthetic column like `actions`, or a derived
one like `manager`/`branch`/`status` whose key deliberately doesn't match the underlying
`assignedManagerId`/`branchId`/`linkedCustomerId` field name) belongs in `additionalColumns`.

Before writing `additionalColumns`, check every key against the GraphQL type's actual field list
(the backend schema, not just the page's own fragment) — if a key is also a real field name on
the type, it goes in `customizeColumns` instead, full stop.

## UI: use `@vendure/dashboard`'s own components first, never raw HTML/inline styles

`@vendure/dashboard` re-exports a full set of themed UI primitives built on its own design
tokens — `Table`/`TableHeader`/`TableRow`/`TableHead`/`TableBody`/`TableCell`, `Button`, `Input`,
`Badge`, and more (grep `node_modules/@vendure/dashboard/src/lib/components` for the full list
before assuming one doesn't exist). **Always reach for these first, exactly like a page in this
repo already using them (e.g. `erp-reconciliation-page.tsx`) — never hand-roll a bare `<table>`/
`<div>`/`<button>` with inline `style={{ ... }}` objects or made-up hex colors, and never invent
your own Tailwind utility soup as a substitute for a component that already exists.**

- A raw `<table>` with `style={{ padding: '6px 0' }}` on every cell has no real column model —
  no shared row height, no consistent horizontal gap between columns, no responsive behavior.
  Real incident: `organizations-page.tsx`'s first version did exactly this — cells had _only_
  vertical padding, so a monospace ERP-id GUID column visually ran into the adjacent Legal-name
  column with no gap at all. The fix was not "add more inline styles" (a second bad attempt
  tried hardcoded percentage column widths via `<colgroup>`, which is inflexible and still not
  what any other page in this codebase does) — it was replacing the whole hand-rolled table with
  `@vendure/dashboard`'s own `Table`/`TableRow`/`TableCell` components, matching
  `erp-reconciliation-page.tsx`'s existing pattern exactly. Those components already carry
  correct, consistent per-cell padding and a stretchable (not fixed-percentage) column layout
  out of the box — there was nothing left to hand-tune.
- Inline hex colors (`color: '#666'`, `background: '#111827'`) also silently break dark mode —
  they don't track the admin theme's CSS variables, so a page that "renders" in a quick check can
  look visibly wrong (wrong contrast, mismatched background) the moment a viewer's theme differs
  from whatever the author's browser happened to be in. Use the component's own variant props
  (`<Badge variant="secondary">`, `<Button variant="outline">`) or the theme's own Tailwind
  utility classes (`text-muted-foreground`, `text-destructive`) instead — both are already wired
  to the same design tokens as the rest of the app, including `packages/dashboard`'s dedicated
  `extension-tailwind.css` build that makes these classes available to extension source files.
- Only fall back to a bare HTML element with your own styling if you've actually checked
  `@vendure/dashboard`'s component exports and confirmed nothing fits (rare) — and if so, prefer
  Tailwind utility classes tied to the theme's tokens over inline `style={{ ... }}` hex values,
  same reasoning as above.
- This applies to every new page/alert action, not just tables — buttons, inputs, form layout,
  status indicators. `erp-reconciliation-page.tsx` is the fullest current reference for the
  pattern (`Button`, `Input`, `Table`, `Badge` together); `branches-page.tsx` and
  `integration-health-page.tsx` both predate this rule and still use raw HTML — don't copy their
  styling, only their data-flow shape (see "Required layout" above), and feel free to fix either
  to match this rule if you're touching it anyway.

## Mandatory dev gotcha: plugin-discovery is scan-once, not watched

`@vendure/dashboard`'s Vite dev server scans every plugin's `dashboard:` path **once, at that
process's own startup** — it is not part of the file-watch/HMR loop. Concretely:

- **Creating a brand-new extension file, or renaming/moving an existing one**, is invisible to an
  already-running dashboard Vite process. It keeps requesting the _old_ path, gets a 404, and the
  whole app renders blank (no error banner — just an empty page, sometimes stuck on the loading
  spinner). A browser hard-reload does **not** fix this — the stale state is server-side, in the
  Vite process, not the browser.
- **Editing the _contents_ of an already-discovered file** (no rename) is fine — normal Vite
  HMR/module reload picks it up live, no restart needed.
- **Restarting `apps/server`'s `main.ts`/`worker.ts` does not fix this either** — the dashboard
  Vite server is a completely separate process/port per contour. You must restart _that specific
  contour's_ `packages/dashboard` dev server:
  `     # find it: ss -ltnp | grep <port>   (5175 local, 5185 staging-integration)
    # kill that PID, then restart with the exact same env it was launched with, e.g.:
    pnpm --filter @mivend/dashboard dev                                    # local
    VITE_API_TARGET=http://localhost:3010 VITE_PORT=5185 \
      pnpm --filter @mivend/dashboard exec vite --mode staging-integration # staging-integration
    `
  Confirm the restart actually picked up the new extension by checking its own startup log line:
  `Analyzed plugins and found N dashboard extensions` / `Found N plugins (N active in runtime
config): <YourNewPlugin> (local), ...` — if your plugin isn't named there, the restart didn't
  take (wrong process killed, or a build/compile error upstream) and the page will keep 404ing.
- Per the `dev-environment` skill's rules: this is the one narrow, legitimate case for
  restarting a single component's dev process directly instead of a full `make dev` cycle — do
  it, verify, and don't touch anything else (Docker infra, the other contour, `apps/server`).

## Mandatory: live visual audit before calling the extension done

A green `make lint`/`make test`/`tsc --noEmit` proves the code compiles and the extracted pure
logic is correct — it proves nothing about whether the page actually renders in the real
Dashboard app, and the scan-once gotcha above means it is entirely possible to ship code that
type-checks perfectly and still 404s live. Before reporting a dashboard extension as finished:

1. Confirm the target contour's `packages/dashboard` Vite process actually discovered the new/
   renamed extension (the startup log line above).
2. Load the page for real, authenticated, through the actual contour you're verifying (local or
   staging-integration) — either the `check-page` skill's script for a quick unauthenticated
   smoke check (won't get past the login screen, but catches a hard crash/404 on the shell
   itself), or a throwaway authenticated Playwright script (log in via the real
   `login` GraphQL mutation to get a session cookie, `context.addCookies(...)`, navigate, assert
   on rendered text/screenshot) for anything gated by login — which every real dashboard page is.
   **Delete the throwaway script afterward** — it's a debugging aid, not a repo artifact (no
   ad hoc `.mjs` files left under `packages/e2e/` or elsewhere).
3. Actually look at the screenshot/rendered text — an empty `bodyTextPreview` with no console
   errors can mean "healthy pre-login spinner" (normal) or "crashed silently" (not normal);
   distinguish the two by checking for `consoleErrors`/`networkErrors`/`requestFailures` in the
   check output, not just whether navigation itself succeeded.
4. For any list page, capture **all** console output (`type() === 'error'` AND `'warning'`), not
   only hard errors, and read it — React logs a duplicate-column key clash (see the
   `additionalColumns`/`customizeColumns` rule above) as a `console.error`-level warning, not a
   thrown exception, so it never surfaces as a `navError`/crash and is trivial to miss if you only
   check "did the page render some data." A row of data appearing on screen is not proof the page
   is correct — open the screenshot and count the columns against what you actually declared.
5. If the extension is gated by a `CustomPermission` (via the underlying GraphQL query's
   `@Allow(...)`), verify with a real account that actually holds that permission — a page that
   "renders" but silently shows nothing because every query 403'd looks identical to one with no
   data yet, unless you check the response status.
6. Do this **per contour that matters for the task** — a fix verified only on local and never
   checked on staging-integration (or vice versa) is not verified; this project runs both
   simultaneously on the same box and the scan-once gotcha above is per-process, so "it works
   locally" says nothing about the other contour.

Skipping this step is exactly how the `/kafka-lag` → `/integration-health` rename shipped broken
on a live contour despite every automated check passing (issue #91) — the automated checks were
never wrong, they just don't cover this failure mode at all.

## Reference implementations

`apps/server/src/dashboard/system-health/` (6 standalone per-entity alerts, each with its own
pure predicate + link — the "one actionable alert per action" reference above), `.../branch-
consolidation/` (alert + page + mutation), `.../integration-health/` (alert + page combining two
independent data sources on one page rather than one page per metric — see its own doc comments
for why).

**For the standard list-page UI itself (filter row, columns, pagination, bulk actions, "+ New X"
button placement)**, the reference is native `@vendure/dashboard`, not anything in this repo yet:
`node_modules/@vendure/dashboard/.../app/routes/_authenticated/_sellers/sellers.tsx` (simplest
complete example — kept intentionally minimal/near-empty in this project, safe to treat as a
stable read-only reference) and `.../_administrators/administrators.tsx` (busier example with
custom columns). See "Mandatory: any tabular/list page MUST use the native `ListPage` framework
component" above.
