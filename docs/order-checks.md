# Order checks framework

One way to add, run and act on any control over an order (credit limit, stock, contract,
ERP-mandated rules, customer rules, manager limits). Introduced with #237; existing checks
(#201, #205, credit, reserve) are wrapped as providers gradually, when touched — not in one rewrite.

## Principles

1. **A check only describes a fact.** It is pure: reads, never writes, blocks, sends or notifies.
   It returns findings, not a boolean.
2. **The consequence is separate from the check.** What happens on a finding is a *policy*, kept in
   the database and editable by a role in the manager portal — never an `if` in code.
3. **One result per order, one read path.** Order page, list chip, Integration health counters and
   stock/reserve views (#233) all read the stored result. No check logic in a frontend.
4. **Fixed stages, fixed consequences.** New checks and policies are rows, not new mechanisms.

## Check (provider)

- Registered in a registry (multi-provider); `code` is a stable dotted key (`erp.contract-with-storage-org`,
  `erp.organization-stock`, `credit.limit`, `reserve.availability`) and never reused.
- `evaluate(order, ctx)` returns findings: `severity` (`info`/`warning`/`error`), optional `orderLineId`,
  structured `facts` (needed/available/organization ids...), a message key. Text is built from `facts`
  at render time; no prose is stored.
- Declares its `stages` and a one-line `description` (the check list in the manager UI is generated
  from the registry, not maintained by hand).
- Data it cannot judge (unknown) yields no finding, never a false positive.

## Stages

`cart`, `checkout`, `pre-reserve`, `pre-send-to-erp`, `on-edit`. One orchestrator
`runChecks(order, stage)` is the only entry point; `reserveOrder()` and the `order.confirmed`
listener call it instead of repeating rules.

## Policy (business rule)

A policy row binds `check code` + `stage` to a consequence and a recipient. It is business data:
edited in the manager portal (a dedicated "Controls and policies" tab; a permission for the
role allowed to edit), with history of who changed what. The portal's existing control toggles
migrate into this table, not the reverse.

| Consequence        | Effect                                                                    |
| ------------------ | ------------------------------------------------------------------------- |
| `info`             | recorded and shown, nothing else                                          |
| `warn`             | shown to the recipient, the order proceeds                                |
| `hold`             | the order is not reserved/sent automatically until a staff member releases it |
| `block`            | the transition is refused with the reason                                 |
| `require-approval` | creates a requirement for a role; the chain is `approval-workflow`'s job  |

Recipient is a role/scope resolved through `access-control`; escalation (manager -> head) is
`require-approval`, not a new mechanism. Default policy for new checks is `warn`; tightening is a
data change. Customers see at most a soft, generic note, never internals.

## Stored result

`order_check_result`: order, `check code`, line, severity, `facts`, data version, `computedAt`.
Recomputed on demand and when relevant data changes (an event only marks the order stale);
recomputation runs under the order lock (`docs/concurrency.md`). A staff override is recorded in
the order history: who, when, which findings.

## Adding a check — checklist

Use the `order-checks-policy` skill. Short form: provider with `code`+`stages`+facts, default
policy row, test per finding kind and per stage, entry in the doc of the domain it belongs to
(rule text lives there; this file keeps only the framework).
