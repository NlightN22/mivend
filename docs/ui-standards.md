# UI standards: colors and button states

Single reference for interactive colors. Source of truth is `packages/ui-kit` (`styles/palette.css`,
`styles/theme-light.css`, `styles/theme-dark.css`, `MvButton`). Pages never invent their own hover/active
colors and never write a color literal (`make lint` enforces it).

## Button states

Roles, not values: the value of each role per theme is in `theme-light.css` / `theme-dark.css`.

| Variant (`MvButton`) | Idle                    | Hover                       | Active                       |
| -------------------- | ----------------------- | --------------------------- | ---------------------------- |
| `primary` (green)    | `--el-color-primary`    | `--app-primary-btn`         | `--app-primary-btn-active`   |
| `buy` (orange)       | `--app-accent-orange`   | `--app-accent-orange-hover` | `--app-accent-orange-active` |
| `catalog` (lime)     | `--app-lime-bg`         | `--app-lime-hover`          | `--app-lime-active`          |
| custom green fill    | `--app-brand-fill`      | `--app-brand-fill-hover`    | (same as hover)              |
| `secondary`, `ghost`, `danger` | see `MvButton.vue` | defined there            | defined there                |

In the dark theme hover and active step **lighter** than idle (the inverse of light); this is already encoded
in the roles, so a component needs no per-theme code.

## Rules

- Use `MvButton` with a variant whenever the element is a button. Custom-styled buttons or
  button-like links (e.g. a `RouterLink` styled as a button) must reuse the same roles and define
  **idle, `:hover`, `:active`, and `:disabled`** states.
- Text roles (`--app-nav-accent*`, `--app-price`) are never a fill or border; a fill under light text uses
  `--app-brand-fill*`.
- A new color means a new role in both theme files (and a palette step only if none fits). Structure and
  the ask-before-exception rule: `frontend-rules` skill, "Colors, tokens and themes".
- Hover/active are never improvised per page.
- Check every state in both themes in a real browser (Playwright `hover()` + computed `background-color`).

## Audit command

Storefront and ui-kit: `pnpm lint:css` (part of `make lint`) must be green; it rejects color literals,
`--palette-*` in components and text roles used as fills. Manager portal (not yet migrated):

```
grep -rnE "#ff8a00|#ff8900|#e67c00|#e87800|#e07a00|#cc6e00|#00b894|#00a884|#c8f21a" \
  packages/manager/src --include=*.vue | grep -v "var(--app"
```

## Colors and themes

Structure and rules: `frontend-rules` skill, "Colors, tokens and themes". Palette steps are in
`packages/ui-kit/src/styles/palette.css`; role tokens for each theme are in `theme-light.css` and
`theme-dark.css`. Hover and active use the same role names in both themes; in dark they step lighter.
`make lint` (stylelint) rejects any color literal or `--palette-*` reference in storefront, ui-kit and manager
components.

## User menu and theme

The topbar has no separate Log out button. The user pill opens one compact menu (`role=menu`, one component for
desktop and phone): an identity block (initials, name, role, e-mail), "Password and security", one row with the
"Theme" label and an icon-only segmented control (`menuitemradio`, sun / moon / auto-monitor; labelled Light / Dark /
Auto, current one checked; Auto follows the system), "System settings" for users who may open it, and Log out last,
separated, in the danger role. Rows are 36px with small leading icons. Up/Down move focus (Left/Right inside the
theme control), Escape closes. No language row until the manager has i18n.
The menu is a dropdown card anchored under the avatar on desktop and on phone (`MvPopover` with `:sheet="false"`: arrow, dimmed page, 16px side gutters, max 340px); other popovers still become a bottom sheet at <=640px.
Mobile header (<=800px): logo mark, a round search button, the notification bell and a round avatar button. The
search button makes the field take over the whole header row (cross closes, Escape closes, auto-focus) and a
full-height panel covers the page. Empty field: "Recent queries" (per user in `localStorage` under
`recent-searches:<administratorId>`, max 6, newest first, remove one / Clear) and "Quick links" (chips to the lists the
user can open, from the nav items so permissions apply; saved views cannot feed them, they are fetched per list).
From 2 characters: grouped `globalSearch` results (see `docs/access-control.md` "Global search"), 250 ms debounce,
stale responses ignored, 5 hits per kind, one 44px row per hit (bold number, title, subtitle, status badge); under 2
characters a hint, no hits "No results", a failed query an error line. A result opens the entity (customer, order,
proforma invoice; settlement documents and discounts have no card, so they open their list filtered by the number) and
is saved to the recent queries; Enter without a choice only saves the query. Desktop: the header field is the same
search; typing 2+ characters opens a glass dropdown with the same rows (Up/Down move, Enter opens, Escape closes), an
empty focused field shows the recent queries, Ctrl K / Cmd K focuses it.
The theme logic (`initTheme`, `setThemePreference`, `themePreference`) lives in `packages/ui-kit/src/theme`
and is shared by both portals; the choice is kept in `localStorage`, System follows `prefers-color-scheme`.

## Glass surfaces

Two frosted sets in `packages/ui-kit/src/styles/glass.css`, roles in both theme files. `.mv-glass` (storefront header,
bottom bar): `--app-glass` (alpha .66), `blur(14px) saturate(1.4)`. `.mv-glass-liquid` (manager bottom tab bar,
its More sheet, the user menu card via `MvPopover` prop `glass`): `--app-glass-liquid` (alpha .45 light, .40 dark),
`blur(22px) saturate(1.7)` (`--mv-glass-liquid-filter`), a 1px inset top highlight `--app-glass-edge` and a soft
shadow. Both fall back to solid `--app-glass-strong` without `backdrop-filter` support and under
`prefers-reduced-transparency`. Other popovers stay solid. Tab labels use `--app-text-body2` so they keep >=4.5:1
(measured 7.7 light, 8.0 dark) over a dense list scrolled behind the bar.

## Exceptions

Colors written outside the template, each approved by the user after the two-step question. Empty by default.

| File | Value | Reason |
| ---- | ----- | ------ |

## Notifications and popups (#348)

One system: a popup and a bell entry are the same notification. Decisions:

- **One emitter.** `notify(message, kind, { title?, ephemeral?, ttlMs? })` from `@mivend/ui-kit` replaces the old `toast()`/`useToast()`; there is no compat shim. Kinds are `info | success | warning | error` everywhere (popup, bell, backend).
- **Persisted by default, ephemeral is the explicit opt-out.** Errors, warnings and results of actions are kept in the bell; pass `ephemeral: true` only for trivial UI feedback ("copied", "added to favorites", the add-to-cart discount hint). A forgotten flag keeps a message rather than losing it.
- **Stored on the backend**, in the existing `Notification` table, by the authenticated mutation `createClientNotification` (Shop API for the storefront, Admin API for the manager portal). Rows carry `sourceType = 'client'` as the origin marker, no schema change. The owner is always the caller (never a client-supplied id). Title is up to 120 characters (may be empty), message up to 1000; the client clips, the server rejects longer. An identical kind+title+message from the same user within 60 seconds returns the existing row instead of a new one; more than 20 stored popups per user per minute are refused. Both checks run under a per-user advisory lock, so concurrent identical calls store one row.
- **Failure never breaks the action.** The popup shows first; if the mutation fails (offline, rate limit, expired session) the error is logged to the console and nothing else happens. Without a signed-in notification store (guests) a popup is not stored.
- **Backend-pushed notifications appear as the same popup** when the subscription delivers them. A `client` row delivered back through the subscription is only added to the list: the tab that created it already showed the popup (other tabs update the bell without a popup).
- **Retention is data, not config.** Table `notification_retention_rule` (Dashboard: Settings > Notification retention, native `ReadSettings`/`UpdateSettings`) holds read/resolved days and unread days per `sourceType`, plus a default row (key `*`) for types without their own days; null days inherit the default. Seeded once with `*` = 90/365 and `client` = 7/30 (existing rows, edited or not, are never overwritten). There is no list of business types in code: the hourly `notification-cleanup` task inserts a row for any `sourceType` it finds in `notification` (so a new type shows up in the Dashboard within an hour, inheriting the default), then reads the effective days from the table on every run and deletes in batches of 1000, at most 20 per run. Days are whole numbers 1 to 3650; unread shorter than read is allowed (the unread row just expires first). No environment variables. The unread badge is a database count (`status: 'unread', take: 0`), so a deletion cannot make it disagree with the list; an open page refreshes it on its next fetch.
- **Look.** Popups sit top-right (the bell is in the top bar, so a kept popup has a short flight; the old bottom-right idea from #87 was dropped for that reason) and span the width with a 12px gutter on phones. A kept popup collapses toward the bell when it expires or is dismissed; an ephemeral one slides out; with `prefers-reduced-motion` both only fade. Colors come from ui-kit tokens only. `.mv-notification-popup` is the e2e selector.
- Open question for the owner: popups raised in an acting-as-customer tab are stored under the customer being acted as (the tab's session user), so that customer sees staff-raised errors in their bell.

## Manager list tables

Every manager list (orders, proforma invoices, payments, discounts, customers, approvals) is an
`MvAdvancedDataTable` and provides, in this order:

- **Views control** in the table toolbar (`#toolbar-end`, left of the column settings): `TableViewsMenu`
  with a unique `viewsKey`. A view stores filters, sort, the search term, column order and visibility.
  It is never a separate widget on the page. The menu has two groups: My views (personal) and Team views
  (shared with everyone who can open the list). Anyone applies a team view or copies it to their own;
  creating, editing, deleting a team view and choosing the **team default** need the `ManageSharedTableViews`
  permission (the save form then offers a scope). A list opens with: link filters, else the person's
  remembered choice (including the plain default view), else the team default, else the built-in state.
  Rename, duplicate, delete and "Default" live in the control.
- **Filter builder** (`MvFilterBuilder`, built into `MvAdvancedDataTable`): the search box stays the main
  text filter; next to it one **Filter** button opens a column picker, then "Filter by <column>" with an
  operator select (options depend on the column type) and a value input of that kind. Applied conditions
  are removable chips (`Total > 1000 x`); a chip click edits it. Columns opt in with `filterType`
  (`string`, `number`, `date`, `boolean`, `select`, `id`), plus `filterOptions` for selects and, when
  needed, `filterField` (server field), `filterScale` (major to minor units) and `filterOperators`
  (a narrower operator list). The state is a list of `{ columnKey, operator, value }`; `toVendureFilter`
  turns it into Vendure `StringOperators`/`NumberOperators`/`DateOperators`/`BooleanOperators`/
  `IDOperators`, `conditionsToQuery`/`conditionsFromQuery` carry it in the URL, and a saved view stores the
  same list. Offer only operators the server accepts and no column the server cannot filter. Per-column
  header funnels are not used on a list that has the builder. Operators: string (contains, does not
  contain, is equal to, is not equal to, starts with, ends with, is empty, is not empty; starts/ends with
  go to the server as an escaped `regex`), number (equal, greater, greater or equal, less, less or equal,
  between, is empty), date (before, after, between, is empty; whole local days), boolean (true, false),
  select (is, is not, is any of, is none of), id (equal, not equal, is empty, is not empty).
- **Loading skeletons.** Every list shows the shared skeleton while it loads: `MvAdvancedDataTable` renders
  placeholder rows matching the visible columns (desktop) or skeleton cards (phone) on the first load, and
  keeps the previous rows under the overlay on later reloads (phone: skeleton cards each time). It sets
  `aria-busy` and a visually hidden "Loading" status; skeleton cells are `aria-hidden`. A list never builds
  its own spinner or skeleton. Animation stops under `prefers-reduced-motion` (`MvSkeleton`).
- **Filter typing follows the value set.** A column with a bounded value set (types, statuses, organizations,
  channels, branches, price types) filters as a `select` with `filterOptions` loaded from data (never hardcoded);
  only unbounded columns (customer, number, free text) use text operators. Check every new list against this.
- **Categorical colours** (`cat-1`..`cat-8`, role tokens `--app-cat-N-bg/fg`, light and dark) colour sets owned by external data, such as ERP document types: `MvStatusBadge` and `MvFilterChips` share the variant, and `documentTypeVariant(code, sortedCodes)` (manager `utils`) takes the position of the type in the global sorted type list (`useDocumentTypeCodes`, loaded once per session through the count-free `settlementDocumentTypes` query, not per customer), so a type has one colour in its chip, its badge and every screen; it shifts only when a brand-new type enters the system. A code outside the list falls back to a hash. Semantic variants keep their meaning (success, warning, ...).
- **Status chips with counts** (`MvFilterChips`, `count` from one grouped `take: 0` request, never a
  request per chip). The most operational chip goes first and sets `emphasis` so its count stands out
  while non-zero. Chips replace KPI tiles and "needs attention" banners for the same information.
  While counts load (first load and every refetch) set `countLoading` on the chips: the pill shows a
  fixed-width skeleton, so the row does not jump.
- **Preset filter** where the list is also shown inside another entity (a fixed customer): narrows the
  list, is never shown as a filter, and does not widen server-side scope.
- **Row click** opens the entity card (the identifying cell is a real link, so ctrl/middle-click and Enter work). There is no default quick panel; a list gets one only when its entity page type asks for it.
- **Column `priority`** (optional number, higher wins): when the table is narrower than its columns, the lowest priority columns shrink first, down to their `minWidth` (72px if unset), then drop out of view (still in the column settings). Set `minWidth` equal to `width` for columns that must never be truncated. Without any `priority` the widths stay as declared.

Layout: the table takes the full page width; at a 1360px viewport the identifying columns fit without
horizontal scroll and the rest start hidden behind the column settings. On a phone the list is a card
list; the chips behave the same as on desktop.

## Filter value suggestions

A text column with a large value set (customer, number) can offer typeahead in the Filter builder
(`FilterColumn.suggest`, from the column's `filterSuggest`): from 2 characters, 300 ms debounce, up to 10
values, a stale request is aborted, arrows/Enter/Escape work, free text stays allowed. Server side it is an
opt-in `FieldSpec.suggest` in the list engine (`packages/shared/src/list-suggest.ts`): fixed SQL, prefix
match on `lower(value) COLLATE "C"` (a btree on that expression serves the range and the order, so
`LIMIT` stops early), a bound escaped prefix, limit clamped to 1..20, prefix clamped to the engine's
`maxTextLength`, and the same counterparty visibility scope as the list plus a "has a listable document"
check, so a suggestion never shows a value the caller cannot list. Pilot: settlements, query
`settlementFilterSuggestions(field, prefix, limit)` (customer, number), index migration `1791576000000`
(plain `CREATE INDEX`, the tables are small).

Suggestions are stricter than the list on purpose: they need the entry's local `counterpartyId` and the
contract's `counterpartyId` to match, while the list joins the counterparty by ERP id. An entry whose local
counterparty id is still null (not imported yet) is listable but never suggested; it is covered by an
integration test. Suggestions are prefix-only whatever the operator, so the list is labelled "Starting with"
(restricting the operators would have left the default "contains" without suggestions).

After the migration on staging or production, run `EXPLAIN` of each suggestion query once to confirm the
index is used (`Index Scan using "IDX_counterparty_short_name_prefix"` /
`"IDX_settlement_document_number_prefix"` with an `Index Cond` range on `lower(..)`, no `Sort` node above
it). Run the migration with the workers stopped, like the other index migrations.
Plan excerpt as measured (contract query, same shape; the index walk stops at the limit):

```
Limit  (actual time=18.576..202.122 rows=20)
  ->  Index Scan using "IDX_contract_name_prefix" on contract k
        Index Cond: ((lower((name)::text) >= 'co') AND (lower((name)::text) < 'cp'))
        Filter: (... AND ((SubPlan 1) IS NOT NULL))
```

Rules learned while measuring: do not reuse the list's joined query (it scans and hashes every entry,
50 ms to 4 s); do not `GROUP BY`/`DISTINCT` the matches (it defeats the early stop, dedupe in code
instead); write the existence check as `(SELECT 1 ... LIMIT 1) IS NOT NULL`, not `EXISTS` (the planner
flattens `EXISTS` into a hash join over every entry); a btree needs the `COLLATE "C"` or `text_pattern_ops`
form to serve `LIKE 'x%'`, and only the `COLLATE "C"` form also serves `ORDER BY`.

Measured on a local synthetic database (PostgreSQL 16, shared_buffers 128 MB, warm cache, 20 runs each,
`EXPLAIN (ANALYZE, BUFFERS)` execution time, p50 / p95 in ms): 25,000 counterparties across 8 branches,
50,000 contracts, 300,000 documents with one entry each. Scope "all" is an unrestricted caller, "branch"
a branch of about 3,000 counterparties, "small" 15 counterparties. Prefixes: customer `al`/`alp`/`alpha`
(837, 837, 287 matches of 25,000), contract `co`/`con`/`contr`, number `si`/`si0`/`si000`.

| Field | Prefix | all | branch | small |
| --- | --- | --- | --- | --- |
| customer | 2 | 2.8 / 4.7 | 21 / 29 | 0.9 / 3.1 |
| customer | 3 | 2.8 / 3.5 | 21 / 31 | 0.9 / 2.1 |
| customer | 5 | 3.2 / 3.8 | 21 / 29 | 1.0 / 1.9 |
| number | 2 | 1.6 / 2.7 | 9.1 / 12.6 | 11.5 / 25.7 |
| number | 3 | 1.3 / 1.9 | 10.1 / 13.8 | 11.7 / 26.0 |
| number | 5 | 1.5 / 2.5 | 9.0 / 13.7 | 11.8 / 20.8 |
| contract (off) | 2 | 3.1 / 7.6 | 28 / 49 | 81 / 153 |
| contract (off) | 3 | 2.8 / 3.9 | 25 / 41 | 80 / 138 |
| contract (off) | 5 | 2.9 / 4.6 | 25 / 40 | 62 / 87 |

For comparison, reusing the list's own joined query with a prefix filter took 50 to 450 ms for customer and
contract and 160 to 690 ms for number (4 s for number in a branch scope with the other index set).
Contract suggestions are not enabled: a caller with a small scope and a common prefix walks the whole
prefix range (about 50,000 rows, 60 to 150 ms) because the scope is only a filter on that walk; a scope-driven
plan fixes the small scope but costs 230 ms for a branch, and the planner cannot choose between the two.
Revisit with a covering/partial structure or a two-step plan before turning it on. The customer
branch case is bound by the per-candidate existence check (about 0.15 ms each, 130 candidates per 20 hits).

## List cell standard

No nested scrollbars: the page is the only vertical scroll. A table never has its own vertical scrollbar and grows with its
rows (no scroll height or max-height on the grid); horizontal table scroll appears only when the columns do not fit.
Accepted trade-off: because the table container no longer scrolls vertically, its header does not stay pinned while the page scrolls through a long page (measured: 50 rows, the header leaves the screen). A page-level sticky header needs the horizontal overflow wrapper out of the way (a header clone synced by script) and is a follow-up if long pages need it.

One scale for every `MvAdvancedDataTable` cell (classes in `AdvancedDataTableGrid.css`, sizes in `tokens.css`):

- `mv-cell-id` for identifiers (document numbers): 13px, semibold, nowrap, tabular figures, never truncated.
- `mv-cell-primary` for the main text (customer, manager): 13px semibold, clamped to two lines, full value in `title`.
- `mv-cell-meta` for secondary text (contract, organization, notes): 12px, secondary colour, two-line clamp, `title`.
- `mv-cell-amount` for money: nowrap, tabular figures, right-aligned column (`align: 'end'`), sign and currency code always
  in one format (`-2,075.00 RUB`); give it a `minWidth` equal to its `width`.
- `mv-cell-link` removes the link colour and underlines on hover and is `width: fit-content` (a clamped link must never fill the cell: a click outside its text has to reach the row click); `MvStatusBadge clamp` wraps a long badge to two lines.
- Cells are middle-aligned; the default cell text clamps to two lines. Every column declares `width` (and `minWidth` for
  columns that must not shrink); the table is `table-layout: fixed` and reserves the scrollbar gutter, so columns stay put
  between pages and sorts. Skeleton rows use the list's `rowHeightPx`.
- Chip rows take at most two rows on every viewport; chips that do not fit are hidden behind a `More N` button (N = hidden chips) that expands all of them, and `Collapse` at the end folds back (`MvFilterChips`, measured with a `ResizeObserver`; hidden chips stay measurable but out of layout and tab order); the selected chip is never hidden; counts of 10,000 and
  more are shown as `309.9k` with the exact value in the title. ERP-provided type names are shown as received.
- Rows have one uniform height (`rowHeightPx`, 64px on the document lists; every cell has that as its minimum height,
  skeleton rows included). A cell never grows the row: several orders or flags show the first one plus a `mv-cell-more`
  `+N` with the full list in the title.
- The toolbar keeps search, Filter, Views and column settings on one row (end group right-aligned); chips (`view-chips`
  in `toolbar-start`) take their own full-width row below. Chip rows take two rows with `More N`/`Collapse`. The table never exceeds its
  parent, and the default visible columns must fit about 1090px of table width.
- On a phone the table container reserves the bottom tab bar height.
- The `+N` pill is `role="note"` with an `aria-label` and title listing the hidden items; the order card/detail shows the
  same items. The `More`/`Collapse` button has `aria-expanded`; the selected chip stays among the visible ones; chip order follows the counts (largest first, then label), so chips may reorder when filters change; the selected chip has `aria-pressed`.
- Cells with buttons, inputs, selects or switches keep the table's 13px/18px defaults; wrap content in `mv-cell-raw` to
  reset the clamp, line height and font size where a control needs its own box.
- A column that is empty for most rows (e.g. organization, proforma invoice on settlements) starts hidden.

## Flagged cells and row stripes

A problem is shown only in the cell where it occurs, as an `MvFlagChip`: the plain value followed by a small
icon-only button (aria-label, keyboard focusable) with no status text. On desktop, hovering or focusing the icon shows a
styled tooltip (`MvTooltip`, never a native `title`) with the same notes and consequence; clicking opens an
`MvPopover` with them plus the cell's actions, and on a phone the tap opens the popover as a bottom sheet. The popover
carries the full text and the consequence; the same text never repeats in a panel, banner or badge
elsewhere on the page. Tones: `danger` (block or hold), `orange` (approval needed), `warning` (warn). A row carries a
left-edge stripe in its worst tone, green when clean. Tones come from the policy consequence of the finding (branch
overrides included), not from the check's own severity, except where no policy applies. A state of the whole document
(for example the ERP registration) is a header badge whose detail text opens in a popover. First used by the manager
order card.

## Document lines kit

`MvDocumentLines` (`packages/ui-kit/src/components/MvDocumentLines/`) is the lines table of every document card:
orders today, proforma invoices, payments, sales invoices and discount requests next. Use it whenever a card shows
positions with per-cell problems; use `MvAdvancedDataTable` for lists of documents.

What the kit owns: the toolbar (title with a muted position count, an inline `toolbar` slot), an always-visible checkbox
column on desktop (none on a phone) with a selection bar above the table (`bulk` slot, "Selected: N"; selected rows
tinted), the header row, left-aligned value cells (a flag icon follows the value, no empty icon slot is reserved),
per-cell flags (a column marked `inputWhenEditing` drops its flag while its row is edited, the others keep it), the
left stripe in the worst tone of the row, per-row pencil and trash buttons, inline edit (green tint and accent, check
and cross; `MvDocumentSuffixInput` is the numeric input with a "%" or currency suffix), the inline add row (`adding`
prop, `add-row` slot) with the dashed `MvDocumentAddButton` (`add-label` prop, `add` event), a mobile card per row
and a skeleton. `MvDocumentTotals` is the right-aligned stacked totals block (label left, value right, a muted note, the document total
emphasised). Selection state is `useLineSelection`.

How a new document type plugs in (all in its own package, nothing document-specific enters the kit):

1. Declare `DocColumn[]` (key, label, `hidden` for a conditional column).
2. Map the document's own problems to `DocRow[]`: `id`, `testId`, and `flags` keyed by column key. A `DocFlag` is a
   `tone` (`danger`, `orange`, `warning`), `notes` (text, optional detail, optional consequence badge) and optional
   `actions` (key and label); the kit emits `flag-action` with the key when one is pressed. Tones, texts and which
   actions are allowed come from the document's checks and policies, not from the kit.
3. Render each cell through the `cell-<columnKey>` slot (it receives `row` and `editing`); the kit wraps the content in
   the flag. Put the edit inputs in the same slot when `editing` is true; editing state, drafts and mutations stay in the
   caller (`editing-id`, `saving-id`, `errors`, `start`/`commit`/`cancel`/`remove`/`add` events).
4. Fill the `toolbar`, `bulk`, `notices`, `add-row` and `totals` slots. Totals are `DocTotalRow[]`; a flag that belongs to the whole
   document goes into the `value-<key>` slot of its totals row with `MvDocumentCell`.

Reference: `OrderLinesTable.vue` and `orderDocFlags.ts` in the manager portal.
