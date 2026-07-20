---
name: access-control-review
description: Verify permission/scope/access-control changes against docs/access-control.md. Use after any change touching Permission definitions, @Allow(), AccessScopeService, requiresPermission customFields, approval-workflow gates, or Administrator/Role custom fields (departmentId/branchId).
---

# Access control review

Run this skill after any code change that touches authorization: new or modified
`Permission`/`PermissionDefinition`, `@Allow()` usage, row-level scope filtering, a
`requiresPermission` customField, an approval-gate service, or the approval-workflow engine
(`packages/plugins/approval-workflow` or equivalent).

The single source of truth for what "correct" looks like is **`docs/access-control.md`**. Read
it in full before reviewing — do not rely on memory of its contents, it may have been updated
since you last read it.

## Review procedure

1. Read `docs/access-control.md` in full.
2. Get the diff for the current change (`git diff` / `git diff --staged`, or the specific files
   the user points at).
3. Check the diff against each rule below. For each, cite the file/line where it holds or
   breaks.

### Layer 2 — Permission

- [ ] Every new `Permission`/`PermissionDefinition` name encodes an **action**, never a scope
      keyword (`Own`, `Department`, `Branch`, `All`, `Region`, ...). A name like
      `ReadOwnCounterparties` is a violation — flag it and point to the "Layer 2" section.
- [ ] Resolvers use `@Allow()` only for the coarse action check — no role-name `if`/`switch`
      logic inside the resolver body.

### Layer 3 — Scope

- [ ] Row-level/ownership filtering goes through `AccessScopeService` (or the resource's
      `resolve<Resource>Scope` that itself delegates to a shared scope resolution, per the
      "one service, reused everywhere" rule) — not ad hoc `if (admin.role === ...)` logic
      duplicated in a domain service or resolver.
- [ ] A resource that inherits visibility from another resource (e.g. documents from
      counterparty) reuses that resource's scope resolution rather than reimplementing it.
- [ ] Scope kind values are restricted to what's actually resolved (`own`/`department`/`all` or
      the project's current equivalent) — no scope leaks wider than the role's configured
      maximum on any code path, including error/fallback branches (fallback must be the most
      restrictive scope, never `all`).

### Layer 4 — Field-level redaction

- [ ] A field intended to be hidden from some roles (e.g. floor price) is protected via
      `requiresPermission` on its `CustomFieldConfig`, OR — if it's a resolver-computed field —
      via a dedicated `@Allow()`-gated resolver that is never reused in a DTO/type shared with
      unauthorized roles.
- [ ] No manual "delete the field before returning" pattern where a declarative option
      (`requiresPermission`) would apply instead — flag this as a downgrade even if it's
      currently correct, since it's fragile to future refactors.

### Layer 5 — Approval gate

- [ ] The gate service is the only code path that reads/compares the protected threshold value;
      the GraphQL response (success or error) never returns that raw value to a caller without
      the corresponding read permission.
- [ ] Mutations that can bypass the gate (i.e. apply a change directly without ever calling the
      gate) are flagged unless clearly intentional and covered by a permission check equivalent
      to "apply within limit."

### Approval-workflow engine specifics (if touched)

- [ ] No long-lived XState actor held across requests — every transition rehydrates from
      `request.xstateSnapshot`, transitions, persists, and discards the actor within one
      call/transaction.
- [ ] The transition/update to `ApprovalRequest` uses optimistic locking (`@VersionColumn()` or
      an explicit `WHERE currentStepIndex = :expected` guard) — a bare `repo.save()` without a
      concurrency guard on a state transition is a violation.
- [ ] No automatic timers/cron-based escalation introduced — escalation stays manual-only,
      initiated by the request's creator, from the `escalatesTo` list in the
      `WorkflowDefinition`.

### Testing requirements

For each layer touched by the diff, confirm the corresponding test category from
`docs/access-control.md` § Testing requirements exists **in this change** (not just "exists
somewhere in the repo already" — a new scope/permission/gate needs its own tests):

- [ ] Scope resolution: unit tests per `AccessScopeKind`, plus a negative test for the
      most-restrictive-fallback rule.
- [ ] Row-level filtering: integration test proving both what a scope _does_ see and what it
      does **not** see (explicit id-absence assertion, not just count).
- [ ] Field-level redaction (`requiresPermission` fields only): integration test asserting the
      field is absent from schema/response for an unauthorized role, and present/correct for an
      authorized one.
- [ ] Approval gate: boundary test at the exact threshold, plus a test that no code path leaks
      the raw threshold value.
- [ ] Approval engine concurrency: a test simulating two concurrent `decide()` calls on the same
      step, asserting exactly one succeeds.

Tests must live in the locations specified in `docs/access-control.md` § "Where these tests
live" (`src/__tests__/unit/` vs `src/__tests__/integration/`) and run via `make test` /
`make test-int` — flag any test added that would only run via a direct `pnpm test` invocation
bypassing the Makefile (per AGENTS.md).

## Output

Report findings grouped by layer (2 through 5, then testing), each as: file:line, what the rule
requires, what the diff actually does, and whether it's a pass or a violation. If everything
passes, say so explicitly per layer — do not omit a layer just because it wasn't touched, note
"not touched by this diff" instead so the review is auditable.

If this review finds violations, fix them directly if the fix is unambiguous and small (e.g.
renaming a scope-encoded permission, adding a missing `@VersionColumn()`); for anything that
requires a design decision (e.g. what the correct scope fallback should be), stop and ask instead
of guessing.
