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
- **Provider errors are never swallowed by the framework.** A throwing provider is logged at error
  level and the run rethrows; the transaction rolls back, so the previous stored results stay and a
  broken check never reads as "no findings".
- **Order flows fail open (owner decision: a failing check must never stop an order).**
  `OrderChecksService.isHeld` (reserve) and `OrderSendHoldService` (send) catch the rethrown error,
  so a failing check does not hold or block the order. The failure is not silent: it is logged at
  error level and written to `order_check_failure` (error text cut to 500 characters, kept 30 days,
  pruned by a scheduled task) on its own connection, deferred and not awaited so the caller never
  waits for a second pool connection while holding one; `orderCheckHealth` lists it as
  `check-run-failed` per stage for 7 days. In
  `reserveOrder` the checks run inside a savepoint, so a SQL error in a provider cannot abort the
  reserve's transaction. A hold therefore depends on the check being able to run.
- **Stale.** `markStale(ctx, subjectType, subjectId)` (under the same lock) flags stored rows; a
  subject with no stored findings has nothing to flag, callers needing freshness re-run. Data
  handlers (stock-organization, storage-location, contract) do not mark in their own transaction:
  they write a durable, idempotent row to `check_stale_request` (kind + key, a version counter bumped
  by a repeated request) in the same transaction as the data change, so a retried message cannot
  lose the request and no order lock is held across a bulk load. `CheckStaleRequestService.drain`
  (fast path right after commit, plus the `check-stale-requests` scheduled task every minute)
  marks the affected subjects stale in short per-subject transactions (keyset pages, no cap) and
  deletes a request only if its version is unchanged; a failing handler leaves it for the next pass. A tombstone or delete that carries an entity id shared by several rows removes
  all of them and marks every affected product.
- **A policy takes effect for new runs; stored results are flagged out of date.**
  `updateCheckPolicy` (consequence or `enabled` changed) writes a `check-code` stale request in the
  same transaction (never a mass UPDATE under the policy lock, which could deadlock with a run
  holding result rows) and publishes `CheckPolicyChangedEvent`; the drain flags the results. Runs share-lock the
  policy rows, so a run in flight cannot leave fresh-looking results of the old policy. A disabled
  check keeps its old findings, flagged stale, until the subject is next recomputed. Loosening a
  `hold` at `pre-send-to-erp` re-drives the held sends (see below); a policy loosened from `hold` at
  `pre-reserve` does NOT auto-advance the order: it stays in the confirmation queue until staff confirms.
- **A send hold is rebuildable.** A hold at `pre-send-to-erp` leaves a `skipped` outbox row with a
  fixed reason. A staff confirmation of an already reserved order (stamps the reservations,
  `OrderStaffConfirmedEvent`) or a policy that stops holding re-drives those rows through the
  normal rebuild (`HeldSendRedriveService`), so a hold cannot block the ERP send for good. The
  row stays `skipped` while another policy still holds the order. The event path is only the fast
  path: a scheduled sweep (`erp-integration-held-send-redrive`, every 5 minutes) re-evaluates every
  held row (and rows whose rebuild failed) through the same rebuild, so a missed event, a failed
  rebuild, or a hold cause that disappeared with new data (for example a stock-organization row
  arriving) still ends in a send. Rebuild takes the outbox row lock first, then the order lock
  after the build, the same lock the live enqueue holds across check + insert, so a confirm and a
  re-drive in parallel produce exactly one outbox row.
- **Locking trade-off.** An order run takes `reserve-order:<id>`, the same lock as the reserve, so
  a long recompute delays the reserve of that order. The lock is taken once, inside `runChecks`,
  and held to the end of the surrounding transaction, which also covers the cross-stage cleanup.
- **No unique constraint on `check_result`.** A provider may emit several findings for one
  (check, line), and `lineRef`/`stage` are nullable, so a correct key does not exist at framework
  level; the guarantee is delete-then-insert under the subject lock, proved by concurrent-run tests.
- **Visibility.** A subject type must declare `visibleSubjectIds(ctx, ids)`; `findResults` (and so the Admin
  `checkResults`) returns nothing for a subject outside it, and nothing for an unknown subject type or one
  without a rule (fail closed), so stored findings never cross the actor's scope.
  The `order` subject type is registered by `plugin-reservation` (loader, lock `reserve-order:<id>`,
  stages, `info|warn|hold`); its ERP providers by `plugin-erp-integration`. Order callers use
  `OrderChecksService.run`, the only caller of `runChecks` for orders.
- **Admin API.** `checkResults(subjectType, subjectId)` and `checkDefinitions(subjectType?)` need
  `ReadCheckResults` (granted to every role that reads orders, see `docs/access-control.md`); `checkPolicies(subjectType?)` and `updateCheckPolicy(input)` need
  `ManageCheckPolicies`.
