---
name: concurrency-audit
description: Audit code that reads shared rows and writes derived or updated values back (Order/OrderLine/Reservation/Settlement/Inbox/Outbox rows, EventBus subscribers, scheduled tasks, jobs, global interceptors/guards) for lost updates, stale snapshots, swallowed errors and missing race tests, and report findings as must-have vs nice-to-have with file:line evidence. Use after any change that touches those areas, or when asked to "audit concurrency"/"look for lost updates".
---

# Concurrency audit

Rules being audited against: `docs/concurrency.md`. Test requirements:
`docs/testing-patterns.md` ("Concurrency"). Origin: #188, where a post-commit subscriber
recomputed Order totals from a stale snapshot, its error was swallowed, and a global interceptor
silently did nothing because the context it built had no session.

## Step 1 - Discovery

Do not start from the checklist. Build an inventory of every writer to the shared rows in scope:

- EventBus subscribers: `subscribeAndLog`, `registerOutboxProducer`, `registerBlockingEventHandler`.
- Scheduled tasks, job-queue workers, inbox/outbox processors, Kafka/RabbitMQ consumers.
- Resolvers/services that mutate `Order`, `OrderLine`, `Reservation`, settlement/invoice rows,
  inbox/outbox rows, counters, version-compared rows.
- Global Nest interceptors/guards/middleware.
- Grep starters: `\.save(`, `\.update(`, `customFields: \{ \.\.\.`, `findOne` followed by a write,
  `setLock`, `withAggregateLock`, `withTransaction`, `\.catch\(`, `catch \{`, `event\.order`.

For each writer note which process runs it (server, worker, both) and which other writers touch
the same rows. A row with one writer needs far less scrutiny than one with three.

## Step 2 - Checklist

Mark each item PASS / FAIL / N/A per writer, with `file:line`. Verify against the code path, not
comments.

### Must-have (any FAIL is a real lost-update, double-effect or hidden-failure risk)

1. **Read-compute-write without a lock.** A value is read, computed on, and written back with no
   row lock, advisory lock or version check spanning the read and the write.
2. **Lock taken after the read.** The lock exists but the data the computation uses was read
   before it (or outside the transaction).
3. **Derived data from an event snapshot.** A subscriber/handler writes values computed from
   `event.order`, `event.entity` or any object loaded before an `await` instead of re-reading
   under the lock.
4. **Stale object passed across awaits or transactions.** An entity loaded earlier is used for
   `save()` or for `update(id, { customFields: { ...entity.customFields, x } })` (this overwrites
   the whole embedded object with a snapshot).
5. **Post-commit subscriber writing shared rows** without taking the aggregate lock, or racing
   the transaction that published the event (including Vendure's own trailing `save` of its
   in-memory order).
6. **Swallowed errors.** Empty `catch`, `.catch(() => undefined)`, `void promise`, or a catch
   that logs below error level in a handler/subscriber/task. Check what the swallowed step does:
   a hidden failure of a correctness step is must-have, a best-effort cache warmup is not.
7. **Hydration errors hidden by a catch.** A missing-relation error (`order.lines` undefined,
   `taxSummary requires Order.surcharges`) that a catch converts into silent no-op.
8. **Check-then-act on state or uniqueness** (find then insert, status check then update, claim
   by read then write) without a unique constraint, conditional `UPDATE ... WHERE status = ...`,
   or lock.
9. **Claim without exclusion.** Queue/outbox/inbox rows selected for processing without
   `FOR UPDATE SKIP LOCKED` held until the status flip commits, or with an unguarded status
   update afterwards (a late worker overwrites a newer state).
10. **Global interceptor/guard assuming `ctx.session`.** Context from
    `RequestContextService.fromRequest` has no session; it must be resolved via
    `SessionService.getSessionFromToken` (docs/concurrency.md (h)).
11. **No concurrent-writer test** on real Postgres for the read-compute-write path
    (docs/testing-patterns.md "Concurrency"). Sequential calls and mocks do not count.

### Nice-to-have

12. Inconsistent lock ordering between code paths that take several locks (deadlock risk).
13. A lock held across an external call (HTTP, Kafka, file download) without a documented reason.
14. In-memory coordination state (maps, flags, markers) used where more than one process can run
    the code.
15. Retry loops without a bound, sleeps inside a transaction, or notifications sent inside one.
16. SERIALIZABLE isolation used instead of lock + retry.
17. Idempotency of the whole handler under redelivery (second run changes nothing).

## Step 3 - Report format

Flat list, no praise, no narration. Group by severity:

- **Must-have**: `file:line` - one-line defect - interleaving that loses the update (two actors,
  order of steps) - suggested fix (lock, atomic SQL, recompute-from-source, version check).
- **Nice-to-have**: same shape, shorter.
- **Not verified**: items that could not be confirmed from code (needs runtime or a test).

State the writer inventory (Step 1) at the top as a list of file paths, nothing else.

## Verification bar

A fix is verified only by a race/stress test on real Postgres: two connections, a barrier so both
actors have read before either writes (or an `await` inside the lock to force the interleaving),
and an assertion on the final persisted state. Reference: `characteristic-facet.int.test.ts`,
`reserve-order.concurrency.test.ts`, and the e2e cart group (`make e2e-cart`). Mock-only tests
do not close a must-have finding. Run via `make test-int`, never vitest directly.
