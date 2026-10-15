---
name: checks-policy
description: Mandatory before adding or changing any control (limit, stock, contract, ERP requirement, customer or manager rule) or its consequence (warn, hold, block, approval), for any subject type. Enforces the check/policy separation from docs/checks-and-policies.md.
---

# Checks and policies

Read `docs/checks-and-policies.md` first. It is the source of truth; this is the procedure.

1. **Subject type.** Which subject is checked (`order` today)? A new subject type needs: loader,
   stages, visibility, lock. Add it to the framework, not to the check.
2. **Check or policy?** A fact ("line needs 5, organizations hold 2") is a check. What to do about
   it (warn, hold, block, approval, for whom, at which stage) is a policy, per check. Never put the
   consequence inside the check.
3. **Reuse before adding.** Look in the registry for an existing `code`/facts; extend facts instead
   of adding a near-duplicate.
4. **Provider:** stable dotted `code`, `subjectType`, `stages`, one-line `description`, pure
   `evaluate` returning findings with structured `facts` and a message key. Unknown data gives no
   finding.
5. **Default policy as data** (seed/migration row), default `warn` unless the owner decided
   otherwise. Never hardcode a consequence, role or threshold in code.
6. **Enforce through `runChecks` only.** No direct call from a resolver, flow or listener; no rule
   text duplicated per stage.
7. **Show through the stored result** only; no frontend logic, no second read path; customer text
   stays generic.
8. **Concurrency:** recompute under the subject's lock (`docs/concurrency.md`).
9. **Tests** (call `test-design`): each finding kind, pass/fail, unknown data not flagged, stages
   consistent, a policy change changes the consequence with no code change.
10. **Docs:** concrete rule text in its domain doc with the `code`; framework changes only in
    `docs/checks-and-policies.md`. No third place.
