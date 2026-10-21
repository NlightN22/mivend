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
| 5   | Approval gate         | Is this specific mutation allowed to apply directly, or must it go through approval first? | A `manager` check per business rule (e.g. `manager.price-adjustment-floor`), consequence from its policy |

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

### Read vs. write permissions on operational tooling

Health views are read-only (`ManageErpIntegration`); any action that changes integration state is a
separate permission so viewing a page never implies being able to act on it. `RecoverIntegrationEvents`
gates requeueing failed and rebuilding skipped outbound events (issue #200); it is granted explicitly
to a role, nothing inherits it from `ManageErpIntegration`.

### Check results and policies (#237)

`ReadCheckResults` is granted to every role that sees orders in the manager portal (operator, manager,
department-head, general-director, security-officer, portal-admin): the findings concern the orders they
already read, and `checkResults` still passes through the order visibility scope (a foreign order returns
nothing). `ManageCheckPolicies` (consequence policies) stays with general-director and portal-admin. It is a global (central admin) right on purpose: it edits the global default and every branch's override (`updateCheckPolicy`/`resetCheckPolicyOverride` take any existing `branchId`, an unknown one is rejected); there is no per-branch policy editor role. The same permission edits the `manager` subject's policies (reservation extension, credit-term, price floor, #242): no stronger or dedicated permission, because the audience already can soften order controls; a branch override saved without a recipient inherits the global recipient.
`recomputeOrderChecks` writes results and takes the order lock, so it needs `ReadCheckResults` AND
`ConfirmOrder` (the permission of the other staff order actions: confirm, release, set contract, edit lines before confirmation, #233);
`@Allow` is any-of, so the second one is checked in the resolver. `setDraftOrderTradingPoint` (#245) needs core `CreateOrder`, resolves the order through `OrderVisibilityService` (a foreign order is `Order not found`) and accepts only active, visible points of the order's own counterparty; `setOrderDelivery` (placed orders) needs `ConfirmOrder` with the same scope and point rule. The Admin API `cancelOrder` override (#231) keeps core's `UpdateOrder`; its order scope comes from the core order scope guard below. `ConfirmOrder` is broader than a
recompute strictly needs; accepted for now (owner decision). If a role must recompute without being able to
confirm, introduce a dedicated permission instead of widening this one.

### Core Admin API order operations (#248)

Core checks only channel and permission on its order operations, so one guard applies mivend's
order scope (`OrderVisibilityService`) to all of them; an order outside the caller's scope is
`EntityNotFound`, on read and on write. SuperAdmin is not scoped. The registry is
`packages/plugins/erp-order/src/core-order-scope/core-order-operations.ts`; a unit test walks
core's Admin API schema from `Query`/`Mutation` and fails when order data is reachable without
crossing a registered field.

| Class | Operations | Checked target |
| --- | --- | --- |
| Read | `order`, `eligibleShippingMethodsForDraftOrder` | order id |
| Scoped resolvers (overridden) | `orders`, `Customer.orders`, `OrderLine.order`, `Allocation.orderLine`, `Cancellation.orderLine` | the visible-orders query |
| Order writes | `transitionOrderToState`, `cancelOrder`, `modifyOrder` (+ its refund payments), `addNoteToOrder`, `setOrderCustomFields`, `addManualPaymentToOrder` | order id |
| Customer change | `setOrderCustomer`, `setCustomerForDraftOrder` | order id and the new customer's counterparty (`CounterpartyService.findOneVisible`; a customer without one only for counterparty scope `all`) |
| Draft writes | `deleteDraftOrder`, `addItemToDraftOrder`, `adjustDraftOrderLine`, `removeDraftOrderLine`, `setDraftOrder*`, `unsetDraftOrder*Address`, `applyCouponCodeToDraftOrder`, `removeCouponCodeFromDraftOrder` | order id (+ line id) |
| Payments, refunds | `settlePayment`, `cancelPayment`, `transitionPaymentToState`, `refundOrder`, `settleRefund` | payment / refund id |
| Fulfillments | `addFulfillmentToOrder`, `transitionFulfillmentToState` | order line / fulfillment id (every order it spans) |
| Notes | `updateOrderNote`, `deleteOrderNote` | history entry id |
| Exempt | `createDraftOrder` (new order); `updateCustomerNote` (customer note) | — |

Root operations go through `CoreOrderScopeInterceptor` (one `APP_INTERCEPTOR`, Admin API only,
decision in `CoreOrderScopeService`). A target whose row exists but has no order (a refund whose
payment is gone) is refused; an id that does not exist is left to core. A draft still in `Draft`
with no customer belongs to no scope: only `order` and `setCustomerForDraftOrder` (with an in-scope
customer) reach it, so any staff member can read such an empty draft (accepted: it holds no
customer data). A new-customer input whose email matches an existing customer is checked as
that customer, since core attaches the existing one. The schema test covers core fields only;
order fields added by mivend plugins are scoped by their own services (`OrderVisibilityService`). Core 3.7.3 never loads `Allocation.orderLine`/`Cancellation.orderLine` (the
field errors for everyone); keep them scoped, never exempt them. Dashboard access for roles below
portal-admin is unchanged: the Dashboard shows them only their scope.

## Layer 3: `AccessScopeService` — one service, reused everywhere

**Team pickers and manager reassignment (#231).** Since Vendure 3.7.3, `AdministratorService.findAll`/`findOne`
hide every administrator holding a role the caller could not grant. `teamMembers` therefore lists
colleagues through `TeamAdministratorService` for every `'department'`- and `'own'`-scoped caller
(department-head, operator, manager): live administrators of the caller's own `branchId`, a branchless
caller sees none; `'all'` lists every live administrator directly (Vendure's list would drop the same ones). Reassignment targets are checked against the
branch for `'department'` only; other scopes are unchanged. This grants no administrator-management
permission. `teamDirectory` (`/team`) lists the same `findTeam` set, then applies its own
name anonymization. Approval escalation resolves its target by id directly (live administrators only),
not through `AdministratorService`, so the requester's grantable roles never hide a valid approver; the
step's `escalatesTo` role check still applies.

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
      // `departmentId` never gates visibility of anything, here or anywhere else — see "Branch
      // scope is the only real filtering axis" below. `branchId` is the only real filter axis,
      // but *which column* it applies to is resource-specific (see that section) — for
      // Counterparty this is `c.branchId = :scopeBranch` with no `IS NULL` carve-out
      // (deny-by-default for unassigned rows); this generic example intentionally does not
      // prescribe the exact column/carve-out choice for every resource.
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

### `Branch` is mivend's own entity; `Department` is a pure ERP mirror — never conflate the two

These are two different entities, owned by two different systems, and must never be treated as
interchangeable id spaces:

- **`Department`** (`packages/plugins/access-control/src/entities/department.entity.ts`) is
  entirely the ERP's own org-structure data — the ERP's "Подразделение". It is only ever upserted from
  Integration Service's `department` Kafka stream (`DepartmentService.upsert`); there is no
  manual-creation path. Treat it as read-only, informational org-structure data mirrored for
  display and for `Administrator.customFields.departmentId`/`Counterparty.departmentId` (both
  hold the ERP's `Department.erpId` directly, unresolved — that's correct here, since the whole point
  is to show "which ERP division" something belongs to). **`departmentId` must never gate
  visibility of anything, anywhere, full stop** (2026-09-20 product decision, corrects an earlier
  version of this doc/several services that did filter by it — see "Branch scope" below). The
  `AccessScopeKind` enum still has a `'department'` value for historical reasons — its cases in
  `AccessScopeService`/`CounterpartyService`/`OrderVisibilityService`/`ProformaInvoiceVisibilityService`
  no longer compare `departmentId` at all; renaming the enum value itself (e.g. to `'branch'`) stays open.
  **Confirmed against the real Kafka contracts** (`@nlightn22/event-contracts`,
  `counterparty_changed.proto`/`user_changed.proto`): ERP only ever sends `department_id` for
  both `Counterparty` and `Administrator`(`user`) — there is no `branch_id` field in either
  contract. The one place a `branch_id` field does exist on the wire (`warehouse_changed.proto`)
  is explicitly documented in that .proto's own comment as "ERP division/branch key
  (Подразделение_Key)" — i.e. the exact same ERP division-id space as `Department`, just reused
  for warehouses; ERP itself has no separate "branch" concept distinct from department at all.
  `branchId` as mivend understands it below is **entirely mivend's own invention**, never sourced
  from the ERP directly except as an optional convenience match against that same reused GUID (see
  `Branch` below) — flagged to the Integration Service team to reconsider that field's naming,
  search-platform#140.
- **`Branch`** (`.../entities/branch.entity.ts`) is mivend's own entity for warehouse/ATP
  consolidation and branch-scoped access control — it is **not** a 1:1 mirror of anything in the ERP.
  A `Branch` row can be created two ways: resolved from an ERP-side branch/point code
  (`BranchService.upsert`, matched by `Branch.erpId`, itself the same GUID space as the ERP's
  `Department`/division concept — see `department.handler.ts`'s own comment for why that
  overlap is deliberate, not a bug) **or** created manually with no ERP link at all
  (`BranchService.createManual`, staff-managed, independent of ERP entirely — issue #80). Either
  way, **every real consumer of a `branchId` field must hold the mivend `Branch.id` (the
  Vendure-generated primary key), never a raw ERP id** — `Warehouse.branchId`
  (`WarehouseService.upsert`), `BranchSettings.branchId`, and the `AccessScopeService`/
  `RoleScopeConfigService` scope-config UI all use and compare `Branch.id` values.
  `Administrator.customFields.branchId` and `Counterparty.branchId` are written only by
  `BranchAssignmentService` (see "Automatic branch assignment (#65)" below), never from a raw ERP id.
  An order's/proforma invoice's branch is resolved at read time (`TradingPointService.resolveServicingBranchId`):
  the point's `servicingBranchId`, else the counterparty's `branchId`, else the global default branch (#198).
- **Unrelated naming collision, don't confuse the two**: `docs/architecture.md` also uses the
  word "Branch" for a completely different concept — a **deployed server instance**
  (`INSTANCE_TYPE=branch`, the "Central Hub / Branch Instance" topology). That has nothing to do
  with the `Branch` _entity_ described here; it's the same English word for two unrelated ideas
  in two different parts of this codebase's own vocabulary.

### Automatic branch assignment (#65)

Staff map ERP departments to mivend branches in one table (`department_branch_mapping`: unique
`departmentErpId`, `branchId` FK to `Branch`), edited in the manager portal under Settings >
"Departments to branch" (permission `ManageAccessControl`, central only). No heuristics: a mapping
applies to its department and is inherited by every descendant, the nearest mapped ancestor-or-self
wins. Cross-branch containers (tree roots, the office subtree) stay unmapped, so deny by default.

- **Administrator**: `branchId` is resolved from `customFields.departmentId`; an unmapped department
  gives `null` (branch-scoped roles see nothing). `createAdministratorFromErpUser` refuses to create
  a login while the user's department is unmapped.
- **Counterparty**, first match wins: manual override (`Counterparty.branchOverrideId`, set by
  `setCounterpartyBranchOverride`, never overwritten, clearing it re-runs the rule), the primary
  manager's department through the mapping, the counterparty's own stream `departmentId` through the
  mapping, otherwise `null`. There is no default-branch fallback for visibility.
- **One writer**: `BranchAssignmentService` (access-control) writes both fields, only that key, on the
  central instance only (a replica receives the result). `EmployeeService.upsert` calls it too.
- **Triggers**: user event and administrator link, counterparty event, manager reassignment, mapping
  set/clear (reconcile of the affected subtree in the same transaction), a department created or
  reparented, and the scheduled backstop `access-control-branch-assignment` (every 15 minutes).
- **Concurrency**: every reconcile takes the advisory lock `branch-assignment` inside its transaction and
  re-reads the department tree and mapping under it, so a user event racing a mapping edit ends on the
  final mapping (`docs/concurrency.md`). A writer may hold a row (its own write) while it waits for the
  lock, so reconcile selects rows `FOR UPDATE SKIP LOCKED`: it first lists the candidate ids, locks them,
  and reports the ids it could not lock. Those exact rows are re-run after the holder commits
  (`BranchAssignmentRetryEvent`, short delay, at most 5 attempts, then an error log; the backstop is the last
  resort). That removes the lock-order cycle without a global row-lock order and without a stale row.
  A mapping edit reconciles its whole subtree inside the outer transaction, so the advisory lock is held
  until that commit; per-batch locking applies to `reconcileAll` (the backstop) only.
- **Cheap paths**: counterparty and user events reconcile only when a branch input changed (department,
  manager, override; a new row always does) or the stored branch differs from the resolved one; the input
  snapshot is a JSON array, so no value can collide with a delimiter. A full reconcile (backstop) runs in
  ascending-id batches of 500, one lock per batch, so events never queue behind a whole scan. Stream writes
  touch only their own columns (`repo.update`), never `branchId`/`branchOverrideId`, so a stale full-entity
  save cannot revert a reconcile.
- **Override write path**: `setCounterpartyBranchOverride` lives in the counterparty plugin
  (`CounterpartyBranchOverrideService`): it checks the row with `assertCounterpartyWritableInScope` (so a
  branch-scoped caller cannot touch a foreign row), writes through `DepartmentBranchMappingService`
  (the replaced value is read under the row lock by the same statement), and records a Counterparty version
  entry (`branchOverrideId`) like a manager reassignment. A `ManageAccessControl` holder resolves to the
  scope configured for their role (default roles: `all`), not a guaranteed `all`; a holder with
  `department`/`own` scope can also move their own counterparty out of their branch, because the check looks
  at the current row only.
- **Branch deletion**: the mapping FK is `ON DELETE RESTRICT`, so a branch referenced by a mapping cannot be
  deleted. `branchOverrideId` has no FK (varchar); no code path deletes a branch.
- `TradingPoint.servicingBranchId` still defaults from the counterparty's branch at creation only.
- Dev seed: erp-import record type `departmentBranch` (synthetic mapping rows); real contours are
  never seeded.

### Visibility grants (#123)

Effective visibility is an additive union, deny by default: own clients, plus the clients of the managers
granted to the caller, plus (branch-scoped roles) the primary branch, plus everything for `all`. A grant never
removes base access. `AccessScope.grantedManagerIds` carries the granted managers (Administrator ids as
strings); `AccessScopeService.managerClause` / `applyOwnCounterpartyFilter` turn the set into SQL, and every
consumer (`CounterpartyService` lists, KPIs, totals and `findOneVisible`, `assertCounterpartyWritable`,
`OrderVisibilityService`, `ProformaInvoiceVisibilityService` and payments through it, the reservation and
payment reconciliation lists) uses them, so counters and pagination totals cover the same rows as the list.
For a `department` scope the caller's own clients are part of the union too.

- **Entity** `VisibilityGrant` (access-control, `UuidEntity`): grantee Administrator id, subject as
  `subjectKind` + `subjectRef` (only `manager`, a closed technical discriminator; later kinds such as a branch
  plug in by extending `VisibilityGrantReader`), optional `validFrom`/`validTo` (null = open; `validTo` is
  exclusive), `reason`, `grantedByAdministratorId`, `revokedAt`/`revokedByAdministratorId`. Rows are never
  deleted: revoke sets `revokedAt`, an expired grant just stops matching. Status is derived: active,
  scheduled, expired, revoked.
- **Permission** `ManageVisibilityGrants` (default roles: department-head, general-director, portal-admin).
  `ManageAccessControl` holders may grant any manager to anyone. A holder of only the new permission can
  grant only when both the grantee and the manager are in the caller's visible team (`TeamAdministratorService`,
  the own branch) or, for the manager, among the caller's own granted managers, and never to themselves. A
  grant to oneself is refused, so a caller cannot widen their own scope. The same rule limits revoking (the
  granter may always revoke their own grant) and which grants the list shows.
- **Writer** `VisibilityGrantService` (counterparty plugin, next to the other audited writers; central only):
  an advisory lock `visibility-grant:<grantee>` serializes grants of one grantee, so an overlapping period of the
  same manager is refused race-free; revoke locks the row (`FOR UPDATE`), a second revoke is a no-op. Every grant
  and revoke is one `EntityVersion` entry (`VisibilityGrant`, actor, reason as the comment).
- **API** (admin, `ManageVisibilityGrants` or `ManageAccessControl`): `visibilityGrants` (paginated, status and
  name search), `grantManagerVisibility`, `revokeVisibilityGrant`, `unsortedCounterparties`,
  `unsortedAdministrators`. Manager portal: Settings > "Visibility grants" and "Unsorted".
- **Unsorted list**: counterparties with no `branchId` and live administrators with no `branchId` whose roles do
  not already see everything. Ordinary branch-scoped roles do not see it. Assigning a branch override still goes
  through `setCounterpartyBranchOverride` (audited, `ManageAccessControl`).
- Not replicated: grants live on the central instance; branch instances do not read them yet (tracked in #267).

### Branch scope is the only real filtering axis — `departmentId` never gates anything

**`departmentId` (the ERP's own "Подразделение") is pure display/informational data — it must never
gate visibility of anything, in any resource, full stop.** `branchId` (mivend's own `Branch`
entity) is the sole real access-scope filter. The `AccessScopeKind` enum still has a
`'department'` value and `AccessScope.departmentId` still exists as a field for now (legacy
naming — renaming to something like `'branch'` is an open question for issue #123, not done
yet), but every consumer's `'department'` case must compare `branchId` only, never
`departmentId`. This corrects an earlier version of this section/several services
(`CounterpartyService.findVisible`, `AccessScopeService.assertCounterpartyWritable`,
`OrderVisibilityService`, `ProformaInvoiceVisibilityService`) that did filter by `departmentId` — see
"Branch vs Department" above for why, and for the confirmed proto evidence that the ERP never sends a
distinct "branch" concept at all.

When an administrator's `customFields.branchId` is set, it is applied as the sole scope filter
for `'department'`-kind scope (name aside). Central-only roles (`general-director`,
`portal-admin`) have `branchId = null` — no branch filter is applied, they see everything.

**Where `branchId` actually lives is not the same field for every resource — this was a real
design decision, not an oversight:**

- **`Counterparty.branchId`** is the customer's _home/reporting_ branch — display/default-
  assignment field, **and, as of the round-3 correction below, also the real access-scope filter
  for the `Counterparty` record itself** (explicit product decision, security takes priority over
  the chain-account precision concern that originally argued against this — see that concern
  below, still real, not yet solved). A chain/network customer (e.g. a multi-location fuel
  station chain) can have trading points served by several different branches; filtering the
  parent `Counterparty` record by its single `branchId` can therefore still hide it from — or
  wrongly show all of it to — a branch that only services part of it. That imprecision is an
  accepted, known limitation until issue #65/#123's real per-entity branch-assignment/triage
  workflow ships; it does not justify going back to no filtering at all, per the round-3 decision.
  **Historical bugs, fixed (2026-09-20, three rounds)**: (1) `CounterpartyService.findVisible`/
  `AccessScopeService.assertCounterpartyWritable` used to filter by `c.branchId =
scope.branchId` anyway. It "worked" only by accident — `Administrator.customFields.branchId`
  and `Counterparty.branchId` both held the same raw, unresolved ERP id before the "Branch vs
  Department" fix above, so the comparison coincidentally matched; once
  `Administrator.customFields.branchId` was fixed to hold a real `Branch.id`, that accidental
  match broke and department-scoped staff with a branch assigned saw **zero** counterparties.
  (2) The first fix's replacement — filtering by `departmentId` instead — was itself wrong per
  the corrected rule above (`departmentId` must never filter anything). That round's replacement
  — applying **no filter at all** for `'department'`-kind scope, on the reasoning that
  `Counterparty.branchId` had no automatic-assignment worker yet (issue #65, now implemented; see "Automatic branch assignment") so filtering by
  it would show zero counterparties to every branch-scoped role — was itself rejected as a
  security regression (round 3, same day, explicit product decision): a branch-scoped manager
  must never see a Counterparty that isn't theirs, full stop, even if that means they see none
  until #65/#123 ships. **Current, correct state**: `'department'`-kind scope filters by
  `c.branchId = scope.branchId` (exact match) in both `CounterpartyService.findVisible`/
  `findVisiblePage`/`findOneVisible` and `AccessScopeService.assertCounterpartyWritable`.
  Deliberately **no** `OR c.branchId IS NULL` carve-out — an unassigned Counterparty is invisible
  to every branch-scoped role (deny-by-default), visible only to `'all'`-scope roles
  (general-director, portal-admin), until issue #65/#123's real assignment/triage workflow
  populates `branchId` for real accounts. This intentionally differs from Order/ProformaInvoice's own
  `OR branchId IS NULL` carve-out below — those resources denormalize a _different_, more
  reliably-populated `branchId` (from `TradingPoint.servicingBranchId`/an order's placement-time
  snapshot), where the permissive carve-out was itself a targeted bug fix (a real order silently
  invisible to its own department). Counterparty's own `branchId` has no such reliable population
  path yet, so the safe default is deny, not allow.
  A user-supplied narrowing filter (`findVisiblePage`'s `options.branchId` — e.g. a manager-portal
  UI dropdown) is applied in addition to this scope filter, never instead of it; it cannot widen
  what a branch-scoped caller sees.
- **`TradingPoint.servicingBranchId`** is the real access-scope filter for a customer's locations
  and everything derived from them (`Order`, `Reservation` inherit `branchId` from the
  `TradingPoint` selected at creation time, denormalized onto the row for filtering without a
  join — same pattern as `Reservation.stockLocationId`). Defaults to the parent `Counterparty`'s
  `branchId` at `TradingPoint` creation time (covers the ~90–95% single-branch case with zero
  manual work); explicitly overridable per point for chain accounts. `OrderVisibilityService`/
  `ProformaInvoiceVisibilityService` already correctly filtered by this denormalized `branchId` (never
  `Counterparty.branchId`) before today's fix — the only change there was dropping the
  additional, wrong `departmentId` comparison they also used to apply.
- **The preferred trading point is self-healing, and reading it can write.**
  `TradingPointService.getPreferredForCustomer` — used by the Shop API `preferredTradingPoint`
  field, proforma invoices, MOQ and order placement — runs one atomic `UPDATE ... RETURNING` on the
  customer row. If the stored preferred point is missing, inactive or hidden by the customer, it
  is replaced by the counterparty's first active, visible point (ordered by name); a working
  choice is never touched. A customer never has to pick a point by hand, and the placement-time
  `branchId` above is therefore resolvable for any customer whose counterparty has a point. The
  point always comes from the customer's own counterparty, so it cannot widen scope. If the
  counterparty has no usable point, the stored value is left as is.

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

### Custom fields are read-only to clients by default (#266)

`CustomFieldWritePolicyPlugin` (`apps/server/src/custom-field-write-policy.plugin.ts`, last in `plugins`) marks every
custom field `readonly: true` unless it is listed in `CLIENT_WRITABLE_CUSTOM_FIELDS`. Readonly strips the field from the
`Create/Update<Entity>CustomFieldsInput` types and the interceptor rejects it ("is readonly"); services still write it.
`OrderLineCustomFieldsInput` keeps readonly fields in the schema, so the interceptor is the only barrier there.

- Startup refuses to run (`onApplicationBootstrap`) if any custom field is writable and not in the allow-list, e.g. a plugin ordered after the policy plugin.
- A new custom field needs no flag: it is service-only. To let a client set it, add it to the allow-list with the reason.
- Guard: `apps/server/src/__tests__/unit/custom-field-write-policy.test.ts` builds the Shop and Admin schemas from the real
  config and fails if any Create/Update input exposes a field outside the allow-list.
- `public` only controls reading in the Shop API; it never makes a field writable.
- Shop/Admin introspection is off when `NODE_ENV=production` (it lists every writable input).

### Scope guards on permission-only reads

A permission alone never exposes another scope's rows. These Admin API reads re-check scope in the backend:

- `orderReservations(orderId)` and `availableStock(orderId)` resolve the order through `OrderVisibilityService` first (`ReservationAccessService`); an order outside the caller's scope is "Order not found".
- `entityVersions` / `entityVersionsForEntities` drop refs the caller may not see. Owning plugins register a per-entity rule in `EntityVersionScopeRegistry` (counterparty plugin: `Counterparty`, `TradingPoint` via counterparty scope, `VisibilityGrant` via the grant-management permissions). An entity name with no rule is visible only with counterparty scope `all` (deny by default).
- `availableStock` without an `orderId` stays unscoped on purpose: stock is not branch-scoped data.
- `reservationExtensionLimit(roleCode)` returns a limit only for one of the caller's own roles, or to a caller with `ManageAccessControl`; otherwise null.

## Layer 4: field-level redaction

**Rule: a field that must never reach a role (e.g. the purchase or floor price) is protected
declaratively where possible, and always deny-by-default: nothing is returned, neither the value
nor the type code, unless a rule grants it.**

### Price type visibility (#235)

`PriceType.visibility` is a DB attribute with two classes: `customer` (types a customer can buy
at and a manager can assign) and `confidential` (purchase price, floor, any internal price). Every
type is `confidential` until a data step classifies the customer set
(`infrastructure/scripts/price-type-visibility.sql`, see `docs/pricing.md`).

`PriceTypeAccessService` (plugin-access-control) is the single decision for every admin path.
Effective access is the union of:

1. Branch allow-list: `BranchSettings.visiblePriceTypeIds` plus the branch default type, customer
   types only. A `null` list grants nothing beyond the default; an actor without a branch gets nothing.
2. `ReadAllCustomerPriceTypes`: customer types of every branch.
3. `ReadConfidentialPriceTypes`: confidential types (replaces `ReadFloorPrice`). A branch rule
   never grants a confidential type, and neither does a customer context.

Context: a customer's own type is shown in that customer's/counterparty's context even outside the
branch list, as long as it is a `customer` type. Derived values (floor, markup, margin, profit)
need `ReadConfidentialPriceTypes`; a derived value is never more accessible than its source.

Consumers (admin API): `priceTypeCodes`, `priceTypes`, `priceEntriesForVariants`,
`upsertPriceEntry`/`bulkUpsertPriceEntries`, `discountRules` and its upserts, `discountRegistryPage`,
`expiringDiscountGrants`, `discountGrantsForCounterparty`, `requestDiscountGrant`,
`Customer.priceType`, `Counterparty.priceType` (null without access), `upsertCounterparty`,
`RetroBonusRule.priceTypeErpId` (null without access), admin catalog search pricing
(`SearchPriceTypeService`), `floorPrice`/`floorPricesForVariants` (`ReadConfidentialPriceTypes`).
A hidden or unknown code returns `ForbiddenError`; a list simply omits the type. The floor check
runs regardless of the viewer's rights and its findings never carry the number.

Storefront: a customer only ever gets the price of their own type (main contract type, else the
branch default); a purchase type is never resolved for a customer. No shop query exposes another
type. `price-type-schema-guard.test.ts` fails on any new price-bearing GraphQL field that is not
classified in its inventory. Reserved for a purchasing portal: a product-range scope on top of
these permissions.

Preferred mechanism — `requiresPermission` on the `CustomFieldConfig`:

```typescript
customFields: {
  PriceType: [
    {
      name: 'floorPrice',
      type: 'float',
      requiresPermission: [CustomPermission.ReadConfidentialPriceTypes.Permission],
    },
  ],
}
```

For a role without `ReadConfidentialPriceTypes`, the field is absent from the GraphQL schema itself (not
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
`manager` check (`docs/checks-and-policies.md`), evaluated by the service before the underlying
change is applied; its policy, not code, says whether the answer is `block`, `warn` or
`require-approval`. The check is the only code that sees the protected threshold value (e.g.
`floorPrice`) — its findings carry a reason, never the threshold, and the client never receives it.**

The three manager-action controls (#242), all stage-scoped policies of the `manager` subject:

| Code | Stage | Finding when | Default | Per-role data |
| --- | --- | --- | --- | --- |
| `manager.reservation-extension-days` | `extend-reservation` | requested extra days exceed the most permissive limit among all the actor's roles, or none of them has a limit row | `block` | `ReservationExtensionLimit` per role |
| `manager.credit-term-extension` | `extend-credit-term` | requested days or amount exceed the limit of the policy **recipient** role, or that role has no limit row, or the policy has no recipient | `require-approval` (the escalated chain; no finding uses the single-step chain) | `CreditTermLimit` per role; the recipient (seeded `department-head`) is policy data, not code |
| `manager.price-adjustment-floor` | `adjust-price` | requested price is below the floor price, or the variant has no floor price | `require-approval` | none |

`order.below-floor-price` (#256, `order` subject, stages `pre-reserve` and `on-edit`, default `warn`) is the same floor applied to a placed order's lines (listed price below the floor). It runs for every viewer, its facts carry the SKU and a reason only, never the floor or the price, and a variant without a known floor yields no finding. The per-line mark is accepted as visible to every manager (owner decision): a manager changes the price type, not the price, and cannot probe the floor without the price-adjustment or extra-discount rights. Points: `pre-reserve` runs on the customer's order placement (automatic reserve) and again on the manager's confirmation, always against the current floor; `on-edit` is the manual recompute. Deliberately omitted: re-evaluation when a purchase price or multiplier changes (confirmation re-reads the floor anyway, and a stale mark cannot reach an order with no stored findings), `pre-send-to-erp` (the ERP has its own control) and any hold or approval consequence (a policy change, no approval workflow yet).

An actor with several roles is judged by all of them (`getActorIdentity().roleCodes`); the credit-term check ignores the actor's roles because it is judged against the single policy recipient role.

`require-approval` creates the approval request of the flow's own request type; the chain stays
`approval-workflow`'s job. `warn`/`info` let the action proceed on the ordinary path (a price is
still applied only with `AdjustPriceWithinLimit`). `block` refuses with `ForbiddenError`.
`require-approval` is offered at the credit-term and price stages only: a reservation extension has no
approval executor. Extending a reservation takes the order's `reserve-order:<id>` lock before reading
the active reservations, so two extensions add up.

```typescript
@Mutation()
@Allow(CustomPermission.AdjustPriceWithinLimit.Permission,
       CustomPermission.RequestPriceAdjustmentApproval.Permission)
async adjustOrderLinePrice(@Ctx() ctx: RequestContext, @Args() args: AdjustPriceInput) {
  const decision = await this.priceAdjustment.decide(ctx, args); // evaluates the manager check
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

### Integration health drill-down lists (issue #200)

`integrationInboxIssues` and `integrationOutboxProblems` (paginated, filter/sort whitelisted
server-side, payloads never selected) need `ManageErpIntegration`, like the rest of the health
page. `replayFailedIntegrationInbox` (1 to 100 row ids), `requeueFailedIntegrationOutbox` and
`rebuildSkippedIntegrationOutbox` need `RecoverIntegrationEvents`; the dashboard shows their buttons
only to holders of it.
