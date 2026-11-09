---
name: frontend-page-design
description: Mandatory before building or restyling ANY page, form, or non-table UI in packages/manager or packages/storefront — checks ui-kit-first compliance, finds the right reference page, and requires a real screenshot and a colors/button-states audit before declaring done. For tables specifically, manager-table-standard is still the authority (this skill defers to it, does not replace it).
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
but the two portals have genuinely different navigation/layout/copy conventions (see the
`storefront-rules` and `manager-portal-rules` skills). This skill has one shared core
checklist plus a portal-specific branch — do not duplicate this file per portal, extend the
branch instead if a new project-wide rule is needed.

**No nested scrollbars:** the page is the only vertical scroll; no table, panel or list inside a page gets its own vertical scrollbar. See `docs/ui-standards.md`.

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

Per the `frontend-rules` skill's ui-kit-first policy: never style a raw element, never use a raw
Element Plus component directly, never duplicate a ui-kit component with page-level style
overrides.

1. **Before writing a single template tag**, `ls packages/ui-kit/src/components/` (or grep for
   the concept you need — card, panel, form field, multi-select, notice, badge, empty state) and
   read the real component's props/slots. Do not assume an API — read it.
2. If a ui-kit component that looks like what you need already exists but seems to be missing a
   variant, **add the variant to ui-kit and use it everywhere** (`frontend-rules`' explicit
   instruction) — don't work around it with page-level CSS.
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

Read the **`manager-portal-rules`** skill in full before implementing. Highlights (not a
replacement for reading the real skill):

- URL query-string sync for filter/search/sort/page state (see `frontend-rules`, "URL state for list pages").
- Tab bars collapse to a "More ▾" control past ~4-5 tabs on mobile only (`max-width: 800px`
  breakpoint, `window.matchMedia`, not CSS-only).
- A list's toolbar search defaults to the identifying column only; full multi-column search is a
  deliberate per-table opt-in.
- `useLatestRequest` for any reactive-params-driven fetch — never a bare async `load()`.
- Table-specific rules live in `manager-table-standard`, not repeated here.

### Storefront (`packages/storefront`)

Read the **`storefront-rules`** skill in full before implementing. Highlights:

- Pages are thin — logic goes in composables/stores, never in `pages/`.
- Never edit `src/api/generated/` — run codegen after changing `.graphql` files.
- All GraphQL operations typed via codegen, no raw string queries.
- No hardcoded UI strings — `$t('key')` from vue-i18n, strings in `src/i18n/{en,ru}/*.ts`
  (Step 6 audits it).
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

## Step 5 — colors, tokens, themes and interactive states audit (mandatory, last step)

Rules: `frontend-rules` "Colors, tokens and themes". Read `docs/ui-standards.md` (button-state table), then
check every changed file:

- **Structure.** `make lint` is green (stylelint: no hex, `rgb()`, `oklch()`, named color or `--palette-*`
  outside `packages/ui-kit/src/styles/`). Colors are defined only in `palette.css` (primitives),
  `theme-light.css` and `theme-dark.css` (roles); nothing in a component, page, `.ts` or inline `style`.
- **Roles.** Each color used is a role chosen by meaning. A new role is in both theme files with the same
  name; no duplicate of an existing role; no value tweaked inside a component to "look right".
- **Both themes.** Screenshot every changed screen in light and in dark, and look at them yourself:
  contrast of text on surfaces, borders visible, no light patch left in dark, no dark patch left in light,
  images/icons readable.
- **States.** Every button or button-like element has idle, hover, active, disabled, and for selectable
  things a selected state, in both themes; hover in dark is lighter. Use Playwright `hover()` and compare
  computed colors; a still screenshot does not show hover.
- **Exceptions.** If anything was written outside the template, confirm it went through the two-step
  question in `frontend-rules` and is listed in `docs/ui-standards.md` "Exceptions"; otherwise remove it.
  Report every exception in the final message.

## Step 6 — two-language audit (mandatory, storefront and ui-kit)

The lint rule `no-raw-text` sees only template text, so check every changed file by hand:

- every user-visible string has a key in both `src/i18n/en/*.ts` and `src/i18n/ru/*.ts` — template
  text, but also strings in `<script>`, stores, composables, utils, toasts, aria-labels,
  placeholders, `title`/`alt`, option labels, status/role labels mapped from codes, and demo data;
- counts use plural keys (`'{n} item | {n} items'`, three ru forms), never string concatenation;
- dates, numbers and money go through `src/i18n/format.ts`, never `toLocale*`/`Intl` with a fixed locale;
- server errors are shown by `errorCode` (`utils/shopErrorMessage.ts`), never the raw message;
- a new ui-kit text is a prop with an English default; storefront passes the translation, and
  manager (no vue-i18n, Russian UI) passes its Russian text explicitly so its screens don't change;
- DB data (product, brand, category, trading point names) is shown as is, never translated;
- switch the language in the header and screenshot the changed screens in EN and RU: no text
  stays in the other language.

## What this skill does not cover

- Table-specific concerns (pagination, filters, view chips, column mobile hints) —
  `manager-table-standard` is the authority there.
- Backend/GraphQL schema design — this is presentation-layer only.
- Storefront pricing/business logic — see `docs/pricing.md` and the customer-pricing plugin rules.
