# Checks and policies framework

One way to add, run and act on any control: a limit, a stock or contract rule, an ERP-mandated
requirement, a customer rule, a manager's own limit. Orders are only the first **subject type**;
the framework is not tied to them. Introduced with #237; existing controls (#201, #205, credit,
reserve) are wrapped as providers gradually, when touched, not in one rewrite.

## Principles

1. **A check only describes a fact.** Pure: reads, never writes, blocks, sends or notifies. It
   returns findings, not a boolean.
2. **The consequence is a policy, separate from the check.** Policies live in the database and are
   edited by a permitted role in the manager portal, never an `if` in code. Each check has its own
   policy set: different checks have different consequences, recipients and stages.
3. **One stored result per subject, one read path.** Pages, list chips, health counters and detail
   views (e.g. #233) read the stored result. No check logic in a frontend.
4. **Fixed vocabulary.** New controls are new rows (a provider + default policy), not new mechanisms.

## Subject type

What is being checked: `order` today; later `customer`, `manager` (an actor's own limits), a
document, etc. A subject type declares: how to load the subject, its **stages**, who may see
findings, and its lock for recomputation. Checks belong to exactly one subject type.

Stages are defined per subject type. For `order`: `cart`, `checkout`, `pre-reserve`,
`pre-send-to-erp`, `on-edit`.

## Check (provider)

- Registered in the `CheckRegistry` (see Implementation); `code` is a stable dotted key
  (`erp.contract-with-storage-org`, `erp.organization-stock`, `credit.limit`) and is never reused.
- Declares `subjectType`, `stages`, a one-line `description` (the list in the manager UI is
  generated from the registry, not maintained by hand).
- `evaluate(subject, ctx)` returns findings: `severity` (`info`/`warning`/`error`), optional
  `lineRef`, structured `facts` (needed/available/organization ids...), a message key. Text is
  built from `facts` at render time; prose is not stored.
- Data it cannot judge yields no finding, never a false positive.

## Policy (business rule)

One row per (`check code`, `stage`): consequence, recipient, enabled flag, history (who changed
what, when). Editable in the manager portal ("Controls and policies" tab, own permission). The
portal's existing control toggles migrate into this table.

| Consequence        | Effect                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| `info`             | recorded and shown, nothing else                                             |
| `warn`             | shown to the recipient, the subject proceeds                                 |
| `hold`             | the subject is not advanced automatically until staff releases it            |
| `block`            | the transition is refused with the reason                                    |
| `require-approval` | creates a requirement for a role; the chain is `approval-workflow`'s job     |

Which consequences make sense is limited by the subject type (a customer cannot be "reserved").
Recipient is a role/scope via `access-control`; escalation (manager -> head) is
`require-approval`, not a new mechanism. Default for a new check is `warn`; tightening is a data
change. End customers see at most a soft, generic note, never internals.

## Orchestrator and stored result

- One entry point `runChecks(subjectType, subjectRef, stage)`; flows (`reserveOrder()`, listeners,
  resolvers) call it and act on the returned consequences instead of repeating rules.
- `check_result`: subject type + id, `check code`, line ref, severity, `facts`, data version,
  `computedAt`. An event of relevant data only marks the subject stale; recomputation runs under
  the subject's lock (`docs/concurrency.md`). A staff override is recorded in the subject's
  history: who, when, which findings.

## Adding a check

Use the `checks-policy` skill. Rule text of a concrete check lives in its domain doc (for ERP order
requirements: `docs/order-contracts.md`) with a reference to the `code`; this file holds only
the framework.

## Implementation (`packages/plugins/checks`, `@mivend/plugin-checks`)

Subject-agnostic: it depends only on `shared` and `access-control` (permissions); subject types
and checks are registered by the plugins that own them.

- **Registration.** A plugin imports `ChecksPlugin`, injects `CheckRegistry` and calls
  `registerSubjectType({ type, stages, allowedConsequences, loadSubject, lockKey, dataVersion? })` and
  `registerCheck({ code, subjectType, stages, description, defaultConsequence?, evaluate })` from
  `onModuleInit`. Plugin init order is not assumed: stage names and the default consequence are
  validated whenever both sides are known; duplicate codes/types throw at startup.
- **Policies.** `check_policy` is unique on (`checkCode`, `stage`) and created lazily on first run
  (or first list) from the provider's `defaultConsequence`, `warn` when omitted. `enabled=false`
  skips the provider and clears its stored findings. `updateCheckPolicy` rejects a consequence the
  subject type does not allow and appends `check_policy_history` (before/after, user id).
- **Run.** `ChecksService.runChecks(ctx, subjectType, subjectRef, stage)` takes the subject's
  advisory lock (`lockKey`), loads the subject under it, evaluates providers of the stage, replaces
  that subject+stage rows of `check_result` and returns `{ findings, strongestConsequence }`.
  Strength order: `info < warn < require-approval < hold < block`.
- **Provider errors are never swallowed.** A throwing provider is logged at error level and the
  run rethrows; the transaction rolls back, so the previous stored results stay and a broken check
  never reads as "no findings".
- **Stale.** `markStale(ctx, subjectType, subjectId)` (under the same lock) flags stored rows; a
  subject with no stored findings has nothing to flag, callers needing freshness re-run.
- **Admin API.** `checkResults(subjectType, subjectId)` and `checkDefinitions(subjectType?)` need
  `ReadCheckResults`; `checkPolicies(subjectType?)` and `updateCheckPolicy(input)` need
  `ManageCheckPolicies`.
