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
`make lint` (stylelint) rejects any color literal or `--palette-*` reference in storefront and ui-kit
components. The manager portal is not migrated yet and is outside that lint (#320).

## Exceptions

Colors written outside the template, each approved by the user after the two-step question. Empty by default.

| File | Value | Reason |
| ---- | ----- | ------ |

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
- **Status chips with counts** (`MvFilterChips`, `count` from one grouped `take: 0` request, never a
  request per chip). The most operational chip goes first and sets `emphasis` so its count stands out
  while non-zero. Chips replace KPI tiles and "needs attention" banners for the same information.
- **Preset filter** where the list is also shown inside another entity (a fixed customer): narrows the
  list, is never shown as a filter, and does not widen server-side scope.
- **Row click** opens the entity card (the identifying cell is a real link, so ctrl/middle-click and Enter work). There is no default quick panel; a list gets one only when its entity page type asks for it.

Layout: the table takes the full page width; at a 1360px viewport the identifying columns fit without
horizontal scroll and the rest start hidden behind the column settings. On a phone the list is a card
list and the chips are one horizontally scrolling row (`scrollable`).
