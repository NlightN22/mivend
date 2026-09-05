---
name: frontend-page-design
description: Mandatory before building or restyling ANY page, form, or non-table UI in packages/manager or packages/storefront — checks ui-kit-first compliance, finds the right reference page, and requires a real screenshot before declaring done. For tables specifically, manager-table-standard is still the authority (this skill defers to it, does not replace it).
---

# Frontend page design (manager + storefront)

Real incident this exists to prevent (2026-09-04, issue #66): a page shipped using real ui-kit
components but with no card structure, no spacing/section conventions, and looking nothing like
the rest of the app — because nobody checked an existing, already-accepted page first. A second
pass on the same page used `MvTable` instead of the project's own canonical
`MvAdvancedDataTable`, missed by `manager-table-standard` not being invoked for what looked like
"just an editable grid, not a real table." Both were preventable by a five-minute check before
writing code, not by more skill after the fact.

**`@mivend/ui-kit` is a single shared package for both `packages/manager` and
`packages/storefront`** (not two separate kits) — the component library is one source of truth,
but the two portals have genuinely different navigation/layout/copy conventions (see AGENTS.md's
separate "Storefront rules" and "Manager portal rules" sections). This skill has one shared core
checklist plus a portal-specific branch — do not duplicate this file per portal, extend the
branch instead if a new project-wide rule is needed.

## Step 0 — is this actually a table/list?

If what you're building is a list of rows a user would filter/sort/paginate/search — **stop, this
is `manager-table-standard`'s job, not this skill's.** Invoke that skill instead (or in addition,
if the page is a table embedded in a larger page — do both: this skill for the page shell, that
one for the table itself). Do not decide a table is "just an editable grid" to sidestep
`MvAdvancedDataTable` — an inline-editable grid is still a table; `manager-table-standard` point 6
already covers pagination-exempt tables (still uses `MvAdvancedDataTable` for rendering
consistency, just without real `skip`/`take`).

## Step 1 — find the real reference page (mandatory, before writing any markup)

Never design from scratch or from an external mockup's literal HTML/CSS. Find an existing,
already-shipped page in the _same portal_ that is structurally similar (a settings page, a detail
page, a form, a list-with-sidebar) and use it as the actual template for card structure, spacing,
section grouping, and button placement. If you don't know which page is "already good," ask the
user or check recent git history for pages nobody has complained about — don't guess.

- Manager: `packages/manager/src/pages/settings/RolesListPage.vue` and `RoleDetailPage.vue` are
  confirmed-good references for a card-based settings page as of this skill's creation.
  `TradingPointEditForm.vue` is a confirmed-good reference for a grouped form (uppercase section
  labels, right-aligned save button).
- Storefront: check `packages/storefront/src/pages/` for the nearest equivalent page shape
  (account/checkout/catalog pages have their own established look) — no single canonical
  "good page" is pinned here yet; pin one the first time this skill is used for storefront work
  and update this file.

## Step 2 — ui-kit-first checklist (both portals, no exceptions)

Per AGENTS.md's "UI kit rules": never style a raw element, never use a raw Element Plus component
directly, never duplicate a ui-kit component with page-level style overrides.

1. **Before writing a single template tag**, `ls packages/ui-kit/src/components/` (or grep for
   the concept you need — card, panel, form field, multi-select, notice, badge, empty state) and
   read the real component's props/slots. Do not assume an API — read it.
2. If a ui-kit component that looks like what you need already exists but seems to be missing a
   variant, **add the variant to ui-kit and use it everywhere** (AGENTS.md's explicit instruction)
   — don't work around it with page-level CSS.
3. If you truly find no ui-kit component for a common, reusable concept (not a one-off), that's a
   real gap — flag it explicitly in your report rather than silently inventing a page-local
   component that looks like it should be shared.
4. Grep 2-3 other real usages of every ui-kit component you're about to use, in the same portal,
   to confirm you're matching the established convention (e.g. `MvButton`'s save-button variant,
   `MvNotice`'s warning styling, a section-title text style) — a component having a prop doesn't
   mean every existing page uses that prop the same way; match the majority convention, don't
   invent a new one.

## Step 3 — portal-specific rules

### Manager portal (`packages/manager`)

Read AGENTS.md's "Manager portal rules" section in full before implementing. Highlights (not a
replacement for reading the real section):

- URL query-string sync for any filter/search/sort/page state (`useUrlSyncedState`).
- Tab bars collapse to a "More ▾" control past ~4-5 tabs on mobile only (`max-width: 800px`
  breakpoint, `window.matchMedia`, not CSS-only).
- A list's toolbar search defaults to the identifying column only; full multi-column search is a
  deliberate per-table opt-in.
- `useLatestRequest` for any reactive-params-driven fetch — never a bare async `load()`.
- Table-specific rules live in `manager-table-standard`, not repeated here.

### Storefront (`packages/storefront`)

Read AGENTS.md's "Storefront rules" section in full before implementing. Highlights:

- Pages are thin — logic goes in composables/stores, never in `pages/`.
- Never edit `src/api/generated/` — run codegen after changing `.graphql` files.
- All GraphQL operations typed via codegen, no raw string queries.
- No hardcoded UI strings — `$t('key')` from vue-i18n, strings in `src/i18n/ru.ts`.
- `ElTableV2` (via ui-kit) for any list that may exceed 100 rows; plain `ElTable` only for short
  static lists.
- One Pinia store per domain; stores don't import each other.

## Step 4 — verify with a real screenshot before declaring done (mandatory)

Never report a UI change as complete from reading the code alone.

- **Manager**: use the `run-manager` skill (`packages/manager/.claude/skills/run-manager/SKILL.md`)
  to drive the actual page and screenshot it. Compare side-by-side against the Step 1 reference
  page for visual consistency (spacing, card shadows, typography, button placement) — not just
  "does it render with no errors."
- **Storefront**: no equivalent manual-driver skill exists yet as of this file's creation (a real
  gap — consider building one mirroring `run-manager`'s shape, under `packages/e2e/`, the first
  time this matters enough to justify it). Until then, use Storybook (`make storybook-up`) for
  isolated component verification, and a manual browser check via the running dev stack for the
  full page — do not skip visual verification just because no scripted driver exists yet.

## What this skill does not cover

- Table-specific concerns (pagination, filters, view chips, column mobile hints) —
  `manager-table-standard` is the authority there.
- Backend/GraphQL schema design — this is presentation-layer only.
- Storefront pricing/business logic — see `docs/pricing.md` and the customer-pricing plugin rules.
