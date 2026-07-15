# Access control architecture

Principles, patterns, and testing requirements for authorization in mivend: Vendure RBAC,
row-level data ownership, field-level redaction, and the approval-workflow gate used by the
manager portal (`packages/manager/`) and any Admin API surface.

This document is the source of truth for **how access checks are implemented in code**.
`docs/ai/manager-portal-concept.md` (local, gitignored) is the source of truth for **which
roles/personas exist and what they can see** — this file does not duplicate that matrix, only
the architecture that implements it.

---

## The five layers

Every access check belongs to exactly one of these layers. Do not blend layers — each has one
job and one place in the codebase.

| #   | Layer                 | Question it answers                                                                        | Where it lives                                                          |
| --- | --------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| 1   | Auth/session          | Who is making this request?                                                                | Vendure `AuthGuard` (built-in, no custom code)                          |
| 2   | RBAC (`Permission`)   | Can this role perform this action at all?                                                  | `@Allow()` on resolvers                                                 |
| 3   | Scope                 | Which records can this role see, out of the ones layer 2 allowed?                          | `AccessScopeService` + service-layer query filtering                    |
| 4   | Field-level redaction | Which fields of an allowed record can this role see?                                       | `requiresPermission` on customFields, or a dedicated protected resolver |
| 5   | Approval gate         | Is this specific mutation allowed to apply directly, or must it go through approval first? | A dedicated gate service per business rule (e.g. `PriceAdjustmentGate`) |

A resolver only ever touches layer 2. A service only ever touches layer 3. Nothing outside the
gate service touches layer 5. If you find yourself writing role-name `if`/`switch` logic inside
a resolver or inside a domain service unrelated to `AccessScopeService`, that logic is in the
wrong layer — move it.

---

## Layer 2: `Permission` — action only, never scope

**Rule: a `Permission` name encodes _what_ a role can do, never _which records_.**

Wrong — scope encoded in the permission name, causes combinatorial explosion as new scope
dimensions appear (region, branch, product line, ...):

```typescript
ReadOwnCounterparties;
ReadDepartmentCounterparties;
ReadAllCounterparties;
ReadOwnOrders;
ReadDepartmentOrders;
```

Right — one permission per action, scope resolved separately (layer 3):

```typescript
export const CustomPermission = {
  ReadCounterparty: new PermissionDefinition({
    name: 'ReadCounterparty',
    description: 'Read counterparty records (scope resolved separately, see AccessScopeService)',
  }),
  ReadOrder: new PermissionDefinition({ ... }),
  AdjustPriceWithinLimit: new PermissionDefinition({ ... }),
  RequestPriceAdjustmentApproval: new PermissionDefinition({ ... }),
  ApproveDiscountRequest: new PermissionDefinition({ ... }),
  ManageApprovalWorkflows: new PermissionDefinition({ ... }),
} as const;
```

Register once, in the plugin that owns the resource:

```typescript
// vendure-config.ts
authOptions: {
  customPermissions: Object.values(CustomPermission),
}
```

Resolvers use `@Allow()` for the coarse check only:

```typescript
@Query()
@Allow(CustomPermission.ReadCounterparty.Permission)
counterparties(@Ctx() ctx: RequestContext, @Args() args: ListArgs) {
  return this.counterpartyService.findVisible(ctx, args);
}
```

The resolver does not know or care whether the caller sees `own`/`department`/`all` — that is
resolved entirely inside the service via layer 3.

---

## Layer 3: `AccessScopeService` — one service, reused everywhere

**Rule: row-level visibility filtering is a single, reusable service — never copy-pasted
`if`/`switch` role checks scattered across resolvers or domain services.**

Vendure has no built-in mechanism for row-level ownership beyond binary `Permission` checks —
this must be implemented at the service layer, mirroring the existing `myOrders`/`myDocuments`
pattern (`ctx.activeUserId`-scoped), just generalized to the `Administrator` side.

```typescript
type AccessScopeKind = 'own' | 'department' | 'all';

interface AccessScope {
    kind: AccessScopeKind;
    administratorId?: ID;
    departmentId?: ID;
    branchId?: ID;
}

@Injectable()
export class AccessScopeService {
    async resolveCounterpartyScope(ctx: RequestContext): Promise<AccessScope> {
        const admin = await this.getAdministrator(ctx);
        const maxScope = this.roleScopeConfig.maxScopeFor(admin, 'counterparty');
        switch (maxScope) {
            case 'all':
                return { kind: 'all' };
            case 'department':
                return {
                    kind: 'department',
                    departmentId: admin.customFields.departmentId,
                    branchId: admin.customFields.branchId,
                };
            default:
                return { kind: 'own', administratorId: admin.id };
        }
    }
}
```

`maxScopeFor(admin, resource)` is a small role → max-scope mapping (config, not permission
names) — this is what replaces the old `ReadOwnX`/`ReadDepartmentX`/`ReadAllX` permission
triplets. It can live as a plain lookup table keyed by `Role.code`, or as a custom field on
`Role`; either way, it is data, not new `Permission`s.

Every domain service that needs ownership filtering calls the shared service and translates the
result into a query filter — the translation is the only resource-specific part:

```typescript
async findVisible(ctx: RequestContext, args: ListArgs) {
  const scope = await this.accessScopeService.resolveCounterpartyScope(ctx);
  const qb = this.connection.getRepository(ctx, Counterparty).createQueryBuilder('c');
  switch (scope.kind) {
    case 'own':
      qb.where('c.assignedManagerId = :id', { id: scope.administratorId });
      break;
    case 'department':
      qb.where('c.departmentId = :d AND c.branchId = :b', {
        d: scope.departmentId,
        b: scope.branchId,
      });
      break;
    case 'all':
      break;
  }
  return qb.getMany();
}
```

Resources whose visibility is derived from another resource (e.g. `/documents` inherits
counterparty visibility) call `resolveCounterpartyScope` directly — they do not get their own
`resolve<Resource>Scope` method duplicating the same logic.

### Branch scope is a separate axis from own/department/all, and lives on different entities per resource

`branchId` is a hard, additive filter — orthogonal to the `own`/`department`/`all` scope above,
not a fourth value in that enum. When an administrator's `customFields.branchId` is set, it is
always applied as `AND branchId = :branchId` before the own/department/all logic narrows further
within that branch. Central-only roles (`general-director`, `portal-admin`) have `branchId = null`
— no branch filter is applied, they see every branch.

**Where `branchId` actually lives is not the same field for every resource — this was a real
design decision, not an oversight:**

- **`Counterparty.branchId`** is the customer's _home/reporting_ branch — display and default
  assignment only, **never used as an access-scope filter**. A chain/network customer (e.g. a
  multi-location fuel station chain) can have trading points served by several different
  branches; filtering the parent `Counterparty` record itself by branch would incorrectly hide it
  from — or wrongly show all of it to — a branch that only services part of it.
- **`TradingPoint.servicingBranchId`** is the real access-scope filter for a customer's locations
  and everything derived from them (`Order`, `Reservation` inherit `branchId` from the
  `TradingPoint` selected at creation time, denormalized onto the row for filtering without a
  join — same pattern as `Reservation.stockLocationId`). Defaults to the parent `Counterparty`'s
  `branchId` at `TradingPoint` creation time (covers the ~90–95% single-branch case with zero
  manual work); explicitly overridable per point for chain accounts.

This is the standard **Key Account Management vs. Territory Management** split used in mature B2B
CRM/ERP systems (Salesforce territory model, SAP Account/Territory): one axis owns the commercial
relationship and commission ("зачёт" always goes to `Counterparty.assignedManagerId`, regardless
of which branch's trading point closed the sale), a separate axis owns local operational
execution (visits, logistics, fulfillment) per location. Do not collapse these into one field —
that collapse is exactly the failure mode this split prevents.

**Key account manager read exception:** `Counterparty.assignedManagerId` must always grant that
manager read access to their account's trading points/orders/reservations **regardless of
`branchId` scope** — this is a read exception layered on top of the normal branch filter, not a
widening of that manager's own `branchId`. Implement it as an explicit `OR assignedManagerId =
:id` alongside the branch filter in `findVisible`-style queries, never by setting the manager's
own `branchId` to `null`/`all` — that would over-grant visibility into unrelated customers in
every other branch too.

Commission/credit-limit ownership always follows `Counterparty.assignedManagerId`. Do not attempt
to split commission by trading point when a chain account's locations span branches — this was a
deliberate business decision, not a modeling gap.

`TradingPoint.servicingManagerId` (per-point operational assignment, distinct from
`servicingBranchId`) is explicitly **not modeled yet** — today's scope is branch-level
distribution control only, not per-outlet. Add it only if per-point visit/audit assignment
becomes a real requirement, not preemptively.

---

## Layer 4: field-level redaction

**Rule: a field that must never reach a role (e.g. the "floor price" price type) is protected
declaratively at the schema level, not filtered manually after the fact.**

Preferred mechanism — `requiresPermission` on the `CustomFieldConfig`:

```typescript
customFields: {
  PriceType: [
    {
      name: 'floorPrice',
      type: 'float',
      requiresPermission: [CustomPermission.ReadFloorPrice.Permission],
    },
  ],
}
```

For a role without `ReadFloorPrice`, the field is absent from the GraphQL schema itself (not
just `null` in the response) — this is stronger than manually omitting the field in a resolver,
because it cannot be accidentally reintroduced by some other resolver reusing the same GraphQL
type.

**When `requiresPermission` does not apply** (a resolver-computed field, not a real
`customField`): fall back to a dedicated, narrowly-scoped resolver gated by `@Allow()`, and never
include that value in any broader/list-query response type. Do not resolve the value into a DTO
that is also used by roles without the permission, even if you intend to strip it later — the
value must never leave the service layer for those roles.

**Verification is mandatory, not optional** — see Testing, "Field-level redaction test" below.
`requiresPermission` behavior must be confirmed against the Vendure version actually in use, not
assumed from documentation.

---

## Layer 5: approval gate

**Rule: "is this action allowed to apply directly, or does it need approval" is decided by a
dedicated gate service, called from the mutation, before the underlying change is applied. The
gate is the only code that sees the protected threshold value (e.g. `floorPrice`) — the client
never receives it, only the gate's decision.**

```typescript
@Mutation()
@Allow(CustomPermission.AdjustPriceWithinLimit.Permission,
       CustomPermission.RequestPriceAdjustmentApproval.Permission)
async adjustOrderLinePrice(@Ctx() ctx: RequestContext, @Args() args: AdjustPriceInput) {
  const decision = await this.priceAdjustmentGate.evaluate(ctx, args);
  if (decision === 'apply-directly') {
    return this.orderPricingService.applyAdjustment(ctx, args);
  }
  return this.approvalWorkflowService.createRequest(ctx, 'priceAdjustmentApproval', args);
}
```

### Approval-workflow engine implementation rules

The engine (`packages/plugins/approval-workflow`, XState + TypeORM per
`docs/ai/manager-portal-concept.md` §4.2) must follow these rules:

1. **Rehydrate per request, never keep a long-lived actor.** Each decision transitions a fresh
   actor created from the persisted snapshot, then discards it:

    ```typescript
    async decide(ctx: RequestContext, requestId: ID, decision: 'approved' | 'rejected', comment: string) {
      return this.connection.transaction(ctx, async (ctx) => {
        const repo = this.connection.getRepository(ctx, ApprovalRequest);
        const request = await repo.findOneOrFail({ where: { id: requestId } });
        const actor = createActor(approvalMachine(request.workflowDefinition), {
          snapshot: request.xstateSnapshot,
        });
        actor.start();
        actor.send({ type: decision === 'approved' ? 'APPROVE' : 'REJECT', stepIndex: request.currentStepIndex });
        request.xstateSnapshot = actor.getPersistedSnapshot();
        request.status = actor.getSnapshot().value;
        actor.stop();
        return repo.save(request);
      });
    }
    ```

    The TypeORM row is the single source of truth. The XState actor is a stateless transition
    function invoked once per decision, never a background/long-lived process.

2. **Optimistic locking on every transition.** `ApprovalRequest` has a `@VersionColumn()` (or an
   explicit `WHERE currentStepIndex = :expected` guard on the update). Two concurrent decisions
   on the same step (e.g. an approver and a manual escalation racing) must not both apply — the
   losing write fails with a conflict, not a silent double-transition.

3. **No automatic timers/cron.** MVP escalation is manual-only, initiated by the request's
   creator, from a fixed `escalatesTo` list in the `WorkflowDefinition` — no background scheduler
   watches for stale steps.

---

## Testing requirements

Access-control code has its own mandatory test categories, in addition to whatever
AGENTS.md already requires for the plugin overall. **A permission, scope rule, or approval gate
is not done until all of the following exist:**

### 1. Scope resolution unit tests (`AccessScopeService`)

- One test per `AccessScopeKind` (`own`, `department`, `all`) confirming the correct scope is
  returned for a role with that maximum scope.
- A negative test: a role with no matching permission gets the most restrictive scope (`own`),
  never falls through to `all` on an unrecognized role.

### 2. Row-level filtering integration tests (per resource, e.g. `CounterpartyService.findVisible`)

- Positive: an `own`-scoped administrator sees only their assigned records.
- Negative: the same administrator does **not** see another administrator's records — assert the
  excluded record's id is absent from the result, not just that the count is smaller.
- One test per scope kind (`own`/`department`/`all`) against a real Postgres instance (per
  AGENTS.md integration-test rules — no DB mocking).

### 3. Field-level redaction test (mandatory for every `requiresPermission` field)

- Query the field as a role **without** the required permission → assert the field is absent
  from the response **and** from schema introspection for that session, not merely `null`.
- Query the field as a role **with** the permission → assert the value is present and correct.
- This test must exist for `floorPrice` specifically before it ships, and for any future field
  protected the same way — do not assume `requiresPermission` behaves as documented without this
  test passing against the project's actual Vendure version.

### 4. Approval gate tests

- Threshold boundary: request exactly at the limit applies directly; one unit below requires
  approval (or vice versa, per the exact business rule) — off-by-one is the most likely bug here.
- The gate's evaluation must never leak the protected threshold value to the caller — assert the
  mutation response/GraphQL error contains no raw `floorPrice` (or equivalent) under any code
  path, including error messages.

### 5. Approval engine concurrency test

- Two concurrent `decide()` calls on the same `ApprovalRequest`/step (e.g. simulated via
  parallel transactions) — assert exactly one succeeds and the other receives a conflict, never
  both applying or the step advancing twice.
- Rehydrate correctness: persist a snapshot, create a fresh actor from it in a new process/call,
  confirm the resumed state matches what was persisted (guards against silent XState
  snapshot-format drift across versions).

### 6. Where these tests live

- Scope/gate unit tests: `src/__tests__/unit/` in the owning plugin (`access-control` or the
  resource's own plugin, whichever owns `AccessScopeService`/the gate).
- Row-level/field-redaction/concurrency tests: `src/__tests__/integration/` — these require a
  real Postgres instance and, for field redaction, a real GraphQL schema build, per AGENTS.md's
  "no DB mocking" rule for integration tests.
- Run via `make test` / `make test-int` per AGENTS.md — never `pnpm test` directly.

---

## What not to do

- Do not encode scope in a `Permission` name (`ReadOwnX`/`ReadDepartmentX`/`ReadAllX`) — see
  layer 2.
- Do not filter row-level visibility inline in a resolver — it belongs in the service layer via
  `AccessScopeService`.
- Do not duplicate `resolve<Resource>Scope` logic for a resource that inherits visibility from
  another (e.g. documents inheriting counterparty scope) — reuse the owning resource's scope
  resolution.
- Do not rely on a protected field being merely omitted by convention in one resolver — either
  use `requiresPermission` or ensure the value never enters a DTO/type shared with unauthorized
  roles.
- Do not keep a long-lived XState actor across requests for approval workflows — rehydrate from
  the persisted snapshot every time.
- Do not ship a `requiresPermission`-protected field or a new approval gate without the tests in
  "Testing requirements" above — these are as mandatory as the AGENTS.md plugin "definition of
  done".
