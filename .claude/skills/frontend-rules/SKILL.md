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

## Colors and button states

Canonical hover/active colors and tokens live in `docs/ui-standards.md`; follow it for any button or
button-like element in either portal.

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

## Final checklist (before calling frontend work done)

- [ ] Only ui-kit components/tokens used; no parallel local component or hard-coded color.
- [ ] Every new `z-index` uses a `--mv-z-*` token (or `calc` on one); `make test` passes `layers.test.ts`.
- [ ] Opened every new dropdown/popup/modal/panel on a real page and checked it sits above the header
      and below the connection bar and toasts; a library popup inside a modal is visible.
- [ ] Checked the mobile width (390px) too: bottom nav, sheets, drawers do not cover each other wrongly.
- [ ] Took the screenshots myself and looked at them; `toBeVisible` does not prove an element is not
      covered — use `document.elementFromPoint` when overlap matters.
