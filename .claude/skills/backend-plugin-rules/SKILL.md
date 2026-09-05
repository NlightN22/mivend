---
name: backend-plugin-rules
description: Mandatory rules for writing or changing any Vendure plugin under packages/plugins/ — plugin layout, inter-plugin communication, business-data-in-DB rule, server-side pagination, REST/Swagger DTOs, and the accumulated Vendure-specific gotchas. Read before creating a new plugin, adding a resolver/service, or touching a list/pagination query.
---

# Backend plugin rules

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

## Testing

Run the `test-design` skill before writing or changing any test here, per AGENTS.md's Testing
requirements. Tests run against the local contour's seeded data only — see
`docs/environments.md`'s "Testing must stay within the local contour". If a scenario needs seed
data that doesn't exist yet, extend `erp-import`'s seed data (see "Dev seed rules" above) or the
test's own fixtures.
