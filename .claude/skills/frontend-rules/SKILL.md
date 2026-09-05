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
