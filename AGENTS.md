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
    routing only; the ERP owns the accounting/management reflection, but only for postings it
    has actually accepted (`erpPostingStatus`) — the ERP being unreachable does not make an
    already-captured payment "unconfirmed"; the fiscal registrar/operator owns the fiscal
    receipt (`fiscalizationStatus`), which completes asynchronously and independently of the
    other two.
    Track these as separate fields, never one combined status. Refunds and disputes/chargebacks
    are their own entities with their own lifecycles — never a negative payment record, never
    folded into each other. Never invent a synthetic Vendure `Payment` to make an order's state
    machine match a real-world payment that doesn't map 1:1 to that order. Any mismatch between
    systems becomes a `PaymentReconciliationIssue` for a human to resolve — never an automatic
    pick of whichever number looks right. Full design, including the three-level idempotency
    requirement (command idempotency, inbound event dedup, business-level uniqueness) and why
    it's needed even with one integration owner per channel: `docs/payments.md`
    (`tasks/payments-ru.md` for the Russian translation).

12. **A general anti-pattern, not specific to payments: never process a critical/risky inbound
    event synchronously as part of accepting it — from a webhook, an ERP/1C exchange callback,
    or any other external, potentially-unreliable integration.** The source only knows "did you
    acknowledge receipt", not "did your business logic actually finish" — if the two are the same
    synchronous call and your processing fails or the instance is down, the fact can be lost
    forever with no automatic way to recover it, even though the source only ever sent it once.
    The correct shape, always:
    1. Durably record the raw event first, in its own fast, low-risk write — a real **inbox**
       with a genuine per-row lifecycle status (`pending` → `processing` → `processed`, or →
       `failed` once retries are exhausted), never a bare "have we seen this event" boolean. A
       boolean marks "seen" at receipt time regardless of whether processing later succeeds,
       which silently reintroduces exactly the bug this rule exists to prevent (real incident:
       `plugin-acquiring`'s original `ProcessedProviderEvent`/`recordIfNew` did this, and was
       corrected into `IncomingPaymentEvent`'s real status field before anything shipped against
       it).
    2. Acknowledge receipt once that fast write commits — separate from whether the actual
       processing has happened yet.
    3. Do the real, risky processing **asynchronously**, via a retry-capable worker that sweeps
       for `pending`/retryable rows on its own schedule (not triggered synchronously by step 1).
       If processing fails, the row simply stays retryable — the _next_ sweep resumes it
       automatically, with no special "recovery" code path and no dependency on the original
       caller retrying anything.
    4. Dead-letter (`failed`, terminal) after a bounded number of attempts for manual inspection
       — never retry a genuinely broken event forever (same principle as sync rule #4's "no
       silent drops").

    Reference implementation: `packages/plugins/acquiring`'s `IncomingPaymentEvent` entity +
    `InboxService` (enqueue/claimBatch/markProcessed/markFailed) + `PaymentInboxProcessorService`
    (the actual processing) + `PaymentInboxWorker` (BullMQ `Queue`/`Worker` with
    `upsertJobScheduler`, sweeping once a minute — mirrors `ReservationExpiryWorker`/
    `OutboxWorker`, the established periodic-worker pattern in this codebase). This applies
    beyond payments: any future webhook/callback surface (a real Robokassa integration, a
    shipping-provider status callback, anything else external and unreliable) must follow the
    same shape, not call critical processing directly from the endpoint that receives it.

13. **Any record representing a fact from an external system must capture that system's own
    unique identifier for the fact, not only an internally-generated id — so a human or automated
    process can later reconcile against the source system and detect discrepancies.** This is a
    distinct concern from rule #12 (how inbound events are _processed_): rule #13 is about what
    _fields_ the resulting record must have. Established industry precedent for this: ISO 20022
    payment messages carry an `EndToEndId`/UETR generated by the initiating party specifically so
    matching a payment across every system it passes through reduces to a database join; Stripe
    explicitly distinguishes a short-lived idempotency key (request-retry safety only) from a
    long-lived external reference stored in object metadata for reconciling against the caller's
    own records. Same principle here: an idempotency/dedup key and a reconciliation key can be the
    same value, but their _purpose_ is different, and the reconciliation purpose must not be lost
    even once dedup is no longer needed.
    Concrete instances already in this codebase: `plugin-acquiring`'s `PaymentAttempt` external
    reference (the acquirer's own provider id, a branch kassa's RRN, or the ERP's own
    `erpEventId` — see `docs/payments.md`), and `IncomingPaymentEvent.providerEventId`, which
    serves both as the inbox's dedup key (rule #12) and as the reconciliation key (rule #13) —
    two purposes, one field, by design. When a discrepancy is found using this data, it becomes a
    `PaymentReconciliationIssue` per rule #11 — rule #13 only requires that the data needed to
    detect the discrepancy exists in the first place; it does not itself define how discrepancies
    are resolved.
    This rule is general, not specific to payments or to `plugin-sync`: any future integration
    with an external system (a shipping provider, a new accounting system, anything else) must
    likewise persist that system's own reference for the record it represents, not only this
    platform's internal id.

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

**Reference implementations**: `OrdersFilterBar.vue`/`fetchOrdersPage` (`packages/manager/src/api/orders.ts`) for straightforward filter-arg pagination; `ApprovalRequestService.findAwaitingMyDecision`/`findAllInvolving` (`packages/plugins/approval-workflow/src/approval-request.service.ts`) for the harder case of per-row eligibility pushed into SQL via TypeORM `Brackets`/correlated subqueries; `DiscountRegistryEntry`/`DiscountRegistryService` (`packages/plugins/price-entry`) for the read-model/projection case above; `AdminOrderPaymentViewResolver`/`OrderVisibilityService.buildVisibleOrdersQuery` (`packages/plugins/acquiring`/`packages/plugins/erp-order`) for the cross-plugin correlated-subquery case immediately below.

**Real incident — don't repeat this**: `CustomerOrdersTab.vue`'s Unpaid/Partially paid/Cancelled view chips were first (briefly) implemented by fetching the _entire_ customer order list to the frontend (capped at `take: 500`) and filtering/paginating in JS, reasoning "there's no server-side aggregate for this yet." That is exactly the antipattern this section forbids — caught and reverted before merging, not a hypothetical. The actual fix: `state` (Cancelled) was already a plain, real-column filter needing zero backend work; the payment-status buckets needed a correlated SQL subquery against `plugin-acquiring`'s `PaymentAttempt` table, executed with real `skip`/`take` — never a full in-memory fetch. The subquery couldn't live in `plugin-erp-order` (which owns `visibleOrders`) because `plugin-erp-order` can't depend on `plugin-acquiring`: `plugin-acquiring` already depends on `plugin-erp-order` transitively via `plugin-sync`, so the reverse edge is a circular package dependency (confirmed via a real `tsc -b` "Project references may not form a circular graph" error when tried). Resolved by extracting `OrderVisibilityService.buildVisibleOrdersQuery` (the scoped, not-yet-executed query builder) as a public method `plugin-acquiring` can call — `plugin-acquiring` depending on `plugin-erp-order` directly has no cycle — then `plugin-acquiring`'s own `AdminOrderPaymentViewResolver` extends that query with its `PaymentAttempt` subquery and executes it there, in the plugin that actually owns the payment data. **Before reaching for a bespoke resolver+string-enum argument like this, first check whether the property can instead be exposed via Vendure's own `ListQueryBuilder` `customPropertyMap`** (already documented above) so it composes with the existing `filter`/`sort`/`_and`/`_or` on the _same_ query — this incident's shape (the joined data living in a plugin that can't be a dependency of the query's owner) didn't fit that cleanly, but check first before assuming it won't.

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

- **A raw-SQL condition referencing the `order` TypeORM alias inside a `Brackets` callback must quote the alias explicitly (`"order".column`, not `order.column`)** — `order` is a reserved SQL keyword. Outside `Brackets` (a plain `.where()`/`.andWhere()` string passed directly to the query builder), TypeORM's own `alias.property` auto-replacement recognizes and quotes it correctly; that replacement pass does **not** run inside a `Brackets` callback, so an unquoted `order.foo` there produces `syntax error at or near "order"` at query time — the query builds and compiles fine, and the bug is invisible until that exact code path actually executes (a latent bug can sit unexercised for a long time if the default/common case never hits it — real incident: `ErpOrderResolver.myOrders`'s erpStatus-filter and search branches, both inside `Brackets`, both had this; the default "all orders, no filter" view never triggered either branch, so it shipped and stayed broken until a filtered query was actually tested).

- **A plugin entity whose class name collides with a `@vendure/core` built-in entity name crashes bootstrap** with `error.entity-name-conflict` (e.g. `Refund` — Vendure core already registers its own `Refund`, tied 1:1 to a Vendure `Payment`) — regardless of which plugin/module the name comes from. Check for a collision before naming a new entity after a common domain noun; prefix with the plugin's own concept instead (e.g. `PaymentRefund` in `plugin-acquiring`).

- **A custom Query field for an existing entity's paginated list must use that entity's real, Vendure-generated `<EntityName>List!`/`<EntityName>ListOptions` — inventing a bespoke options/return type for it is not a legitimate escape hatch, it's fighting the framework.** `@vendure/core`'s schema post-processor (`generateListOptions`) auto-detects any Query field whose return type is an object type named `<EntityName>List` implementing `PaginatedList`, and _appends_ a second `options: <EntityName>ListOptions` arg — even if the field already declares its own differently-typed `options` arg. This isn't a bug to dodge: it's the actual mechanism implementing Vendure's documented paginated-list convention (docs.vendure.io/guides/how-to/paginated-list/) — the appended arg silently wins at runtime regardless of what you named your own, so a bespoke type just produces a broken field (GraphQL validation fails on every real client call — "used in position expecting type X" — while the SDL source looks completely correct) with no compile-time warning. Real incident: `myOrders(options: MyOrdersListOptions): OrderList!` in `plugin-erp-order` silently became `options: OrderListOptions` at runtime, breaking the storefront `/orders` page entirely. **The correct fix is to use the real `<EntityName>List!`/`<EntityName>ListOptions` as the field's actual type** — check first whether the custom filter you need already exists for free (`<EntityName>FilterParameter` auto-includes the entity's own customFields, flat — see the customFields-are-flat gotcha above); for a filter that isn't a plain column (e.g. free text spanning a joined table), add it as a separate sibling scalar arg alongside `options`, not folded into a custom `options` shape. Only reach for `ListQueryBuilder`'s `customPropertyMap` (maps a filter/sort key to an arbitrary joined-relation SQL expression) if the extra filter genuinely needs to compose with Vendure's own `filter`/`sort`/`_and`/`_or` machinery. Renaming the return type away from `<EntityName>List` to dodge the auto-injection (e.g. a hand-rolled `MyOrderList` wrapper) only makes sense if there's a real reason this query shouldn't participate in Vendure's list-query conventions at all — absent that, it's scope creep away from the framework's own tooling for no architectural benefit.

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
