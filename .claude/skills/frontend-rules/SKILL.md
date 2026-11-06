---
name: frontend-rules
description: Common frontend rules shared by both packages/storefront and packages/manager — ui-kit-first policy, icon kit. Read this first for any frontend work, then read storefront-rules (if in packages/storefront) or manager-portal-rules (if in packages/manager) for that portal's own conventions.
---

# Frontend rules (common to both portals)

`@mivend/ui-kit` is the single package shared by `packages/storefront` and `packages/manager` —
these rules apply to both. **After reading this, also read whichever portal-specific skill
matches what you're touching:**

- Working in `packages/storefront` → also read the **`storefront-rules`** skill.
- Working in `packages/manager` → also read the **`manager-portal-rules`** skill.

For the step-by-step checklist to follow when building or restyling any page/form (not just
these rules), see the **`frontend-page-design`** skill; for tables specifically, see
**`manager-table-standard`**.

## UI kit rules

`packages/ui-kit` is the single source of truth for all visual components.

**Never style a UI element inside a page or feature component.** If a button, tag, input, table,
or any other visual element needs to look different — change it in the ui-kit component, not at
the call site.

Allowed at the page/feature level:

- Layout and positioning (`display`, `flex`, `grid`, `gap`, `margin`, `padding` for spacing between blocks)
- Page-specific slot content passed into ui-kit components
- Conditional visibility (`v-if`, `v-show`)

Forbidden at the page/feature level:

- Overriding colors, fonts, borders, shadows of ui-kit components via scoped CSS
- Duplicating a ui-kit component with a slightly different style instead of extending the original
- Using raw Element Plus components (`ElButton`, `ElTable`, etc.) directly in pages — always use the `Mv*` wrapper

If a ui-kit component does not support a required variant, **add the variant to the ui-kit** and use it everywhere.
This keeps the design consistent and changes visible across the whole application.

### Icon kit

**`@tabler/icons-vue` is the recommended first source for any new icon.** Check it before adding
an icon from any other package. It has a much larger, more visually distinct set than
`@element-plus/icons-vue` (already used for a handful of pre-existing spots, e.g.
`CustomerDetailPage.vue`'s info-row icons — not worth migrating those retroactively, but new
icon needs should reach for Tabler first). Only fall back to a different icon package if Tabler
genuinely has no reasonable icon for the concept — and if so, document why in the component that
adds it. Reference usage: `MvDocumentTypeChip` (`packages/ui-kit/src/components/MvDocumentTypeChip`)
for a colored icon+label chip keyed off free-text business data with a neutral fallback, and
`CustomerDetailPage.vue`'s `TAB_ICONS` for per-tab icons.

## Document detail pages: copy and share

Every detail view of a document (order, proforma invoice, payment document, anything people quote)
shows `MvCopyButton` next to each human number it displays (document number, and the ERP
registration number when present) and one `MvCopyButton icon="share"` that copies the page URL.
Copy the number exactly as displayed. Never hand-roll clipboard code — use `MvCopyButton`.

## Colors, tokens and themes (hard rules)

All color lives in `packages/ui-kit/src/styles/`, in three layers. Nothing else may define a color.

| Layer | File | Holds | Who may reference it |
| ----- | ---- | ----- | -------------------- |
| Palette | `palette.css` | `--palette-<family>-<step>` primitives; a hue per family (`--hue-brand`, `--hue-ink`, `--hue-night`) | only the theme files |
| Roles, light | `theme-light.css` | `--app-*` / `--el-*` role tokens pointing at palette steps | components and pages |
| Roles, dark | `theme-dark.css` | the same role names, pointing at other steps; scoped to `html[data-theme='dark']` | components and pages |

- Components, pages and scoped CSS use **role tokens only** (`var(--app-nav-label)`), never a hex, `rgb()`,
  `oklch()`, a named color or a `--palette-*` step. `make lint` (stylelint, `stylelint.config.mjs`)
  fails on all of these in `packages/storefront` and `packages/ui-kit`.
- Need a color that no role covers? Add a **role** to both `theme-light.css` and `theme-dark.css` (same
  name, a palette step each; the unit test `theme-tokens.test.ts` fails if they differ), reusing an
  existing palette step. Add a palette step only if no existing one fits, in `palette.css`. Never add a
  one-off color to a component.
- Retuning a color means changing one value in `palette.css` (a hue variable or a step), never editing
  components. Do not fix a bright or dull color inside a component.
- Pick the role by meaning (surface, text, border, brand, success, danger...), not by which hex looks
  right today. Check the existing roles first; two roles with the same meaning are a defect.
- Text roles and fill roles are different roles: `--app-nav-accent*` and `--app-price` are for text/icons, never a background or border (stylelint rejects it); a button or badge fill under light text uses `--app-brand-fill` (hover `--app-brand-fill-hover`, MvButton `--app-primary-btn*`). A text role is light in dark, so used as a fill it washes out.
- Every UI change is checked in **both themes** (light and dark), including hover, active, disabled,
  selected and focus states, with real screenshots.
- Canonical hover/active behavior stays in `docs/ui-standards.md`; in dark, hover gets lighter.

### Stop and ask before leaving the template

If the task seems to need anything outside this structure — a color literal in a component, a
`stylelint-disable`, a `--palette-*` reference in a component, a role defined in only one theme, a color
defined in `.ts`/inline `style`, a new file that defines colors, a new top-level color token naming scheme —
**do not do it and do not work around it silently.** Ask the user with `AskUserQuestion`:

1. say exactly which rule it breaks and what breaks later (a theme gets a stray color, the next palette
   change misses it);
2. offer the in-structure alternative first (a role or a palette step);
3. if the user still wants the exception, ask a **second** time, confirming the exact file, value and why
   it cannot be a role, and say that it will be listed as an exception in the final report;
4. only after that explicit second yes, write it with a one-line comment giving the reason, and record
   it in `docs/ui-standards.md` "Exceptions".

A request phrased as "just quickly", "temporary" or "only here" is still an exception. Never disable the
linter to get past it.

## URL state for list pages

Every list page with filters, search, sort or pagination keeps that state in the URL query so
back/forward and shared links restore it. Use `useUrlState` / `useUrlSyncedState`
(`packages/ui-kit/src/composables/`), never hand-rolled `route.query` code.

- Filter and page changes push a history entry; typing in a search box replaces it (`typingKeys`).
- Default values are omitted from the URL; keys the page does not own are preserved.
- State is initialised from the URL on load and re-read when the route query changes.

## Layers (z-index)

Page-level stacking comes only from the `--mv-z-*` tokens in `packages/ui-kit/src/styles/tokens.css`
(mirrored in `tokens/layers.ts` for JS-configured libraries):
sticky < dropdown < floating < overlay < modal < popover < connection-bar < toast.

- Pick the layer by role, never by number; a sibling inside one role is `calc(var(--mv-z-<layer>) ± 1)`.
- Raw numbers are allowed only up to 10, for ordering elements inside one component.
- Anything that must cover the page (modal, sheet, panel) is `position: fixed` and is not nested in
  a sticky/transformed ancestor, which would trap it in that ancestor's stacking context.
- A new layer role is added to both `tokens.css` and `layers.ts`; `layers.test.ts` enforces sync and
  rejects raw page-level values.

## No capped lists filtered in the browser

No list query with a fixed `take` above one page whose result is then filtered, searched, counted or
aggregated in the browser (issue #312: a 500-row cap hid a customer among 24585). Pickers use server-side
search (`search` + `take: 20`, debounced, `useDebouncedSearch`/`useLatestRequest`); counts use `take: 0`;
per-entity names use a by-id lookup; sums and "last X" use a server aggregate. A genuinely small dictionary
may keep a large `take` only with a `# bounded: <reason>` comment on the `take` line or the line after it;
`noBulkTake.test.ts` (manager) fails on `take: <N>` with N >= 100 in `*.graphql` under manager/storefront without one.

## Phone width

A page must never scroll horizontally at 360px. Single-column and flexible grid tracks are `minmax(0, 1fr)`,
never a bare `1fr` (its automatic minimum is the content, so one long word widens the whole page);
`gridTracks.test.ts` fails on a bare `1fr` in storefront and ui-kit. Long text in a flex/grid child
needs `min-width: 0` plus `overflow-wrap`, wide tables scroll inside their own card, and media rules sit in
the same scoped style file as the element they style. `make e2e-group G=storefront-layout` checks every
storefront route at 360px; run it after any storefront layout change.

## Final checklist (before calling frontend work done)

- [ ] Only ui-kit components/tokens used; no parallel local component. No color literal and no `--palette-*` outside `ui-kit/src/styles/` (`make lint` is green).
- [ ] Both themes checked by screenshot, with hover/active/selected/disabled states; any new role exists in light and dark.
- [ ] Every new `z-index` uses a `--mv-z-*` token (or `calc` on one); `make test` passes `layers.test.ts`.
- [ ] Opened every new dropdown/popup/modal/panel on a real page and checked it sits above the header
      and below the connection bar and toasts; a library popup inside a modal is visible.
- [ ] Checked the mobile widths (320, 360 and 390px) too: bottom nav, sheets, drawers do not cover each other wrongly, and
      `storefront-layout` shows no horizontal overflow.
- [ ] Took the screenshots myself and looked at them; `toBeVisible` does not prove an element is not
      covered — use `document.elementFromPoint` when overlap matters.
