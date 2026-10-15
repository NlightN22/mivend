---
name: order-checks-policy
description: Mandatory before adding or changing any order/customer/manager control (limit, stock, contract, ERP requirement) or its consequence (warn, hold, block, approval). Enforces the check/policy separation from docs/order-checks.md.
---

# Order checks and policies

Read `docs/order-checks.md` first. It is the source of truth; this is the procedure.

1. **Is it a check or a policy?** A fact about the order ("line needs 5, organizations hold 2") is a
   check. What to do about it (warn, hold, block, approval, for whom, at which stage) is a policy.
   Never put the consequence inside the check.
2. **Reuse before adding.** Look in the registry for an existing `code`/facts that already covers it;
   extend facts instead of adding a near-duplicate.
3. **Write the provider:** stable dotted `code`, `stages`, one-line `description`, pure `evaluate`
   returning findings with structured `facts` and a message key. Unknown data gives no finding.
4. **Add the default policy as data** (seed/migration row), default consequence `warn` unless the
   owner decided otherwise. Never hardcode a consequence, a role or a threshold in code.
5. **Enforce through `runChecks(order, stage)` only.** Do not call a check directly from a
   resolver, `reserveOrder()` or a listener; do not duplicate rule text per stage.
6. **Store and show through the shared result** (`order_check_result`); no frontend logic, no
   second read path. Customer text stays generic.
7. **Concurrency:** recompute under the order lock; follow `docs/concurrency.md`.
8. **Tests** (call `test-design`): each finding kind, pass/fail, unknown data not flagged, each
   stage consistent, policy change changes the consequence without code change.
9. **Docs:** domain rule text in its domain doc with a reference to the `code`; framework changes
   only in `docs/order-checks.md`. No third place.
