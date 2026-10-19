# Concurrency rules

Mandatory for any code that reads shared rows and writes derived or updated values back.
Test requirements: `docs/testing-patterns.md` ("Concurrency"). Audit procedure:
`.claude/skills/concurrency-audit/SKILL.md`.

## The problem class

- **Lost update.** Two actors read the same row, both compute from what they read, the second
  write silently overwrites the first.
- **Derived data from a snapshot.** Totals, tiers, statuses or counters recomputed from an
  object read earlier (an `event.order`, a variable carried across an `await`) are stale the
  moment another transaction commits.
- **Post-commit side effects.** An EventBus subscriber runs after the publishing transaction
  committed, concurrently with the next request on the same aggregate. Whatever it writes
  competes with that request.
- **Swallowed errors.** A failing refresh step hidden by `catch {}` or `.catch(() => undefined)`
  turns a deterministic bug into a race that "sometimes works". The tier-rebalance totals bug
  (#188) stayed undiscovered for a long time because of exactly this.

## Rules

### (a) Lock inside a transaction, read under the lock

Any read-compute-write of shared rows takes a lock INSIDE a transaction and performs the read
AFTER the lock is held. A lock taken after the read protects nothing. Use `withAggregateLock`
from `shared` for advisory locks, or `setLock({ mode: 'pessimistic_write' })` (`FOR UPDATE`) on
the row being read.

### (b) Prefer atomic SQL and recompute-from-source

Prefer a single atomic statement (`UPDATE ... SET x = x + $1`, `INSERT ... ON CONFLICT`) or an
idempotent function that recomputes the result from source rows, over patching a stored value
from a snapshot. A recompute that can run twice with the same outcome needs no ordering.

### (c) Optimistic version column where a lock is unsuitable

For long-running or cross-process work, keep a `version` column, update with
`WHERE id = $1 AND version = $2`, and retry a bounded number of times (3-5) with a fresh read.
After the bound, fail loudly; never loop forever and never overwrite.

### (d) Post-commit subscribers re-read inside the lock

An EventBus subscriber must never write from `event.order` (or any event entity snapshot). It
takes the aggregate lock, re-reads the rows it needs inside that transaction, then writes.
Treat the event as a notification of "something changed", not as data.
A `save(event.order)` of the stale entity writes every column that differs from the database, so it reverts a key
another subscriber wrote meanwhile: `ErpOrderService.onOrderPlaced` did exactly that to the reservation state
(#241, proved with a trigger on `order`); a subscriber writes only the keys it owns with `repo.update`.

### (e) Never swallow errors in handlers

An empty `catch`, `.catch(() => undefined)` or `void promise` in a handler, subscriber,
scheduled task or interceptor is a defect unless it is a deliberate best-effort step marked
with `// best-effort: <reason>` (or `// concurrency-reviewed: <reason>`) on the preceding line.
Log failures at error level with the subscriber/handler name. `subscribeAndLog` in
`packages/shared/src/vendure-events.ts` does this for every EventBus subscription (event class
name, handler context and stack); use it instead of `eventBus.ofType(X).subscribe(...)`.
Errors hidden by a catch also hide missing-relation hydration bugs (`order.lines` undefined).

### (f) No SERIALIZABLE isolation by default

The default `READ COMMITTED` plus explicit locks is the project standard. SERIALIZABLE turns
races into retryable aborts that every caller must handle; do not enable it per call or
globally without an agreed design and a retry wrapper.

### (g) Advisory lock or row lock

- **Row lock** (`FOR UPDATE`): the thing you protect is an existing row you read anyway
  (order, reservation, inbox record). The lock lives and dies with that row.
- **Advisory lock** (`withAggregateLock`): the thing you protect does not exist yet (create if
  absent, unique-code generation) or is a set of rows replaced as a unit (delete + insert of
  children keyed by a parent id). The key is a namespace string plus id, e.g.
  `product-photo:<externalId>`; distinct namespaces cannot collide.
- Both are released at transaction end. Never hold either across an external call (HTTP,
  Kafka, file download) unless the work is deliberately serialized per key and documented.

**Lock ordering.** When a unit of work takes more than one lock, take them in a fixed global
order: advisory locks first, then row locks; among rows, ascending primary key; among
namespaces, alphabetical by namespace string. Two paths that take the same locks in different
orders deadlock under load. Prefer a single lock per unit of work.

### (h) Global interceptors/guards that need the Vendure session

`RequestContextService.fromRequest` builds a context WITHOUT a session; `ctx.session` is
undefined there and anything reading `ctx.session.activeOrderId` silently does nothing. Vendure's
own guard keeps the session in its own request context. In a global Nest interceptor or guard,
extract the token (`req.session?.token`, the auth-token header, or a `Bearer` header) and
resolve it with `SessionService.getSessionFromToken(token)`. Reference implementation:
`packages/plugins/price-entry/src/active-order-settle.interceptor.ts`.

### (i) Lease-based claim for long background work

Use it for background work that several workers (processes, the scheduled task and a post-commit drain) may pick
up and that outlasts a short transaction. A transaction, row lock or advisory lock held for the whole work keeps a
pool connection open while the work opens more (see "Connections"), and blocks writers to the claimed rows.

- Claim in one short committed statement: `UPDATE ... SET "claimedUntil" = now() + lease, "claimToken" = $token
  WHERE id IN (SELECT ... WHERE "claimedUntil" IS NULL OR "claimedUntil" < now() ... FOR UPDATE SKIP LOCKED)`.
- Work with no transaction open; extend the lease (heartbeat, filtered by token) after each page and stop when it
  updates nothing: another worker owns the row.
- Finish with a delete fenced by token and version; on failure clear the claim. A re-request resets the claim and
  bumps the version, so it survives the old worker. Handlers must be idempotent: an expired lease means a rerun.
- Tests: two concurrent workers never process one row, an expired lease is picked up, a stale token deletes
  nothing, a re-request during the work survives.
- References: `check_stale_request` (`CheckStaleRequestService`), the inbox `claimBatch` (claim token, released claims).

## Connections

Every DB call runs on the RequestContext's transaction: `connection.getRepository(ctx, Entity)`, raw SQL via
`ctxQuery(connection, ctx, sql, params)` from `shared`, nested work via `connection.withTransaction(ctx, txCtx => ...)`
using only `txCtx`. A second pool connection taken inside a request transaction (`rawConnection`, an injected
`DataSource`, ctx-less `getRepository(Entity)`) reads without the transaction's own writes, can block on a row
the request itself locked, and freezes the server once concurrent requests reach the pool size (#257). Lint rule
`db/no-raw-connection` flags all three outside tests and migrations. It is a safety net, not a guarantee: a
ctx-less `getRepository` is caught only on a receiver named `*connection`, so review still checks it.

- Background code (scheduled tasks, jobs, consumers, inbox/outbox processors, bootstrap) creates a ctx with
  `RequestContextService.create({ apiType: 'admin' })` and works the same way.
- A write that must survive the request's rollback runs on a fresh ctx in its own transaction after (or detached
  from) the request transaction, and the request never awaits it.
- `dbConnectionOptions.extra` sets the pool size (`DB_POOL_SIZE`, default 10) and the acquire timeout
  (`DB_POOL_ACQUIRE_TIMEOUT_MS`, default 15000): an exhausted pool fails a request instead of hanging it.

## Helper

```ts
import { withAggregateLock } from 'shared';

await withAggregateLock(connection, ctx, `product-photo:${externalId}`, async txCtx => {
    const rows = await connection.getRepository(txCtx, ProductPhoto).find({ where: { externalId } });
    // compute and write with txCtx only
});
```

- Runs `connection.withTransaction` (reuses the caller's transaction when `ctx` already has
  one), then `pg_advisory_xact_lock(hashtextextended(key, 0))`, then `work(txCtx)`.
- Always use the `txCtx` passed to `work` for every repository call inside; a repository built
  from the outer `ctx` reads outside the lock.
- Errors from `work` propagate and roll the transaction back.
- Raw `pg_advisory_xact_lock` strings outside the helper are flagged by the
  `mivend/no-raw-advisory-lock` lint rule.

## Review checklist

1. Which shared rows does this change read and then write?
2. Is the lock taken before the read, inside one transaction?
3. Does any value come from an event payload or an object read before an `await`?
4. Can the same code run twice at once for one aggregate? What happens?
5. Does every failure path log at error level or fail the caller?
6. Is there a real-Postgres concurrent-writer test for it?
7. Is a transaction or advisory lock held for the duration of background work? That is a violation; use (i).

**Order row vs advisory locks (#233).** An order-line edit takes `proformaInvoices-for-order:<id>`, then
`reserve-order:<id>`, then the order row (`FOR UPDATE`). Vendure's placement transition (payment mutation) takes the
payment handlers' locks (proforma issuing, credit exposure) and only later updates the order row, so the order is
always proforma, reserve, row. Nothing takes `reserve-order` or `proformaInvoices-for-order` after an order-row write
inside that transaction. Checked: the `OrderProcess` hooks (`contract-order-guard`, `organization-order-guard`,
`freight-order-guard`, `external-order.guard`, `replica-order.guard`) take no advisory lock; the only blocking event
handler is the tier-rebalance marker (no lock); `ReservationPaymentService`, `OrderSubmittedListener` and the check
listeners run from `eventBus.ofType` subscribers, which fire after commit; `TierRebalanceService` takes the order row
and never an advisory lock. The payment handlers (`offline-terms-handler`, `online-stub-handler`) are the only
in-transaction advisory takers and take the proforma lock first.

**Cancel (#231).** Every path into `Cancelled` takes `withOrderCancelLocks` (`shared`: proforma, then reserve) before
any write: `OrderCancellationService.cancel` (customer, staff, reserve expiry), `OrderCancelResultService.apply` and
the ERP `order-changed` inbox, and the Admin API `cancelOrder` override. The `Cancelled` hooks
(`orderCancelReleaseProcess`, `proformaInvoiceCancelProcess`) take the same locks again after core's order save;
`pg_advisory_xact_lock` is reentrant within one transaction, so those are no-ops there. A path that bypasses the entry
points (Dashboard `transitionOrderToState`, hub/branch sync) gets the locks from `orderCancelReleaseProcess`'s
`onTransitionStart`, which runs before core's first order save. A capture (`PaymentAttemptService`) takes the order's
proforma lock before the document rows, so a late capture and a cancel serialize the same way.

