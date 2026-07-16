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

### E2E tests (Playwright)

- Location: `packages/e2e/storefront/`
- Requires running dev stack (`make dev`) and seeded data (`make seed`)
- Before writing or debugging E2E tests, read **`docs/e2e-testing.md`** — it documents known gotchas (stale auth, auto-loadMore instability, cart persistence across runs, ES null vs undefined).

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

9. **An order's originating instance always wins — a replica is read-only for real users.**
   Never resolve an order conflict by last-write-wins/timestamp comparison (real delivery delay
   under backoff means "arrived last" ≠ "happened last", and `Order.state` is an FSM, not an
   independently-mergeable field — see `docs/architecture.md`'s "Orders: direction follows the
   instance of origin" for the full reasoning). `ReplicaOrderInterceptor`/`ReplicaOrderProcess`
   (`packages/plugins/sync/src/replica-order.guard.ts`) enforce this — do not bypass or weaken
   them to let a non-owning instance mutate an order directly.

10. **A cross-instance fact about an order that can legitimately be witnessed by a non-owning
    instance (payment, reservation, approval, ERP status, and any future one) is its own
    independent event stream — never a direct mutation of another instance's order, and never
    folded into `order.updated`'s payload.** See `docs/architecture.md`'s "Order as a read-model:
    independent event streams per concern (CQRS)" for the full principle and worked examples
    (`ReservationConfirmedEvent`, `ApprovalRequest`, `ErpOrderStatusEvent`, planned
    `payment.recorded`). The owning instance applies a fact for real, through the normal Vendure
    APIs; every other instance applies it as an informational `customFields` projection only.

11. **A payment touches four independent sources of truth — never conflate them, never let one
    silently overwrite another.** The payment provider/branch kassa/bank owns the real state of
    the money movement (`paymentStatus`); this platform owns the business process and event
    routing only; 1C owns the accounting/management reflection, but only for postings it has
    actually accepted (`erpPostingStatus`) — 1C being unreachable does not make an
    already-captured payment "unconfirmed"; ККТ/ОФД owns the fiscal receipt
    (`fiscalizationStatus`), which completes asynchronously and independently of the other two.
    Track these as separate fields, never one combined status. Refunds and disputes/chargebacks
    are their own entities with their own lifecycles — never a negative payment record, never
    folded into each other. Never invent a synthetic Vendure `Payment` to make an order's state
    machine match a real-world payment that doesn't map 1:1 to that order. Any mismatch between
    systems becomes a `PaymentReconciliationIssue` for a human to resolve — never an automatic
    pick of whichever number looks right. Full design, including the three-level idempotency
    requirement (command idempotency, inbound event dedup, business-level uniqueness) and why
    it's needed even with one integration owner per channel: `docs/payments.md`
    (`tasks/payments-ru.md` for the Russian translation).

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
├── index.ts                  # Public exports only — re-exports from ./src/...
├── tsconfig.json             # extends ../../../tsconfig.base.json, outDir: ./dist, rootDir: .
└── package.json              # main: ./dist/index.js, types: ./dist/index.d.ts
```

**`package.json` required fields:**

```json
{
    "main": "./dist/index.js",
    "types": "./dist/index.d.ts",
    "scripts": {
        "build": "tsc",
        "dev": "tsc --watch"
    }
}
```

`"dev": "tsc --watch"` is kept for standalone/manual debugging of a single plugin (see the Dev process management section) but is **not** what runs in the normal `make dev` flow — see "Monorepo `dist/` and dev watching" below for the actual mechanism (TypeScript Project References, one shared `tsc -b --watch` process for all plugins).

**`index.ts` required pattern** — always re-export via `./src/`, never `./`:

```typescript
export { MyPlugin } from './src/my.plugin';
export { MyService } from './src/my.service';
```

**Why:** Node resolves `@mivend/plugin-x` → `dist/index.js`. The root `index.ts` compiles to `dist/index.js` and re-exports from `dist/src/...`. Without a root `index.ts`, there is no `dist/index.js` and the server crashes at startup with `Cannot find module`.

Rules:

- Plugin options are passed through the `VendurePlugin` options object — not via environment variables directly.
- All TypeORM entities have explicit `@Column` type annotations. Never rely on TypeScript type inference for columns.
- If a service file exceeds 300 lines, split it into focused sub-services.

---

## Inter-plugin communication

### Synchronous dependency (Plugin A needs Plugin B's service)

Use standard NestJS `exports` / `imports` — `@VendurePlugin` supports both fields officially.

**Plugin B — exports its service:**

```typescript
@VendurePlugin({
    providers: [CounterpartyService],
    exports: [CounterpartyService],
})
export class CounterpartyPlugin {}
```

**Plugin A — imports Plugin B and injects the service:**

```typescript
@VendurePlugin({
    imports: [CounterpartyPlugin],
    providers: [ErpImportService],
})
export class ErpImportPlugin {}

// ErpImportService constructor:
constructor(private counterpartyService: CounterpartyService) {}
```

Make sure the consuming plugin also lists the imported plugin in the app's `plugins` array in `vendure-config.ts` — order matters if there are init-time dependencies.

### Asynchronous / decoupled communication

Use Vendure's `EventBus`: one plugin publishes an event, another subscribes. This is the right pattern for plugin-sync and any flow that must not block the caller.

### What not to do

- `TransactionalConnection.rawConnection.getRepository(Entity)` — bypasses service layer and business logic; breaks when the owning plugin changes its schema.
- `ModuleRef.get(token, { strict: false })` — undocumented NestJS hack that bypasses module boundaries; not Vendure-idiomatic.
- Importing internal files from another plugin (e.g. `import { CounterpartyService } from '../counterparty/src/...'`) — only import from the plugin's public `index.ts`.

### Monorepo `dist/` and dev watching

Each plugin has `"main": "./dist/index.js"`. When Plugin A imports from `@mivend/plugin-b`, Node.js resolves `dist/index.js` — not `src/`. If `dist/` is stale or missing an export, the import arrives as `undefined` at runtime (TypeORM throws `No metadata for "undefined"`).

**In dev, all plugins are built by a single `tsc -b --watch` process** (TypeScript Project References), not by N independent `tsc --watch` processes — one per plugin. This is started automatically by `make dev` via `pnpm dev:plugins` (`tsc -b packages/plugins/tsconfig.json --watch`). Changes to any plugin are compiled to `dist/` immediately; `ts-node-dev` picks them up on the next server restart.

**Why not N independent `tsc --watch` processes (the old setup)**: each `tsc --watch` process loads and caches the _entire_ type graph of its dependencies independently, and `@vendure/core`'s type graph (TypeORM + GraphQL + NestJS) is heavy — with 10 plugins that's 10 full copies of that graph in memory simultaneously, which has caused real OOM/VPS crashes. It's also a **correctness bug, not just a memory cost**: an independent `tsc --watch` on plugin A has no visibility into plugin B's source changes — it only rebuilds when _its own_ watched files change, so it can silently keep serving a stale `dist/` for a dependency that was just edited, until some unrelated trigger causes it to rebuild. A single `tsc -b --watch` knows the full dependency graph and rebuilds dependents automatically when a dependency changes, in one process, sharing one compiler instance.

**When adding a new plugin that depends on another `@mivend/plugin-*` package**:

- Add `"composite": true` to the new plugin's `tsconfig.json` `compilerOptions` (required for it to participate in project references — every plugin's `tsconfig.json` already has this).
- Add a `"references"` array pointing at each `@mivend/plugin-*` dependency's directory, e.g. `"references": [{ "path": "../counterparty" }]` — this must mirror the plugin's actual `package.json` dependencies exactly, or `tsc -b` won't know to rebuild it when that dependency changes (silently reintroducing the stale-`dist/` bug this setup exists to prevent).
- Add the new plugin's directory to the `"references"` array in `packages/plugins/tsconfig.json` (the root aggregator) — a plugin missing from this list is never built by `tsc -b --watch` at all.
- A plugin with **no** `@mivend/plugin-*` dependencies still needs `"composite": true` but no `"references"` entry of its own (see `customer-pricing`/`cross-reference`/`erp-order`/`popular-products`/`price-entry`'s `tsconfig.json` for the pattern).

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

## Pagination

**Every list that can grow unboundedly over time must be paginated server-side from day one.** "Fetch everything, then filter/paginate in application code or on the frontend" is a recognized antipattern, not a defer-until-scale concern — see `docs/ai/PROJECT_CONTEXT.md`'s "Approvals inbox: real server-side pagination" (2026-07-14) for the real incident this rule comes from: `myApprovalsInbox` had no pagination at all, loaded every pending `ApprovalRequest` company-wide on every call, and filtered in JS.

**A list is exempt only if it is genuinely, structurally bounded** — not "small today." Judgement call at planning time, not a blanket rule:

- Exempt: a fixed small set (e.g. the 6 seeded manager-portal roles, a customer's own trading points, localStorage-backed favorites).
- Not exempt: anything keyed by orders, customers, documents, approval requests, audit/version history, or any other row that accumulates over the business's lifetime — even if the seed/demo dataset is small today.

**What "paginated server-side" means concretely:**

- The GraphQL query takes `take`/`skip` (or cursor) args and returns a real paginated shape (`{ items, totalItems }` — see Vendure's own `PaginatedList<T>`), never a bare `[T!]!` for an unbounded list.
- The backend query itself is bounded (`LIMIT`/`OFFSET` or equivalent) — not "the resolver returns everything and the frontend slices it," and not "the resolver loads everything into memory to compute something, then returns the full list anyway."
- If filtering requires per-row business logic that can't trivially be a SQL `WHERE` (e.g. a permission check, a computed eligibility rule), do not default to "load everything and filter in JS." First check whether the rule can be restated as a property of the **caller** (cheap, computable once, pushable into SQL as a bounded `OR`/`IN` list — see `ApprovalRequestService.getEligibleStepPairs`/`buildAwaitingDecisionBracket` for a worked example) before reaching for a new denormalized/materialized table.
- Search/filter fields exposed to the frontend must only cover what the backend query can actually push down. Don't let the frontend imply a search capability (e.g. "search by customer name") that the backend can't honor without loading everything — either make the backend resolve it too, or scope the filter UI to what's real.

**When a single admin list needs to show rows from two structurally different write-side sources** (e.g. a materialized entity with typed columns, plus a workflow/request entity whose business fields live in a JSON-in-`text` payload) — do not try to make one runtime query UNION/join across both. Add a dedicated **read-model/projection entity** instead, written to (never read _from_ by anything but its own service) at exactly the points where the write-side state already changes. This mirrors Vendure's own built-in pattern: `SearchIndexItem` (the search plugin) is a denormalized projection of `Product`/`ProductVariant`, kept in sync by event listeners, never queried by joining the source tables at request time — this project's own `DiscountRegistryEntry` (`packages/plugins/price-entry`) follows the same shape for the `/discounts` registry (see `DiscountRegistryService` — the only file allowed to call `connection.getRepository(ctx, DiscountRegistryEntry)`; every other file must go through its methods). Accept that a projection can briefly lag its source (same tradeoff `SearchIndexItem` makes) — that's a legitimate cost, not a bug, as long as every write path that changes the source also updates the projection.

**Reference implementations**: `OrdersFilterBar.vue`/`fetchOrdersPage` (`packages/manager/src/api/orders.ts`) for straightforward filter-arg pagination; `ApprovalRequestService.findAwaitingMyDecision`/`findAllInvolving` (`packages/plugins/approval-workflow/src/approval-request.service.ts`) for the harder case of per-row eligibility pushed into SQL via TypeORM `Brackets`/correlated subqueries; `DiscountRegistryEntry`/`DiscountRegistryService` (`packages/plugins/price-entry`) for the read-model/projection case above.

**When adding or reviewing any list-rendering page or the query behind it**, check this rule explicitly — it is not automatically covered by lint/type-check/tests. See **[#39](https://github.com/NlightN22/mivend/issues/39)** for the current inventory of tables still needing this fix (audited 2026-07-14).

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

## REST endpoint documentation (Swagger/OpenAPI)

Shop/Admin APIs are GraphQL and self-documenting via introspection — this section only applies to plain `@Controller()` REST endpoints (currently `plugin-erp-import` and `plugin-sync`, called by the ERP integration). These are documented automatically via `@nestjs/swagger`, mounted at `/api-docs` (UI) and `/api-docs-json` (raw OpenAPI document) — see `apps/server/src/main.ts` and issue #28.

**Any REST controller's request body, query params, or response shape must be a class, never a plain `interface`.** `@nestjs/swagger`'s `@ApiProperty()` decorators only produce schema metadata on classes — an interface-typed REST payload compiles fine but silently produces an empty/useless schema instead of a build error, so this is easy to violate by accident.

- Put the DTO class next to the controller that uses it, in a `src/dto/` folder — not mixed into a shared `types.ts` with plain internal interfaces.
- Annotate every field with `@ApiProperty()` (or `@ApiPropertyOptional()` for optional fields), including a `description` when the field name alone doesn't make its meaning obvious.
- If a REST DTO intentionally mirrors an internal type used elsewhere (e.g. a GraphQL input, or a strict discriminated union used internally), keep the DTO in sync by hand — there is no automatic bridge between plain TypeScript types and Swagger-visible classes.
- **Mount any new `SwaggerModule.setup()` call via `bootstrap()`'s `onBeforeAppListen` option, never in a `.then()` after `bootstrap()` resolves.** Vendure calls `app.listen()` internally before returning; NestJS finalizes its routing/fallback-handler chain at that point, so routes registered afterward 404 silently even though the OpenAPI document itself builds with correct schemas. This cost real debugging time once — don't repeat it.

**Whenever a REST endpoint's request/response shape changes, the DTO classes must change with it in the same commit — never left for later.** This includes: adding/removing/renaming a field, changing a field's type or nullability, adding a new variant to a discriminated payload (e.g. a new `ImportRecord` type in `erp-import`), or changing a nested object's shape. A DTO drifting out of sync with the real payload is worse than no DTO at all — it actively misleads external integrators (1C or otherwise) into building a client against a contract that no longer matches reality, and won't be caught by `tsc` since the DTO and the internal type are structurally independent (see "keep the DTO in sync by hand" above).

Checklist for any change that touches a REST payload:

- [ ] Updated (or added) the corresponding field(s) on the DTO class, with `@ApiProperty()`/`@ApiPropertyOptional()` and an explicit `type` for any nullable/union-typed field (plain `nullable: true` without `type` silently renders as `type: object` — reflect-metadata cannot infer a type from a TS union; this is a real bug class, not a hypothetical).
- [ ] If the payload is a discriminated union (like `ImportRecordDto.data`), added the new variant to both the `oneOf` array and the `discriminator.mapping` in the same place (`packages/plugins/erp-import/src/dto/batch-import.dto.ts`'s `TYPE_TO_SCHEMA`) — one without the other produces a schema that silently omits the new type from the published contract.
- [ ] Regenerated/eyeballed `/api-docs-json` after the change (e.g. `curl localhost:3000/api-docs-json | jq '.components.schemas.<Dto>'`) to confirm the new/changed field actually appears with the right type — don't assume the decorator did what you intended.
- [ ] Scanned the diff for stray non-English text in any new `description`/`example` string (see the Language section) — DTO field descriptions ship in a public-facing document, unlike most internal code comments.

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

---

## Vendure-specific gotchas

- **GraphQL schema requires server restart.** Vendure builds the GraphQL schema once at startup. Any change to `customFields`, plugin schemas, or resolvers requires a server restart — hot reload does not apply.

- **A `fetch()` network failure is not the same as "logged out" — never conflate them.** Vendure's default `sessionDuration` is `'1y'`; a session cookie stays valid across ordinary server restarts (sessions are DB-backed, not held in memory). Real incident: both `useAuthStore`s (`packages/manager/src/stores/auth.ts`, `packages/storefront/src/stores/auth.ts`) had a bare `catch { customer.value = null }` around their "who am I" query — a transient network error (e.g. the dev server mid-restart) was indistinguishable from a real `activeCustomer: null` response, so a momentary blip force-logged-out an otherwise-still-valid session and bounced the user to `/login`. Fixed by having `adminApi`/`shopApi` (`packages/*/src/api/client.ts`) retry a few times with backoff on a genuine `fetch()`-level failure and throw a distinguishable `ApiNetworkError` only once retries are exhausted; the auth stores only clear their user state on a real, successful response confirming "not logged in" — an `ApiNetworkError` leaves the previous state alone. Apply the same pattern (retry + distinguish network failure from a real auth response) to any other code that decides "am I logged in" from an API call's success/failure.

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

- **`[ID!]`/`ID!` GraphQL _input_ args are coerced to the entity id strategy's native type (a `number`, under this project's default auto-increment strategy) — but `id` fields on _output_ types are always serialized back to `string`.** Concretely: a mutation argument typed `counterpartyIds: [ID!]` arrives at the resolver as `number[]`, even though a `counterparties { items { id } }` query returns `id` as `string`. If an id from input args is persisted (e.g. into an `ApprovalRequest.payload` JSON blob) and later compared against an id from a query response (e.g. `Map.get(id)` keyed by query-returned ids), the comparison silently fails — a `number` and the `string` that looks identical are never `===`, and `JSON.stringify`/`Map` don't coerce. Real incident: `DiscountGrantService.requestGrant` stored `counterpartyIds` straight from `input.counterpartyIds` (typed `string[]` in TS, but actually `number[]` at runtime); `api/discounts.ts`'s `customerLabel()` then did `namesById.get(id)` against string-keyed data and always missed, silently falling back to printing the raw id instead of the customer's name. **Rule: any id captured from GraphQL input args and persisted or compared elsewhere must be explicitly `String()`-coerced at the point of capture** — don't trust the input type annotation, and don't assume it matches the shape of the same id coming back from a query.

---

## Dev seed rules

All test/dev data is inserted exclusively via `make seed`, which calls `infrastructure/scripts/seed-erp.mjs`.

The seed script sends data **only through the `erp-import` plugin REST endpoint** (`POST /erp/import/batch`). This means every data type that needs to be seeded must have a corresponding record type in the plugin (`product`, `price`, `stock`, `customer`, etc.).

**Never seed via:**

- Admin GraphQL API directly
- Raw SQL / `psql` exec
- TypeORM repositories called outside the plugin
- Any other bypass of `erp-import`

The only exception: data that structurally cannot be expressed as an import record (e.g. Vendure system configuration, channel setup, tax zones). In that case, document the reason inline in the seed script with a comment explaining why the plugin cannot handle it. Existing exceptions: `seed-access-roles.mjs` (RBAC roles/scope config), `seed-erp.mjs`'s `ensureOrgStructureAdmins` (demo Administrator logins), `seed-approvals.mjs` (`ApprovalRequest` rows — a real workflow state machine, not ERP master data; goes through the real Admin GraphQL mutations, same as a manager would use).

If a new data type needs seeding — **add a record type to `erp-import` first**, then use it from the seed script.

Use **`make seed-all`** to run the full local seeding order in one command: `seed-access-roles` → `seed` → `seed-approvals` (also what `dev-fresh.sh` runs). The three targets stay separate (and order-dependent — `seed-approvals` needs roles/administrators/counterparty `cnt-001` already existing) only for the occasional case of re-running just one without wiping the others.

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
