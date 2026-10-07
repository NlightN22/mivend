# Concurrency audit, 2026-10

Scope: price-entry, reservation, sync, acquiring, erp-integration (inbox/outbox/handlers),
counterparty, deferred-payment, customer-pricing, erp-order. Static review only; nothing was run
or fixed. Procedure: `.claude/skills/concurrency-audit/SKILL.md`.

## Must-have

1. HIGH - `packages/plugins/reservation/src/reservation.service.ts:349` (also `:376`, and
   `reservation-expiry.service.ts:67`, `erp-order/src/erp-order.service.ts:89` and `:108`):
   `repo.update(order.id, { customFields: { ...order.customFields, X } })` writes the whole
   embedded customFields object from a snapshot. Any other writer of a different custom field
   (reservationState, erpStatus, erpOrderId, latestFulfillmentState) that committed after the
   snapshot is reverted. Fix: update only the changed column (query builder `.set` of the single
   flattened column, or `jsonb`-style per-field update), or re-read under a row lock.
2. HIGH - `reservation/src/reservation.service.ts:77-90`: the "already reserved" idempotency
   check runs before any lock. Two concurrent `reserveOrder` calls for one order (manual confirm
   plus auto-prepaid on Authorized and Settled) both pass it; the second then counts the first's
   committed reservation in `sumActiveReservations` and either double-reserves or fails with a
   spurious shortfall and `markReservationFailed` sets the order to FAILED. Fix: lock the Order
   row `FOR UPDATE` first, then re-check active reservations under it.
3. HIGH - `price-entry/src/tier-rebalance.service.ts:140-153`: `rebalancePass` reads sibling
   lines in one snapshot and calls `adjustOrderLine(ctx, orderId, line.id, line.quantity)` per
   line in separate transactions. A concurrent quantity change on a sibling committed between the
   snapshot and its adjust is overwritten with the stale quantity. Fix: re-read the line under
   the order row lock inside each adjust, or recompute prices without rewriting quantity.
4. HIGH - `price-entry/src/tier-rebalance.service.ts:152`: `.catch(() => undefined)` hides every
   adjustOrderLine failure (missing relations, price resolution errors); the pass then proceeds
   to `refreshTotals` on inconsistent lines. Fix: log at error level and surface a failed pass.
5. HIGH - `reservation/src/reservation-expiry.service.ts:35-52`: due reservations are read
   without a lock and flipped by `update({ id: In(ids) }, { status: 'expired' })` with no
   `status = 'active'` guard. A release, extension or ERP release that commits between the read
   and the update is overwritten (an extended reservation expires; a released one becomes
   expired and the order state is rewritten). Two overlapping sweeps double-process. Fix: select
   `FOR UPDATE SKIP LOCKED` and add `status = 'active'` to the update.
6. HIGH - `acquiring/src/payment-attempt.service.ts:167-190`: `invoice` is read outside the
   transaction and `invoice.status === 'pending'` from that snapshot decides the unconditional
   `updateStatus(..., 'issued')`. A concurrent captured payment that set the invoice to `paid`
   is regressed to `issued`. The PaymentAttempt amount also comes from the snapshot. Fix: lock
   and re-read the invoice inside the transaction; make the status update conditional.
7. MEDIUM - `acquiring/src/invoice.service.ts:126`: `updateStatusForOrder` rewrites every invoice
   of the order to one status with no current-status condition; can regress `paid` invoices.
   Fix: conditional update (`WHERE status IN (...)`).
8. MEDIUM - `reservation/src/reservation.service.ts:333-381`: `setOrderReservationState` sleeps
   300 ms up to three times in a verify-and-rewrite loop; inside `reserveOrder` this runs while
   StockLevel row locks are held (`:203`), blocking other reservations for about a second, and
   the retry itself rewrites the stale snapshot (finding 1). Fix: move the write after the
   transaction or remove the clobber workaround by not writing from the event ctx.
9. MEDIUM - `reservation/src/reservation.service.ts:200-215`: StockLevel rows are locked in the
   order of order lines and candidate locations. Two orders with the same variants in different
   line order lock in opposite order and deadlock. Fix: sort variant/location pairs and lock in
   ascending id order before computing.
10. MEDIUM - `reservation/src/reservation.service.ts:294-308` (`releaseReservations`) and
    `reservation-write-off-sync.service.ts:248`: read active rows, mutate, `save` with no
    transaction or lock; races `reserveOrder`, expiry and extension. Fix: transaction plus
    conditional update on `status = 'active'`.
11. MEDIUM - `reservation/src/reservation-extension.service.ts:48-55`: `expiresAt` extended from
    the read value and saved; two concurrent extends lose one, and an expiry sweep racing it
    (finding 5) wins silently. Fix: atomic `expiresAt = expiresAt + interval` conditional on
    `status = 'active'`.
12. MEDIUM - `reservation/src/reservation-write-off-sync.service.ts:102` and `:167`: `save(order)`
    of an order loaded without relations after mutating customFields; races the status
    callbacks on the same order (finding 1) and depends on hydration behavior of `save`. Fix:
    targeted column update.
13. MEDIUM - `erp-order/src/erp-order.service.ts:25-67` (`onOrderPlaced`): a post-commit
    subscriber mutates `event.order.customFields` and `save`s the snapshot with `event.ctx`;
    registered on both OrderStateTransitionEvent and OrderPlacedEvent so it runs twice and
    publishes `OrderReadyForErpEvent` twice. A concurrent ERP status callback is overwritten with
    `erpStatus = 'PENDING'`. Fix: re-read, write only the denormalized columns, guard
    `erpStatus` with `IS NULL`, publish once.
14. MEDIUM - `reservation/src/reservation-payment.service.ts:23-50`: `handleOrderPlaced` decides
    on `reservationState` and payments from `event.order` (the snapshot is used whenever
    `order.payments` is defined) and then sets the state. A state set since the event
    (`RESERVED`, `FAILED`) is overwritten. Fix: re-read inside the Order row lock and set the
    state conditionally.
15. MEDIUM - `sync/src/sync.service.ts:78-93`: `claimPendingEntries` returns rows after its
    transaction commits and never flips a status, so `SKIP LOCKED` protects nothing; overlapping
    sweeps (two processes, or a slow batch) publish the same entries twice, and
    `publishEntry` updates without a status guard. Fix: mark `processing` inside the claim
    transaction, or hold the lock through publish.
16. MEDIUM - `erp-integration/src/integration-outbox-processor.service.ts:22-58`: same shape: a
    plain `find({ status: 'pending' })` with no claim; concurrent processors publish duplicates
    and `save(entry)` writes the whole snapshot back. Fix: claim with `FOR UPDATE SKIP LOCKED`
    plus a status flip, conditional update afterwards.
17. MEDIUM - `acquiring/src/inbox.service.ts:110-125` and
    `erp-integration/src/integration-inbox.service.ts:182-212`: `markProcessed` has no status
    guard, and `markFailed` is findOneOrFail then `attempts + 1`. A worker whose claim went stale
    (reclaimed after the stuck threshold) overwrites the newer worker's outcome and loses an
    attempt count. Fix: `UPDATE ... SET attempts = attempts + 1 WHERE id = $1 AND status =
    'processing'`.
18. MEDIUM - `sync/src/order-sync.service.ts:~60-86` (`applyCreate`): the replica is created,
    lines added and `sourceOrderId` set in separate non-transactional steps; a failure after
    `create` and a retry produces a second replica because the idempotency marker is written
    last. Fix: write the marker first or make the whole apply one transaction.
19. MEDIUM - `price-entry/src/granted-discount.service.ts:25-42`: tombstone and upsert both
    read the row, compare versions in application code and `save`; a concurrent upsert and
    remove can resurrect a deleted row or drop a tombstone. Same shape in
    `price-entry/src/discount-registry.service.ts:215-237` (find then save, no unique guard
    visible). Fix: row lock on the erpId or a conditional update on `sourceVersion`.
20. MEDIUM - `counterparty/src/counterparty.service.ts:100-128`, `customer-pricing/src/
    customer-pricing.service.ts:100-115` and `:140-155`: find-then-create/update upserts keyed
    by `erpId`/`customerId`; parallel inbox events for one key can both insert (unique violation
    retried only if the inbox retries) or lose a field. Fix: `INSERT ... ON CONFLICT` or an
    advisory lock per key via `withAggregateLock`.
21. MEDIUM - `erp-integration/src/order-submitted.listener.ts:~190-230`: `order.submitted` is
    written to the outbox from a post-commit subscriber after `reserveOrder` committed; a crash
    between the commit and the outbox write loses the ERP submission permanently (no
    reconciliation of RESERVED orders without an outbox row). Fix: write the outbox row in the
    reservation transaction or add a reconciler.
22. MEDIUM - `price-entry/src/tier-rebalance.service.ts:34-40`: `running`, `pending` and
    `markers` are in-process maps; with the API running on more than one process (or the
    rebalance running on a worker) the coalescing and the `activeOrder` settle wait do not hold.
    Fix: document single-process deployment as a hard constraint or move coordination to the
    database (advisory lock per order).
23. MEDIUM - `acquiring/src/payment-event.listener.ts:60-83`: branch-kassa path enqueues then
    `rejectAsInvalid` in two separate writes; a crash between leaves a pending row with no RRN
    that the worker will process. Fix: validate before enqueue or enqueue as failed atomically.

## Nice-to-have

24. LOW - `counterparty/src/credit-term.service.ts:112-121`: approval decision applied by
    load-modify-save of the Counterparty after `decide` (no shared transaction); a replayed
    decision applies twice harmlessly but is not atomic with the approval status.
25. LOW - `price-entry/src/discount-grant.service.ts:~190-205`: grant creation then
    `markDecided` are separate writes; a double-approve race could create two grants unless
    `decide` is itself exclusive (not verified).
26. LOW - `reservation/src/reservation-expiry.service.ts:93-106`: notifications are created
    inside the sweep transaction; a failure rolls back the expiry of unrelated reservations.
27. LOW - `acquiring/src/settlement-entry.service.ts:~90-110`: partial allocation uses
    `invoice.amount` as the amount owed and ignores earlier allocations; two partial payments can
    over-allocate one invoice (logic, not lock related; found while reading the lock code).
28. LOW - `access-control/src/user-enrichment.service.ts:119-133` and
    `session-management/src/session-login-listener.service.ts:26`: spread-from-snapshot of
    Administrator/Session customFields (outside the audited scope, same pattern as finding 1).
29. LOW - `price-entry/src/tier-rebalance.service.ts:123`: `ctx.copy()` of the event context may
    carry the publisher's transaction manager; not verified.

## Not verified

- Whether `ApprovalRequestService.decide` is exclusive per request (finding 25).
- Whether the unique indexes on `erpId` for counterparty/price-type/granted-discount exist for
  every upsert listed in findings 19 and 20.
- Runtime behavior of findings 2, 5, 6 (no race test exists for them; `reserve-order.
  concurrency.test.ts` covers stock contention between different orders only).
