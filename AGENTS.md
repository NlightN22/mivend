# AGENTS.md

Development rules and principles for mivend.
Read this before writing any code.

---

## Core principles

- **Modularity first.** Every piece of logic lives in the smallest meaningful unit. If something can be a separate file, it should be.
- **File size limit: 200–300 lines.** If a file exceeds this, it needs to be split. No exceptions.
- **No excess code.** Only implement what is required right now. No speculative abstractions, no "we might need this later."
- **Research before implementing.** Before adding a library or choosing a pattern, verify it is the current best practice. Check Vendure docs, check npm trends, check GitHub issues. Don't assume.
- **Clean separation.** Each layer has one responsibility. Resolvers do not contain business logic. Services do not build GraphQL responses. Entities do not have methods beyond simple accessors.

---

## Privacy and confidentiality

This is a public open-source repository. Keep all content generic.

- No company names, brand names, or legal entity names anywhere in the codebase.
- No geographic locations (cities, regions, countries) specific to the business.
- No client names, employee names, or internal system names.
- No internal pricing details, financial figures, or contract terms.
- Architectural decisions may reference general technical constraints (e.g. "unreliable network between locations") but must not describe specific infrastructure or vendors.
- Use generic placeholders in examples: `branch-a`, `branch-b`, `customer-123`, `price-type-wholesale`.

---

## Language

Everything is in **English** — code, comments, variable names, configs, docs, GitHub issues, pull requests, commit messages, and all project files.

The only exception: individual files explicitly requested to be in Russian by the developer.

---

## Monorepo structure

**Kept accurate on purpose — if you edit the actual layout, update this tree in the same
change.** One Vendure codebase (`apps/server`), not per-instance app directories: central hub vs.
branch is an _env-driven identity_ (`INSTANCE_TYPE`/`INSTANCE_ID`), not a separate app — see
`docs/environments.md`.

```
mivend/
├── apps/
│   └── server/                # The one Vendure codebase — central hub or branch is decided by
│                               # INSTANCE_TYPE/INSTANCE_ID at runtime, see docs/environments.md
├── packages/
│   ├── plugins/                # Vendure plugins — one package per plugin, see current list
│   │   │                       # under packages/plugins/ (not enumerated here — it changes
│   │   │                       # often enough that a fixed list here would just go stale again)
│   │   └── ...
│   ├── storefront/             # Vue 3 + TypeScript — customer-facing client portal
│   ├── manager/                # Vue 3 + TypeScript — B2B/backoffice manager portal (this is
│   │                           # NOT Vendure's built-in Admin UI — that's mounted under /admin
│   │                           # on apps/server itself, no separate package; see
│   │                           # docs/environments.md's "Reaching a contour from outside this
│   │                           # box" for the distinction)
│   ├── ui-kit/                 # Shared component library — ONE package for both storefront
│   │                           # and manager, not two separate kits
│   ├── shared/                 # Shared TypeScript types and contracts
│   └── e2e/                    # Playwright E2E suite
├── infrastructure/
│   ├── docker/
│   └── scripts/
├── docs/                       # Architecture, domain, decisions
├── AGENTS.md
├── pnpm-workspace.yaml
└── package.json
```

**Known naming inconsistency, deliberately not fixed yet**: `packages/storefront` and
`packages/manager` don't share a naming pattern (one is a role-ish English word, the other a
literal portal name) — a rename to something symmetrical (e.g. `client`/`manager`) has been
discussed but is explicitly parked, not scheduled. Don't rename either package without raising it
first — it touches pnpm workspace refs, Vite/nginx config, CI, and `docs/environments.md`'s port
tables everywhere.

---

## Testing requirements

Testing is mandatory — not optional. Every plugin and significant piece of logic must have tests
before it is considered done.

Full strategy, level definitions, database isolation, mocking rules, worker testing, and E2E
strategy: **`docs/testing-strategy.md`**. Architectural risk catalog (data isolation, idempotency,
inbox lifecycle, outbox atomicity, ordering, concurrency, retry, partial failure, overlaps,
source ownership, eventual consistency, authorization, contract compatibility) with minimum
scenarios per pattern: **`docs/testing-patterns.md`**.

**Before writing or changing any test, or any code that changes a business flow, CQRS event,
inbox/outbox, worker, scope, permission, or external contract — call the `test-design` skill
first.** It requires reading `AGENTS.md` + the two docs above, identifying business invariants,
data ownership/scope, and external boundaries, checking for existing close tests before adding
new ones, and producing a short test plan (changed behavior, invariants, scope, failure modes,
applicable patterns, level per scenario, reused coverage, deliberate omissions).

The canonical, single source for this procedure is `.claude/skills/test-design/SKILL.md` — it
applies to every agent working in this repo, not only Claude Code. If your tooling has no
skill-invocation mechanism (Codex, or any other agent that only reads `AGENTS.md`/repo files
directly): read `.claude/skills/test-design/SKILL.md` yourself and follow its procedure and test
plan format inline before writing or changing tests — do not skip this step just because there is
no `Skill` tool call available to you. Do not duplicate that file's content elsewhere; if your
tooling needs its own entry point, add a thin adapter file that points back to it instead.

**Rule: minimum sufficient level.** Never copy the same scenario set onto every level. A business
rule belongs in a unit test; a technical seam in an integration test; a full component chain in a
component test; a boundary in a contract test; only a handful of critical end-to-end routes in
E2E. No unjustified duplication across levels.

**Rule: automated tests run only against the local contour's seeded/synthetic data — never
against a real external source.** This follows directly from issue #68's contour separation (see
`docs/environments.md`): `make test`/`make test-int`/`make e2e` all run against `make dev`'s local
contour (`INTEGRATION_KAFKA_ENABLED=false`, synthetic `erp-import`/`seed-erp.mjs` data), never
against `make dev-staging-integration`'s real Integration Service Kafka connection. Concretely:

- If a test needs data that doesn't exist yet in the local seed set (a new `PriceType`, a
  `Warehouse` with a specific shape, a Kafka message payload to feed a handler test), the fix is
  to **extend the seed data or the test's own fixtures** (a new `erp-import` record type — see
  the `backend-plugin-rules` skill's dev seed rules — or a synthetic protobuf-encoded message the
  test constructs itself) — never
  to point a test at the staging-integration contour to borrow real data from there.
- `erp-integration`'s Kafka consumer/producer tests mock the broker/Schema Registry client (see
  `docs/testing-strategy.md`'s mocking strategy — external transport boundaries are exactly what's
  allowed to be mocked); they never require a live connection to `is.komponent-m.ru`, in any test
  level, including integration/component tests.
- The staging-integration contour's own database is deliberately **never seeded** (see
  "Environments / contours" in `docs/environments.md`) — it exists solely to validate the real
  contract against Integration Service's actual broker, taking whatever real data arrives as-is.
  Manually inserting synthetic rows there to make a manual check "work" defeats its entire purpose
  (masking a real contract mismatch) and reintroduces the exact synthetic/real data mixing #68 was
  about preventing, just via a different mechanism (manual seeding instead of an accidental Kafka
  connection).
- A manual, deliberate verification against the real broker (e.g. confirming a consumer fix
  actually decodes a real message) belongs in `make dev-staging-integration`, is not part of the
  automated suite, and is not a substitute for the automated tests above — both are required where
  applicable, not either/or.

### Running tests

Always run tests via Makefile, not directly through pnpm:

- `make test` — unit tests (offline, no infrastructure needed)
- `make test-int` — integration/component/contract tests (starts dev infrastructure via `make up` automatically)
- `make e2e` — Playwright E2E (requires `make dev` + `make seed`)

Never use `pnpm test` or `pnpm --filter ... test` directly — use the Makefile targets.

### CI/CD

- Every push: lint + type-check + unit tests (`.github/workflows/ci.yml`)
- Every PR to main: integration tests (`.github/workflows/integration.yml`)
- A PR cannot be merged if CI is red

### Definition of done

A change is not done until: applicable risks are identified with a test plan; tests are added at
the minimum sufficient level; positive and necessary negative cases pass; data isolation,
idempotency, retry/recovery, and atomicity are checked wherever they apply; contract is checked
for any external-boundary change; no unjustified duplication; targeted tests and the required
Makefile commands pass; deliberately uncovered risks are reported with a reason. Full checklist:
`docs/testing-strategy.md`'s "Definition of done".

---

## Sync rules index (non-negotiable — numbers are stable, don't renumber)

Full detail for each rule now lives in one of two skills, split by transport boundary — read the
one that matches what you're touching **before** writing or changing code there:

- **`internal-sync-rules`** — hub↔branch RabbitMQ (`plugin-sync`): rules 5 (internal half), 8, 9, 10.
- **`external-integration-rules`** — Integration Service/Kafka (`plugin-erp-integration`),
  payments, fiscal registrar, any future external webhook/API: rules 5 (external half), 6, 7, 11,
  12, 13.

**Numbers below are stable identifiers — a huge number of inline code comments across this repo
cite them as `AGENTS.md sync rule #N`. Do not renumber even when moving detail elsewhere; add a
new rule at #14+ instead of inserting.** See `docs/sync.md` for the full design.

1. **Outbox pattern is mandatory.** Any data that must reach another instance/system is first
   written to an outbox table **in the same DB transaction** as the business data. Sending
   directly to the transport without an outbox record is forbidden — it breaks delivery
   guarantees.
2. **Every consumer must be idempotent.** Processing the same `eventId` twice must be a no-op.
   Use a unique index on `eventId` as a hard safety net, not just application-level checks.
3. **Ack only after commit.** A message is acked only after the local DB transaction commits
   successfully. Acking before write risks data loss on crash.
4. **No silent drops.** Every failure is logged, retried with backoff, and eventually routed to
   a dead-letter queue for manual inspection. `try/catch` that swallows sync/integration errors
   is forbidden.
5. **One plugin owns each transport** — `plugin-sync` owns RabbitMQ (hub↔branch),
   `plugin-erp-integration` owns Kafka/Integration Service; nothing else touches either
   directly. Full detail: both skills above (each covers its own half).
6. **Branches never call the ERP or Integration Service** — central-hub-only. Full detail:
   `external-integration-rules`.
7. **ERP is master for business data** (price types, prices, catalog, customer core fields,
   credit limits) — flows ERP → Hub → Branch, never modified locally on branches. Full detail:
   `external-integration-rules`.
8. **Reservations sync Branch → Central only.** Full detail: `internal-sync-rules`.
9. **An order's originating instance always wins** — never last-write-wins. Full detail:
   `internal-sync-rules`.
10. **Order as a read-model — independent event streams per concern (CQRS)** for any
    cross-instance fact. Full detail: `internal-sync-rules`.
11. **A payment has four independent sources of truth** — provider/bank, this platform, the
    ERP, the fiscal registrar — never conflate them. Full detail: `external-integration-rules`.
12. **Never process a risky inbound event synchronously** — durable inbox first, async
    worker second. Full detail: `external-integration-rules`.
13. **Persist the external system's own reference id**, not only an internal id, on any record
    representing an external fact. Full detail: `external-integration-rules`.

---

## Backend plugin development

Plugin layout, inter-plugin communication, the business-data-in-DB rule, server-side pagination,
REST/Swagger DTOs, and accumulated Vendure-specific gotchas all moved to the
**`backend-plugin-rules`** skill — read it before creating a new plugin, adding a
resolver/service, or touching any list/pagination query. Never modify Vendure core
(`node_modules/@vendure`) — if it doesn't support something natively, build a plugin.

**Where did a section go?** A number of code comments cite an AGENTS.md section by name (not
number) that moved during this reorganization — this table is the redirect:

| Old AGENTS.md section name                                    | Now lives in                       |
| ------------------------------------------------------------- | ---------------------------------- |
| Vendure rules / Plugin structure / Inter-plugin communication | `backend-plugin-rules` skill       |
| Business data must live in the database / Pagination          | `backend-plugin-rules` skill       |
| REST endpoint documentation (Swagger/OpenAPI)                 | `backend-plugin-rules` skill       |
| Vendure-specific gotchas / Dev seed rules                     | `backend-plugin-rules` skill       |
| Sync rules #5 (RabbitMQ half) / #8 / #9 / #10                 | `internal-sync-rules` skill        |
| Sync rules #5 (Kafka half) / #6 / #7 / #11 / #12 / #13        | `external-integration-rules` skill |

Sync rule **numbers** (1-13) didn't change — see "Sync rules index" above.

---

## TypeScript

- Strict mode enabled everywhere (`"strict": true`).
- No `any`. Use `unknown` and narrow, or define proper types in `packages/shared`.
- Prefer explicit return types on public methods.
- Interfaces over type aliases for object shapes that will be implemented or extended.

---

## Naming conventions

| Thing                 | Convention                                | Example                                   |
| --------------------- | ----------------------------------------- | ----------------------------------------- |
| Files                 | `kebab-case`                              | `reservation-service.ts`                  |
| Classes               | `PascalCase`                              | `ReservationService`                      |
| Variables / functions | `camelCase`                               | `getActiveReservations`                   |
| GraphQL mutations     | `verbNoun`                                | `createReservation`, `releaseReservation` |
| GraphQL queries       | `nounOrNounList`                          | `reservation`, `reservations`             |
| DB table names        | `snake_case`, plugin-prefixed             | `reservation_item`, `customer_price_type` |
| Env variables         | `SCREAMING_SNAKE_CASE`, instance-prefixed | `BRANCH_DB_HOST`, `CENTRAL_SYNC_INTERVAL` |

---

## Comments

Write no comments by default.
Add a comment only when the **why** is non-obvious: a hidden constraint, a workaround for a specific bug, a subtle invariant.
Never comment what the code does — names do that.

---

## License

This project is licensed under **GPL-3.0-or-later**, required by Vendure core (GPL-3.0-or-later) which this project directly depends on.

Every `package.json` in the monorepo must contain:

```json
"license": "GPL-3.0-or-later"
```

This applies to all packages without exception: `apps/*`, `packages/shared`, `packages/plugins/*`.
Do not use any other license. Do not omit the field.

---

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

---

## Storefront rules

See `docs/frontend.md` for the full architecture. Critical rules:

1. **Pages are thin.** No business logic in `pages/` — all logic goes to composables or stores.
   A page component should only compose: layout + components + store calls.

2. **Never edit `src/api/generated/`** — it is overwritten by codegen on every run.
   Run `pnpm --filter @mivend/storefront codegen` after changing `.graphql` operation files.

3. **All GraphQL operations must be typed via codegen.** Raw string queries with hand-written
   types are forbidden. Every query/mutation lives in a `.graphql` file next to the page or
   component that uses it.

4. **No hardcoded UI strings in templates.** Use `$t('key')` from vue-i18n.
   All strings are defined in `src/i18n/ru.ts`.

5. **Virtual scroll for long lists.** Use `ElTableV2` for any list that may exceed 100 rows.
   Standard `ElTable` only for short static lists (e.g. cart items).

6. **One Pinia store per domain.** Stores do not import each other.
   Cross-domain logic belongs in a composable, not in a store.

---

## Manager portal rules

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

---

## Backend: Vendure gotchas and dev seeding

The accumulated Vendure-specific gotchas (GraphQL schema restart requirement, flat customFields
filters, the `order` SQL-alias quoting trap, paginated-list `<EntityName>List` auto-injection,
GraphQL id `number`/`string` coercion, etc.) and the dev seed rules (`make seed`/`seed-all`,
`erp-import`-only, never a direct GraphQL/SQL/TypeORM bypass) both moved to the
**`backend-plugin-rules`** skill.

---

## Git workflow

**Commit after every completed change — do not wait for an explicit "commit this" request.**
This applies to every agent working in this repo (Claude Code or otherwise), same as the rest of
this file.

- "Completed" means: the change satisfies its own task (a fix, a feature slice, a refactor, a
  doc/config update) and passes the applicable checks — **Mandatory final checks** below for
  code, or the relevant `make test`/`make lint` subset for a narrower change. Do not commit
  half-finished or currently-failing work just to checkpoint it.
- One commit per logical change, not one commit per file and not one giant commit bundling
  unrelated changes together. If a review/audit round produces several fixes to the same feature,
  one commit for that whole round is fine (see the commit message convention below).
- Still follow every other git rule already in place (Claude Code's own tool instructions, and
  general good practice for any agent): never `--force`-push, never `--amend` a commit that's
  already been reviewed/pushed, never skip hooks (`--no-verify`), never commit a file that looks
  like it holds a secret (double-check `git status`/`git diff` contents before staging, especially
  after a broad `git add`), and never commit a `.env*` file that isn't already tracked as an
  `*.example` template — `.gitignore`'s `.env.*` pattern exists specifically to keep real
  credentials (Integration Service Kafka creds, DB passwords, etc.) out of the repo; see
  `docs/environments.md`.
- Before committing, run whatever this file's other sections require for the kind of change made
  (test-design's test plan, final-check's `make lint`/`make test`, access-control-review, etc.) —
  "commit after every change" does not relax any of those, it just removes the need to ask
  permission for the commit step itself once they've passed.
- Commit messages: describe _why_, not just _what_ (see any recent commit in `git log` for the
  house style); reference the relevant issue number when there is one.
- This does not authorize pushing to a remote or opening/merging a PR on its own — those remain
  separate, explicit-request actions unless a specific workflow in this file (or the user) says
  otherwise.

---

## Dev process management

Starting the full dev stack is done exclusively via `make dev`. Do not start individual processes (server, storefront, plugin watchers) manually — they will accumulate as orphans and exhaust memory.

Rules:

- **Always use `make dev`** to start the development stack. It is designed to be the single entry point and handles all processes together.
- **Never run `pnpm --filter server dev`, `pnpm dev:plugins`, or `pnpm --filter @mivend/storefront dev` directly** unless explicitly debugging a single component in isolation — and even then, kill the process immediately after.
- **If you started a background process manually, kill it before the session ends.** Track PIDs and clean up with `kill <PID>` or `pkill -f <pattern>`.
- **`make dev` is not idempotent by design** — running it twice creates duplicate `tsc --watch` processes. Before calling `make dev`, verify no dev processes are already running: `pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite" | wc -l`. If non-zero — stop with `make down` and kill leftover node processes first.
- **`make up`** only starts Docker infrastructure (postgres, redis, rabbitmq, elasticsearch). It is safe to call repeatedly.

---

## What not to do

- Do not add error handling for scenarios that cannot happen.
- Do not add feature flags for things that are not yet planned.
- Do not create helper utilities "just in case."
- Do not wrap a single function call in another function just for naming.
- Do not add backwards-compatibility shims when you can just change the code.
- Do not write multi-line docstrings or comment blocks.
- **Do not hardcode business enums or type lists in code.** Use database entities instead.
- **Do not omit `"license": "GPL-3.0-or-later"` from any `package.json`.**
- **Do not put business logic in page components.** Pages are thin — use composables and stores.
- **Do not write raw GraphQL strings with manual types.** Use codegen.

## Project context maintenance

When the user asks to summarize results, preserve context, prepare context for a new chat, update project memory, or says similar phrases, use the project-context skill.

The goal is not only to continue the current task, but to maintain a compact global project context for future new tasks.

Update:

- `docs/ai/PROJECT_CONTEXT.md`

This file must describe:

- what this project is;
- what has already been implemented;
- current architecture and important decisions;
- planned next work;
- implementation nuances;
- known problems and limitations;
- commands and checks that are important for future work.

Keep it concise and useful for a new Claude Code chat.

Do not dump long logs or full diffs into the context file.

## Mandatory final checks

After changing code, tests, package files, build config, lint config, TypeScript config, CI config, or project scripts, use the final-check skill before reporting completion.

The default final checks are:

    make lint
    make test

Do not claim the task is complete until these checks are run successfully or explicitly skipped with a reason.

## Final audit — separate session, after implementation

Once an issue (or a non-issue task — cleanup, refactor, documentation pass) is implemented and
the checks above pass, run a **final audit in a separate chat session**, not the one that did the
implementation — a fresh session/context catches things a session that just wrote the code is
prone to rationalize away. This project's own convention for naming that session:
`<project>.audit.<issue-number-or-short-description>` (e.g. `mivend.audit.68`, or
`mivend.audit.cleanup-nginx-configs` for work with no issue number) — mirrors the working
session's own `<project>.<issue-number-or-description>` naming. The audit session's own name
varies per task, so don't assume a fixed one; ask, or check recently-active sessions, if you need
to hand off to it and don't already know its name. Report the audit's findings back to the
implementation session/user; fix anything it flags before considering the work done.
