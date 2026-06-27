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

```
mivend/
├── apps/
│   ├── central/              # Central hub Vendure instance
│   └── branch/               # Branch Vendure instance (one per location)
├── packages/
│   ├── plugins/              # Vendure plugins — one package per plugin
│   │   ├── reservation/
│   │   ├── customer-pricing/
│   │   ├── credit-terms/
│   │   ├── cross-reference/
│   │   ├── search/
│   │   ├── sync/
│   │   ├── acquiring/
│   │   └── pos-api/
│   ├── storefront/           # Vue 3 + TypeScript frontend
│   ├── admin-ui/             # Vendure Admin UI extensions
│   └── shared/               # Shared TypeScript types and contracts
├── infrastructure/
│   ├── docker/
│   └── scripts/
├── docs/                     # Architecture, domain, decisions
├── AGENTS.md
├── pnpm-workspace.yaml
└── package.json
```

---

## Testing requirements

Testing is mandatory — not optional. Every plugin and significant piece of logic must have tests
before it is considered done.

### Unit tests

- Location: `src/__tests__/unit/` inside each package
- Runner: Vitest
- Required for: all service methods with business logic, all utility functions
- Not required for: resolvers (covered by integration), trivial getters/setters
- Rule: mock external dependencies (DB, RabbitMQ, external APIs) — unit tests must run offline

### Integration tests

- Location: `src/__tests__/integration/` inside each package
- Required for: every plugin, all sync flows, all business-critical API operations
- Coverage: positive scenario + at least one negative/edge scenario per operation
- Infrastructure: real PostgreSQL + Redis via GitHub Actions services (see `.github/workflows/integration.yml`)
- Rule: no mocking of the database — integration tests hit a real DB

### Running tests

Always run tests via Makefile, not directly through pnpm:

- `make test` — unit tests (offline, no infrastructure needed)
- `make test-int` — integration tests (starts dev infrastructure via `make up` automatically)

Never use `pnpm test` or `pnpm --filter ... test` directly — use the Makefile targets.

### CI/CD

- Every push: lint + type-check + unit tests (`.github/workflows/ci.yml`)
- Every PR to main: integration tests (`.github/workflows/integration.yml`)
- A PR cannot be merged if CI is red

### Definition of done for any plugin

A plugin is not done until:

- Unit tests cover all service methods
- Integration test covers the main happy path and at least one failure case
- `pnpm test` is green

---

## Sync rules (non-negotiable)

See `docs/sync.md` for the full design. These rules must never be broken:

1. **Outbox pattern is mandatory.** Any data that must reach another instance is first written to
   `sync_outbox` **in the same DB transaction** as the business data. Sending directly to
   RabbitMQ without an outbox record is forbidden — it breaks delivery guarantees.

2. **Every consumer must be idempotent.** Processing the same `eventId` twice must be a no-op.
   Use a unique index on `eventId` as a hard safety net, not just application-level checks.

3. **Ack only after commit.** A RabbitMQ message is acked only after the local DB transaction
   commits successfully. Acking before write risks data loss on crash.

4. **No silent drops.** Every failure is logged, retried with backoff, and eventually routed to
   a dead-letter queue for manual inspection. `try/catch` that swallows sync errors is forbidden.

5. **plugin-sync owns RabbitMQ and the ERP adapter — nothing else touches them.**
   Other plugins publish to Vendure's `EventBus`. `plugin-sync` subscribes and handles transport.
   No other plugin imports from `plugin-sync` or references RabbitMQ directly.

6. **Branches never call the ERP.** Only the central hub communicates with the legacy ERP,
   via the `ErpAdapter` interface implemented inside `plugin-sync`.

7. **ERP is master for business data.** Price types, prices, catalog, customer core fields, and
   credit limits flow ERP → Hub → Branch and are never modified locally on branches.

8. **Reservations sync Branch → Central only.** Branch is the source of truth; the hub aggregates for reporting. Reservations never flow from hub back to branches.

---

## Vendure rules

**Never modify Vendure core.** No edits to `node_modules/@vendure`. All customization is done through plugins.

If Vendure does not support something natively — build a plugin.

---

## Plugin structure

Every plugin is a standalone npm package. Every plugin follows this layout exactly:

```
packages/plugins/<name>/
├── src/
│   ├── <name>.plugin.ts      # VendurePlugin class — entry point only, no logic
│   ├── <name>.service.ts     # Business logic
│   ├── <name>.resolver.ts    # GraphQL resolvers — no business logic here
│   ├── entities/             # TypeORM entities (one file per entity)
│   ├── api/                  # GraphQL schema extensions (.graphql files)
│   └── types.ts              # Plugin-specific TypeScript types
├── index.ts                  # Public exports only
└── package.json
```

Rules:

- Plugin options are passed through the `VendurePlugin` options object — not via environment variables directly.
- Plugins communicate through Vendure's `EventBus` or public service APIs only. Never import another plugin's internal service.
- All TypeORM entities have explicit `@Column` type annotations. Never rely on TypeScript type inference for columns.
- If a service file exceeds 300 lines, split it into focused sub-services.

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

## Business data must live in the database

**Never hardcode business values in code** — no hardcoded enums, no hardcoded lists of types, statuses, categories, or any other domain data.

If it can change without a code deploy, it belongs in the database.

Examples of what must be in the database (not code):

- Price types (RETAIL, WHOLESALE, etc.) — loaded from ERP
- Reservation statuses — stored as varchar, interpreted by service layer
- Payment methods, document types, warehouse codes

Define TypeScript union types or `as const` arrays **only** for internal technical states that are truly fixed by the application logic (not by the business). When in doubt, put it in the database.

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

## Vendure-specific gotchas

- **GraphQL schema requires server restart.** Vendure builds the GraphQL schema once at startup. Any change to `customFields`, plugin schemas, or resolvers requires a server restart — hot reload does not apply.

- **Custom fields in Shop API filters are flat, not nested.** When filtering products by a custom field (e.g. `onSale`), it appears directly in `ProductFilterParameter`, not under `customFields`:

    ```graphql
    # CORRECT
    filter: { onSale: { eq: true } }

    # WRONG — customFields does not exist in ProductFilterParameter
    filter: { customFields: { onSale: { eq: true } } }
    ```

- **`GlobalFlag` is not exported from `@vendure/core`.** Use `'TRUE' as const` for `trackInventory` on variant create/update.

- **Collections in Shop API** have no `isTopLevel` filter — identify top-level collections by `breadcrumbs.length === 2`.

- **`MvCatalogDropdown` must be registered globally in `main.ts`** — it is used inside `AppHeader` which is outside Vue app scope for dynamic imports.

---

## Dev seed rules

All test/dev data is inserted exclusively via `make seed`, which calls `infrastructure/scripts/seed-erp.mjs`.

The seed script sends data **only through the `erp-import` plugin REST endpoint** (`POST /erp/import/batch`). This means every data type that needs to be seeded must have a corresponding record type in the plugin (`product`, `price`, `stock`, `customer`, etc.).

**Never seed via:**

- Admin GraphQL API directly
- Raw SQL / `psql` exec
- TypeORM repositories called outside the plugin
- Any other bypass of `erp-import`

The only exception: data that structurally cannot be expressed as an import record (e.g. Vendure system configuration, channel setup, tax zones). In that case, document the reason inline in the seed script with a comment explaining why the plugin cannot handle it.

If a new data type needs seeding — **add a record type to `erp-import` first**, then use it from the seed script.

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
