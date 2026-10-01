# Access control implementation notes

Concrete Vendure/TypeORM gotchas and code patterns discovered while implementing
`docs/access-control.md` (layers 2-5) in `packages/plugins/access-control` and
`packages/plugins/approval-workflow`. `docs/access-control.md` describes the intended
architecture; this file records what actually happened building it — read both before
touching permission/scope/redaction/approval code.

---

## Antipatterns discovered (do not repeat)

### 1. `Role.customFields` does not exist in Vendure 3.6.4

Vendure's `Role` entity has no `customFields` support, unlike `Administrator`/`Customer`/`Order`/
`Product`. Registering `config.customFields.Role = [...]` compiles fine and passes `tsc`, but
crashes the server at bootstrap with:

```
Error: Could not find embedded CustomFields property on entity "Role"
```

This is a **hard crash, not a schema warning** — the server crash-loops under `ts-node-dev
--respawn` until fixed, which looks like a transient dev-server flake if you don't read the
actual stack trace.

**Fix used**: role → max-scope-per-resource config lives in a dedicated entity
(`RoleAccessScope`: `roleCode` + JSON `accessScopeConfig`), not a `Role.customFields` field. See
`packages/plugins/access-control/src/entities/role-access-scope.entity.ts` and
`RoleScopeConfigService`. Exposed to admins via a dedicated mutation
(`setRoleAccessScopeConfig`, gated by `ManageAccessControl`), not via `updateRole`'s
`customFields` input.

**Before adding a `customFields` entry for any entity you haven't used before**: check it's one
Vendure actually supports (`Administrator`, `Customer`, `Order`, `Product`, `ProductVariant`,
`Collection`, etc. — not `Role`, not most join/config-only entities). When in doubt, boot the
server once after adding the field before building anything on top of it.

### 2. `@Allow()` on a `@ResolveField()` does not reliably gate the field (Vendure 3.6.4)

Field-level permission gating via `@Allow(SomePermission)` directly on a `@ResolveField()`
method **compiles, appears to register correctly, and silently does nothing** — an
administrator without the permission still receives the real field value, no `ForbiddenError`,
no log.

Verified live against a running dev server: a `manager`-role administrator (lacking
`ReadCounterpartyCredit`) received the real `creditLimit`/`creditBalance` values with only
`@Allow()` attached to the field resolver.

Root cause (from reading `@vendure/core`'s `AuthGuard.canActivate` and
`DefaultEntityAccessControlStrategy`, both `@since 3.6.0` / `@experimental`): the guard _does_
read `@Allow()` metadata for field resolvers via `isFieldResolver(info)` and does call
`strategy.canAccess(ctx, permissions)` — the logic looks correct on paper. In practice it did
not reject. Root-level `@Query()`/`@Mutation()` `@Allow()` on the very same resolver file works
correctly (verified with `setRoleAccessScopeConfig` and `decideApprovalRequest`) — this is
specific to `@ResolveField()`.

**Fix used**: never rely on `@Allow()` for field-level redaction. Check explicitly in the
resolver body instead:

```typescript
@ResolveField()
creditLimit(@Ctx() ctx: RequestContext, @Parent() counterparty: Counterparty): number {
    if (!ctx.userHasPermissions([CustomPermission.ReadCounterpartyCredit.Permission])) {
        throw new ForbiddenError();
    }
    return counterparty.creditLimit;
}
```

See `packages/plugins/counterparty/src/counterparty.resolver.ts`
(`CounterpartyCreditResolver`). This is the correct fallback per `docs/access-control.md` layer
4 anyway (for fields that aren't real `customFields`) — but the lesson is: **don't even attempt
`@Allow()` on a `@ResolveField()` first and assume it works; go straight to the explicit
`ctx.userHasPermissions()` check.**

**Verification requirement going forward**: any field-level redaction must be proven with a live
request against a real logged-in session (or an integration test that exercises the actual
GraphQL resolver, not just the service method) — a unit test that calls the resolver method
directly with a mock `ctx` does NOT catch this bug, because the bug is entirely in whether the
guard framework invokes the check at all, not in the check's logic once invoked.

### 3. TypeORM `@VersionColumn()` does not enforce optimistic locking on a plain `repo.save()`

Loading an entity, mutating it, and calling `repository.save(entity)` does **not** reject a
stale write. Two concurrent `findOneOrFail()` → mutate → `save()` sequences on the same row both
succeed silently — no `OptimisticLockVersionMismatchError`, no error at all, and the row ends up
double-applied (in the approval-workflow case: `currentStepIndex` advanced by 2 instead of 1 for
a single logical decision race).

This was caught by the concurrency integration test (`docs/access-control.md`'s own mandatory
"Approval engine concurrency test" requirement) — without that test, this bug ships silently.

**Fix used**: an explicit guarded `UPDATE` via query builder, checking `affected === 0`:

```typescript
const updateResult = await repo
    .createQueryBuilder()
    .update()
    .set({ /* fields */, version: () => 'version + 1' })
    .where('id = :id AND version = :version', { id: request.id, version: request.version })
    .execute();

if (updateResult.affected === 0) {
    throw new ApprovalConcurrencyError(String(requestId));
}
```

Note `.update()` with **no entity class argument** — pass the entity class explicitly (e.g.
`.update(ApprovalRequest)`) and it breaks against a test `DataSource` that only registers a
differently-named test entity for the same table (`Class constructor ApprovalRequest cannot be
invoked without 'new'`). Calling `.update()` on a repository-bound query builder with no
argument updates whatever entity the repository is already scoped to, and works in both
production and hand-rolled-entity integration tests.

See `packages/plugins/approval-workflow/src/approval-request.service.ts` (`decide()`) and its
concurrency test at
`packages/plugins/approval-workflow/src/__tests__/integration/approval-request.concurrency.test.ts`.

**Rule going forward**: `@VersionColumn()` alone is not suficient for "optimistic locking on
every transition" (docs/access-control.md's approval-engine rule). Always pair it with an
explicit `WHERE version = :expected` guarded update and an `affected === 0` check, exactly as
the doc's alternative phrasing already allowed ("`@VersionColumn()` **or** an explicit `WHERE
currentStepIndex = :expected` guard") — in practice you need the explicit guard regardless of
whether `@VersionColumn()` is also present.

### 4. Plugin `dist/` changes are not reliably picked up by the running dev server

`ts-node-dev --respawn` watches `apps/server/src/**` reliably. It does **not** reliably restart
when a `@mivend/plugin-*` package's `dist/` output changes (even though those files are `import`ed
transitively via `node_modules`) — in this session, rebuilding `packages/plugins/access-control`
several times over did not trigger a respawn, and the running server kept serving a stale
GraphQL schema/permission set for tens of minutes.

Symptoms this causes when misdiagnosed: a permission or schema field that was just added appears
completely absent from a live GraphQL query, even though `tsc` succeeded and the compiled `dist/`
file on disk is correct — easy to mistake for a code bug when it's actually a stale process.

**Fix used**: after any plugin change that touches `customFields`, `customPermissions`, or
GraphQL schema shape (anything requiring a real server restart per the existing "GraphQL schema
requires server restart" gotcha), do a full `make down` + `make dev` cycle, not just wait for
`tsc -b --watch` to rebuild. Confirm the new schema is actually live before testing further:

```bash
curl -s http://localhost:3000/admin-api -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ __type(name: \"Permission\") { enumValues { name } } }"}'
```

`make dev`'s own DB-creation check has a startup race (`psql: FATAL: the database system is
starting up`) if run immediately after `make down` — wait for
`docker exec docker-postgres-central-1 pg_isready` before retrying `make dev`, or it errors out
before starting the app processes at all.

### 5. Core Vendure services (`AdministratorService`, etc.) enforce RBAC internally — plugin-owned services don't

Every other erp-import handler (counterparty, price, trading point, ...) calls a
plugin-owned service touching a plugin-owned entity, and the unauthenticated `RequestContext`
built by `ErpImportController` (`requestContextService.create({ apiType: 'admin', req })`, no
`user`) works fine for those — there's no RBAC check in the way.

`AdministratorService.update()` is different: it's a **core** Vendure service, and it enforces
permission checks internally (not just via a resolver's `@Allow()`). Called with the same
unauthenticated erp-import context, it throws
`error.active-user-does-not-have-sufficient-permissions` — confirmed live, this doesn't show up
in any type system or unit test, only when actually hitting the endpoint.

**Fix used**: build a system-level `RequestContext` from the bootstrap SuperAdmin `User`
(via `RoleService.getSuperAdminRole()` + a query for a `User` holding that role), and use it
**only** for the specific privileged call — not propagated to the rest of the import batch:

```typescript
private async getSystemContext(ctx: RequestContext): Promise<RequestContext> {
    const superAdminRole = await this.roleService.getSuperAdminRole(ctx);
    const user = await this.connection
        .getRepository(ctx, User)
        .createQueryBuilder('user')
        .innerJoinAndSelect('user.roles', 'role', 'role.id = :roleId', { roleId: superAdminRole.id })
        .leftJoinAndSelect('role.channels', 'channel')
        .getOne();
    if (!user) throw new InternalServerError('No user with the SuperAdmin role was found');
    return this.requestContextService.create({ apiType: 'admin', user, channelOrToken: ctx.channel });
}
```

See `EmployeeService.getSystemContext()` in `packages/plugins/access-control`. **Rule going
forward**: before calling any core Vendure service (as opposed to a plugin-owned one) from a
context that might be unauthenticated (erp-import, background jobs, etc.), check whether that
service enforces its own RBAC — if so, either pass a real authenticated `ctx` through, or build
a scoped system context for just that call, matching this pattern.

---

## Patterns confirmed to work well

### Live end-to-end verification via cookie-jar curl sessions

No GraphQL/e2e test harness exists in this repo for full Admin-API-with-real-permissions flows
(only hand-rolled entity-level integration tests, see `documents`/`sync`/`counterparty`). For
verifying actual authorization behavior (as opposed to unit-testing the service logic in
isolation — see antipattern #2 above, which a service-level unit test would NOT have caught),
scripted curl against a real running dev server is the only reliable option currently in this
codebase:

```bash
curl -s -c /tmp/cookies-x.txt -o /dev/null http://localhost:3000/admin-api -X POST \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { login(username:\"x@example.com\",password:\"...\"){ ...on CurrentUser{id} } }"}'
curl -s -b /tmp/cookies-x.txt http://localhost:3000/admin-api -X POST \
  -H "Content-Type: application/json" -d '{"query":"{ ... }"}'
```

**Use `-c`/`-b` cookie-jar flags, not a captured `vendure-auth-token` header replayed via
`Authorization: Bearer`** — the latter intermittently returned "not currently authorized" for
subsequent requests in this session even with a freshly captured token (unclear root cause,
possibly channel-context state tied to the cookie-based session flow specifically); the cookie
jar approach worked reliably every time.

Always clean up test `Administrator`s (`deleteAdministrator`) and any test data rows created this
way after verification — they're easy to forget since they don't show up in `git status`.

### Data-driven role→scope config, not hardcoded

`RoleScopeConfigService`/`RoleAccessScope` (role code → `{ resource: 'own'|'department'|'all' }`
JSON) and `WorkflowDefinition` (requestType → JSON steps) both keep authorization/process
_configuration_ in the database, edited via dedicated mutations, never hardcoded in plugin code
— consistent with the backend-plugin-rules skill's "business data must live in the database" rule, extended here to
cover access-control and workflow config specifically (which isn't classic "business data" like
price types, but is equally prone to needing change without a deploy).

The one deliberate exception: `CREATE_PERMISSION_BY_REQUEST_TYPE` in
`approval-workflow.resolver.ts` (which `requestType` requires which create-permission) **is**
hardcoded, because a `requestType` is an internal technical identifier fixed by the workflow
engine itself, not swappable business data — matches the backend-plugin-rules skill's carve-out for "internal
technical states that are truly fixed by the application logic."

### Explicit permission checks are self-documenting about _why_ a value is protected

Given antipattern #2, every field-level redaction resolver in this codebase should keep the
explicit `ctx.userHasPermissions()` check with a comment explaining _why_ `@Allow()` wasn't used
— otherwise a future edit will "simplify" it back to a bare `@Allow()` decorator, silently
reintroducing the leak. See the comment block in `CounterpartyCreditResolver`.
