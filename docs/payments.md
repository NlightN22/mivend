# Payments and settlements: architecture

This document exists because Vendure's own `Order`/`Payment` model assumes a strict 1:1
relationship — a `Payment` is created against exactly one `Order`, gated by that order's own
state machine. That model cannot represent the real payment lifecycle this project must support:
a customer's payment that doesn't map 1:1 to one order, asynchronous confirmation from a payment
provider or branch till (kassa), refunds and disputes as their own distinct operations, mandatory
54-ФЗ fiscalization that completes on its own timeline, and reflection into 1C's own accounting
register. Trying to force any of this onto a synthetic Vendure `Payment` record was considered
and rejected — see `docs/architecture.md`'s "Order as a read-model" section.

**Status: designed, not yet implemented.** Tracking issue:
[#45](https://github.com/NlightN22/mivend/issues/45).

This is the result of several rounds of review — the design below reflects real corrections made
during that review, not a first draft. Where an earlier, simpler version of this document said
something different, it was wrong; don't resurrect it.

---

## Four independent sources of truth — never conflate them

A single payment touches four different systems, each authoritative for a different fact.
**None of them substitutes for another, and this platform never overwrites one with another.**

1. **The payment provider, branch till (kassa), or bank** — source of truth for the actual state
   of the money operation itself (was it authorized, captured, declined, refunded, disputed).
   The platform never invents this state; it only ever reflects what the provider/kassa reports.
2. **This platform** — source of truth for the _business process_: which order(s) a payment
   relates to, routing between Central/branches, and reliable delivery of the resulting events.
   Not a source of truth for the money movement itself, and not for its accounting reflection.
3. **1C** — source of truth for the _accounting/management reflection_ of a payment, once 1C has
   accepted and posted the corresponding document. Not a source of truth for whether the money
   actually moved (that's fact #1) — 1C can be temporarily unreachable while a payment is, from
   the customer's perspective, already completely done.
4. **ККТ / ОФД (fiscal registrar / fiscal data operator)** — source of truth for the fiscal
   receipt itself, per 54-ФЗ. Independent of both the payment provider's confirmation and 1C's
   posting — a payment can be fully captured and even fully posted to 1C before its fiscal
   receipt exists.

**A payment is not "unconfirmed" just because 1C hasn't answered yet, and it is not "not really
paid" just because its fiscal receipt hasn't arrived yet.** These are three (now four, counting
the money-movement fact itself) separately tracked states, not one combined status:

```
paymentStatus:        pending | authorized | captured | failed | canceled
                       | partiallyRefunded | refunded | disputed | chargeback
erpPostingStatus:      notRequired | pending | accepted | rejected | retrying
                       | reconciliationRequired
fiscalizationStatus:   notRequired | pending | succeeded | failed
```

`paymentStatus` is owned by fact #1 (the provider/kassa report). `erpPostingStatus` is owned by
the platform↔1C exchange (fact #3). `fiscalizationStatus` is owned by the ККТ/ОФД (fact #4). A
payment can legitimately be `captured` + `erpPostingStatus: pending` + `fiscalizationStatus:
pending` all at once, for a while — that's normal, not a defect.

---

## Refunds, cancellations, and disputes are three different operations

All three are real and must be supported for both channels (online acquiring **and** branch
kassa) — an earlier version of this document wrongly assumed refunds were unlikely for online
payments; they are a completely normal, provider-supported operation (ЮKassa, Stripe, Adyen all
support full and partial refunds). They are not variations of the same thing:

- **Cancellation** (`payment.cancelled`) — applies when the money was never actually finally
  captured (e.g. an authorization that's voided before settlement). Nothing to reverse
  financially; the attempt simply never completed.
- **Refund** (`refund.created` → `refund.succeeded`/`refund.failed`) — applies **after** a
  completed capture. **A refund is its own entity** — its own id, amount, status, and a reference
  to the original payment. Never a negative payment record, never a mutation of the original
  payment's amount/status.
- **Dispute / chargeback** (`dispute.opened` → `dispute.won`/`dispute.lost`,
  `chargeback.created`/`chargeback.reversed`) — a **separate process entirely**, initiated by the
  cardholder, their bank, or the payment network — not by any action this platform or the
  merchant took. Arrives asynchronously via provider webhooks, same transport as everything else,
  but must not be folded into the refund lifecycle — it has its own states and its own resolution
  path (a dispute can be won, reversing the chargeback).

Refunds cap at the originally captured amount — providers like Adyen enforce this themselves;
the platform should validate the same invariant locally rather than relying solely on the
provider to reject an over-refund (see `REFUND_EXCEEDS_CAPTURED_AMOUNT` below).

---

## Fiscalization (54-ФЗ) applies to both channels, and is asynchronous

An online card payment from an individual in Russia normally still requires a fiscal (ККТ)
receipt — accepting payment online does not exempt the seller from fiscalization. A separate or
cloud ККТ is commonly used for internet payments, with the receipt delivered to the buyer
electronically. (Since 2025-09-01, an online-sale flag, site address, and buyer contact are
additionally required on the electronic receipt for internet settlements.) **This means
`branch-kassa` and `online-acquiring` are not treated differently for fiscalization purposes —
both may require it, per 54-ФЗ, depending on the operation.**

Fiscalization is a **separate, asynchronous process**, not a field on the payment event itself:

```
payment.captured
    ↓
fiscalization.pending
    ↓
receipt.fiscalized
```

A payment can be successfully captured while its cloud ККТ/ОФД hasn't yet returned the receipt
number. Modeled as its own entity, not embedded fields on `Payment`:

```
FiscalReceipt:
    receiptId
    paymentId
    fiscalDocumentNumber   -- nullable
    fiscalSign             -- nullable
    fiscalDriveNumber
    registrationNumber
    receiptType
    fiscalizedAt
    fiscalizationStatus:   notRequired | pending | succeeded | failed
```

`fiscalDocumentNumber`/`fiscalSign` are **nullable at the schema level** — they simply don't
exist yet while fiscalization is `pending`. The real constraint is a **business invariant**,
checked at the point a payment is asserted "fully processed," not a `NOT NULL` column:

```
if fiscalizationRequired
   and fiscalizationStatus == succeeded
then fiscalDocumentNumber and fiscalSign must not be null
```

(`fiscalReceiptId`, if used at all, is this platform's/the ККТ provider's/the ОФД's own internal
identifier — not itself a mandated 54-ФЗ requisite. The receipt's actual mandated requisites are
things like the fiscal document number and fiscal sign; the exact full set depends on the fiscal
document format and settlement type — verify against the specific ККТ/ОФД integration's docs
when building this, don't assume this document's list is exhaustive.)

---

## Idempotency: three independent levels, not one correlation id

A single correlation id is not enough — three distinct, real failure modes each need their own
guard.

### 1. Command idempotency (outbound: this platform → provider / kassa / 1C)

Every command this platform issues carries a stable key, scoped to the **operation**, not the
order (one order can have several payments and several partial refunds):

```
payment:{paymentId}:capture
refund:{refundId}:create
cash-payment:{paymentId}:register
erp-posting:{paymentId}:{postingVersion}
```

Re-sending the same command with the same key must return the original result, not re-execute —
this is the officially recommended pattern from Stripe, Adyen, and ЮKassa alike. Store
`(caller_id, idempotency_key) → request_hash, response, status`; the same key with a _different_
payload is a hard conflict (409), never silently accepted.

### 2. Inbound event deduplication (webhooks, ERP callbacks)

Webhooks and ERP callbacks can and do arrive more than once. Store every processed event by its
own identity before acting on it:

```
UNIQUE(provider, providerEventId)
```

alongside `payloadHash` and `processedAt` — this is the **inbox** half of inbox/outbox.

### 3. Business-level uniqueness

The same real-world fact can sometimes arrive as more than one distinct provider event (e.g. a
retried webhook with a new `providerEventId` for the same underlying operation) — event-id
dedup alone isn't sufficient. A second, business-level uniqueness constraint:

```
(providerPaymentId, operationType, providerOperationId)
```

### Reliable delivery to 1C: transactional outbox, same as everywhere else in this codebase

Recording the local payment fact and creating the outbound event for 1C happen in **one local
transaction** — this is not a new pattern, it's AGENTS.md sync rule #1 (outbox is mandatory)
applied to payments specifically:

```sql
BEGIN;
UPDATE payment ...;
INSERT INTO sync_outbox ...;
COMMIT;
```

A separate process delivers the outbox entry to 1C with retries (the existing `OutboxWorker`).
Outbox delivery is at-least-once, never exactly-once — the receiving side (1C, or this
platform's own consumers) must be idempotent regardless, per sync rule #2. This is exactly why
level 1 (command idempotency) matters even with a reliable outbox: the outbox can redeliver.

---

## Entities

- **`PaymentAttempt`** (the platform's own record of a payment) — `paymentId`, `channel`
  (`online-acquiring` | `branch-kassa` | `bank-transfer-1c`), `orderId` (nullable — a lump
  payment may not be allocated to an order yet, see `docs/payments.md`'s earlier "cash
  application" discussion, unchanged by this revision), `amount`, `currencyCode` (was missing
  from the original `payment.recorded` payload — add it; don't assume a single implicit
  currency), `providerPaymentId`, `paymentStatus`, `erpPostingStatus`.
- **`FiscalReceipt`** — see above. One-to-one (or one-to-few, for partial captures) with a
  `PaymentAttempt`.
- **`Refund`** — `refundId`, `paymentId`, `amount`, `status`, `providerRefundId`, `reason`. Its
  own entity, never a mutation of `PaymentAttempt`.
- **`Dispute`** — `disputeId`, `paymentId`, `type` (`dispute` | `chargeback`), `status`
  (`opened`/`won`/`lost`/`reversed`), `amount`, `openedAt`. Its own lifecycle, not folded into
  `Refund`.
- **`SettlementEntry`** — unchanged in spirit from the earlier design: an append-only,
  per-counterparty ledger row (not per-order), the local provisional reflection of a movement
  (`sourceType`: `payment.captured` | `refund.succeeded` | `chargeback.created` | `order.created`
  | `erp-reconciliation`), `reconciled: boolean`. **Never mutate or delete a row** — corrections
  are offsetting entries, same accounting-ledger discipline as before.
- **`PaymentReconciliationIssue`** — raised, never silently auto-resolved, whenever something
  doesn't cleanly match:

    ```
    issueType: DUPLICATE_OPERATION | AMOUNT_MISMATCH | CURRENCY_MISMATCH | ORDER_MISMATCH
             | ERP_DOCUMENT_MISSING | PLATFORM_PAYMENT_MISSING | UNKNOWN_PROVIDER_OPERATION
             | INVALID_STATE_TRANSITION | REFUND_EXCEEDS_CAPTURED_AMOUNT
    paymentId, providerPaymentId, erpDocumentId
    expectedAmount, actualAmount, expectedCurrency, actualCurrency
    detectedAt, status, resolution
    ```

    This is the same "escalate to a human, never guess" convention already used throughout
    `plugin-approval-workflow` — a mismatch is surfaced for someone to look at, not resolved by
    picking whichever system's number looks more plausible.

---

## Flow: online payment (Central)

```
1.  Platform creates PaymentAttempt, generates operationId.
2.  Platform calls the provider with an idempotencyKey (level 1 above).
3.  Provider returns a preliminary result — NOT treated as final.
4.  Provider sends a webhook — this is the authoritative confirmation.
5.  Platform stores the webhook in its inbox (level 2 dedup) before acting on it.
6.  Platform updates paymentStatus from the webhook.
7.  Same local transaction: append a SettlementEntry (provisional) + write the 1C-bound
    outbox event.
8.  If fiscalization applies, fiscalizationStatus starts `pending` independently — does not
    block steps 7/9.
9.  Central delivers the outbox event to 1C (a new ErpAdapter.pushPayment(...), mirroring the
    existing pushOrder(order): Promise<ErpOrderRef> shape already in
    packages/plugins/sync/src/erp-adapter.interface.ts).
10. 1C idempotently creates/updates its own document, returns an acknowledgement + document id.
11. Platform sets erpPostingStatus = accepted, marks the matching SettlementEntry reconciled.
12. Any mismatch anywhere in this chain (amount, currency, order, duplicate, missing
    counterpart) → a PaymentReconciliationIssue, not a silent overwrite.
```

Treating the provider's synchronous HTTP response as final (skipping the webhook wait) is a
common mistake this design deliberately avoids — asynchronous confirmation via webhook is the
standard, documented pattern for essentially every major provider.

## Flow: branch till (kassa) payment

```
Branch:
    - performs the kassa/ККТ operation, gets the fiscal confirmation (or a pending state,
      per the async fiscalization note above)
    - stores its own local PaymentAttempt + FiscalReceipt reference
    - publishes payment.recorded (existing mechanism, see docs/architecture.md) to Central

Central:
    - registers the payment, links it to the real order if Central owns it, or applies it as
      an informational projection if it only holds a replica (existing rule, unchanged)
    - pushes the fact to 1C via ErpAdapter.pushPayment (same as the online flow, step 9-11)

1C:
    - idempotently creates/updates its own cash/payment document
    - returns an acknowledgement + document id
```

**The fiscal fact itself is still owned by the kassa server / ККТ / ОФД, never by this
platform** — the platform stores its confirmation (`FiscalReceipt`), it does not generate or
assert the fiscal state on its own authority.

---

## Collision management: why it's needed even with one writer per channel

Business-level duplicate entry is genuinely unlikely when each channel has exactly one owner
(kassa integrated with the platform ⇒ not also entered in 1C by hand; online payment gateway
integrated with the platform ⇒ same; bank statements entered directly in 1C only, for now). **But
collision management is still required — not because of multiple sources per channel, but
because of distributed delivery and uncertain outcomes**, all of which are real and will happen:

- the same message delivered more than once
- a timeout with a genuinely unknown outcome (did the call succeed before the connection died?)
- a webhook arriving before the API response that supposedly triggered it
- events arriving out of order
- a refund event arriving before its original payment's confirmation
- 1C accepted the posting, but the acknowledgement was lost in transit
- a staff member double-clicking "pay"
- a branch reconnecting after an outage and resending its accumulated operations
- a document in 1C edited or deleted by an accountant after import
- an amount or order mismatch between the platform's record and 1C's

This is exactly why the three idempotency levels above, the inbox/outbox pattern, and
`PaymentReconciliationIssue` all exist — they solve _distributed-systems_ uncertainty, not a
multi-source-of-truth problem. Both matter; they're just different problems with different fixes.

---

## What this explicitly does not solve (out of scope here)

- **Cash-application / allocation strategy** (which order(s) an unallocated lump payment
  covers) — still an open product decision (automatic FIFO vs. manual staff allocation vs.
  hybrid), unchanged from the earlier revision of this document.
- **The actual `erp-import`/`ErpAdapter` payload shape for `pushPayment`/`pushRefund`** and 1C's
  own idempotent-posting behavior — needs a look at 1C's real integration surface before
  committing to an exact contract.
- **Which ККТ/ОФД integration** (own cloud ККТ, a third-party fiscalization service, etc.) —
  a separate, purely operational decision, orthogonal to this design.
- **Real branch kassa hardware integration** — `recordWitnessedPayment` remains a placeholder
  admin mutation until real hardware/kassa-server integration exists.
