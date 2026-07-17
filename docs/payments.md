# Payments and settlements: architecture

This document exists because Vendure's own `Order`/`Payment` model assumes a strict 1:1
relationship — a `Payment` is created against exactly one `Order`, gated by that order's own
state machine. That model cannot represent the real payment lifecycle this project must support:
a customer's payment that doesn't map 1:1 to one order, asynchronous confirmation from a payment
provider or branch till (kassa), refunds and disputes as their own distinct operations, mandatory
fiscal-receipt compliance that completes on its own timeline, and reflection into the ERP's own
accounting register. Trying to force any of this onto a synthetic Vendure `Payment` record was
considered and rejected — see `docs/architecture.md`'s "Order as a read-model" section.

**Status: designed, mostly decided. A few items remain genuinely open — see the last section.**
Tracking issue: [#45](https://github.com/NlightN22/mivend/issues/45).

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
3. **The ERP** — source of truth for the _accounting/management reflection_ of a payment, once
   it has accepted and posted the corresponding document. Not a source of truth for whether the
   money actually moved (that's fact #1) — the ERP can be temporarily unreachable while a
   payment is, from the customer's perspective, already completely done.
4. **Fiscal registrar / fiscal data operator** (see "Fiscalization" below) — source of truth for
   the fiscal receipt itself. Independent of both the payment provider's confirmation and the
   ERP's posting — a payment can be fully captured and even fully posted to the ERP before its
   fiscal receipt exists.

**A payment is not "unconfirmed" just because the ERP hasn't answered yet, and it is not "not
really paid" just because its fiscal receipt hasn't arrived yet.** These are three (now four,
counting the money-movement fact itself) separately tracked states, not one combined status:

```
paymentStatus:        pending | authorized | captured | failed | canceled
                       | partiallyRefunded | refunded | disputed | chargeback
erpPostingStatus:      notRequired | pending | accepted | rejected | retrying
                       | reconciliationRequired
fiscalizationStatus:   notRequired | pending | succeeded | failed
```

`paymentStatus` is owned by fact #1 (the provider/kassa report). `erpPostingStatus` is owned by
the platform↔ERP exchange (fact #3). `fiscalizationStatus` is owned by the fiscal
registrar/operator (fact #4). A payment can legitimately be `captured` + `erpPostingStatus:
pending` + `fiscalizationStatus: pending` all at once, for a while — that's normal, not a
defect.

---

## Refunds, cancellations, and disputes are three different operations

All three are real and must be supported for both channels (online acquiring **and** branch
kassa) — an earlier version of this document wrongly assumed refunds were unlikely for online
payments; they are a completely normal, provider-supported operation. They are not variations of
the same thing:

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

Refunds cap at the originally captured amount — providers commonly enforce this themselves; the
platform should validate the same invariant locally rather than relying solely on the provider to
reject an over-refund (see `REFUND_EXCEEDS_CAPTURED_AMOUNT` below).

---

## Fiscalization applies to both channels, and is asynchronous

An online card payment from an individual normally still requires a fiscal receipt — accepting
payment online does not exempt the seller from fiscal-receipt compliance (a separate or cloud
fiscal registrar is commonly used for internet payments, with the receipt delivered to the buyer
electronically). **`branch-kassa` and `online-acquiring` are not treated differently for
fiscalization purposes — both may require it, depending on the operation and current regulatory
requirements.**

Fiscalization is a **separate, asynchronous process**, not a field on the payment event itself:

```
payment.captured
    ↓
fiscalization.pending
    ↓
receipt.fiscalized
```

A payment can be successfully captured while its fiscal registrar/operator hasn't yet returned
the receipt number. Modeled as its own entity, not embedded fields on `Payment`:

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

### `FiscalizationAdapter` — the actual registrar/operator choice stays unplugged

**Which fiscal registrar/operator this project uses is a separate, still-open operational
decision** (a branch-local device, a kassa server, a cloud registrar, a third-party
fiscalization service, or something else) — see "Open questions" below. The payment architecture
must not depend on that choice. It's isolated behind an interface, the same shape as `ErpAdapter`
(`packages/plugins/sync/src/erp-adapter.interface.ts`):

```ts
interface FiscalizationAdapter {
    registerReceipt(payment: PaymentAttempt): Promise<FiscalReceiptRef>; // may resolve pending
    getReceiptStatus(receiptId: string): Promise<FiscalReceipt>;
}
```

The exact fields it needs, how it's polled vs. pushed a result, and which provider implements it
are all decided once the registrar/operator choice is made — not before. `FiscalReceipt`'s own
schema above is provider-agnostic; adapter implementations translate to/from it.

---

## Idempotency: three independent levels, not one correlation id

A single correlation id is not enough — three distinct, real failure modes each need their own
guard.

### 1. Command idempotency (outbound: this platform → provider / kassa / ERP)

Every command this platform issues carries a stable key, scoped to the **operation**, not the
order (one order can have several payments and several partial refunds):

```
payment:{paymentId}:capture
refund:{refundId}:create
cash-payment:{paymentId}:register
erp-posting:{paymentId}:{postingVersion}
```

Re-sending the same command with the same key must return the original result, not re-execute —
this is the officially recommended pattern from major payment providers. Store `(caller_id,
idempotency_key) → request_hash, response, status`; the same key with a _different_ payload is a
hard conflict (409), never silently accepted.

### 2. Inbound event deduplication (webhooks, ERP callbacks)

Webhooks and ERP callbacks can and do arrive more than once. Store every processed event by its
own identity before acting on it:

```
UNIQUE(provider, providerEventId)
```

alongside `payloadHash` and `processedAt` — this is the **inbox** half of inbox/outbox.

**Implemented** (`plugin-acquiring`) as `IncomingPaymentEvent` (`entities/incoming-payment-event.entity.ts`):
a real per-row lifecycle (`pending` → `processing` → `processed` | `failed`), not a bare "seen"
boolean — see AGENTS.md sync rule #12, the general anti-pattern this design exists to avoid.
`InboxService.enqueue()` is the only write path in (dedups on `(provider, providerEventId)`,
falls back to catching the unique-index violation on a concurrent-enqueue race); `claimBatch()` /
`markProcessed()` / `markFailed()` are used exclusively by `PaymentInboxProcessorService`'s sweep.
An event that keeps failing is dead-lettered (`status: 'failed'`, terminal) after `MAX_ATTEMPTS =
5` sweeps — surfaced for manual inspection, never retried forever, per sync rule #4.

`PaymentInboxWorker` (BullMQ `Queue`/`Worker` + `upsertJobScheduler`, mirroring
`ReservationExpiryWorker`/`OutboxWorker` — this codebase's established periodic-worker shape, not
`@nestjs/schedule` or Vendure's `JobQueueService`) sweeps every `paymentInboxPollIntervalMs`
(`AcquiringPluginOptions`, default `PAYMENT_INBOX_POLL_INTERVAL_DEFAULT` = 60s) and calls
`PaymentInboxProcessorService.processPendingEvents()`, which is where the actual, risky
processing (`PaymentAttemptService.payInvoice`) happens — never inline in whatever received the
event. An ops-only admin mutation, `triggerPaymentInboxSweep` (`invoice.resolver.ts`), runs the
exact same `processPendingEvents()` path on demand — a "run the sweep now" tool, not a bypass of
the async contract.

**Producers** (who calls `enqueue()`, i.e. who is `provider`):

- `provider: 'erp'` — `POST /erp/callback/payment` (`plugin-sync`'s `ErpCallbackController`,
  body typed as `ErpPaymentReportedDto` with Swagger docs at `/api-docs`, for 1C developers to
  implement against) publishes `ErpPaymentReportedEvent` on the `EventBus`; `plugin-acquiring`'s
  `PaymentEventListener` subscribes and enqueues with `providerEventId = erpEventId` (the ERP's
  own id for the payment fact — a resend is a safe no-op). Also the simulation entry point until
  a real ERP integration exists.
- `provider: 'branch-kassa'` — no separate transport: a branch's existing `payment.recorded`
  outbox event (see "Flow: branch till (kassa) payment" below) carries optional `invoiceId`/
  `outcome` fields; Central's `CentralConsumer.handlePaymentRecorded` publishes
  `BranchKassaPaymentEvent` (`providerEventId = ` the sync envelope's own `eventId`) once it has
  applied the payment fact locally, and the same `PaymentEventListener` enqueues it.

Both events carry a `RequestContext` (`event.ctx`) rather than the listener re-deriving one, and
both event classes live in `plugin-sync` (`erp-payment.events.ts`) — `plugin-acquiring` imports
them from `plugin-sync`'s public `index.ts` only, never `plugin-sync/src/...` directly. The
listener itself (`payment-event.listener.ts`) only ever calls `inboxService.enqueue(...)` — it
must never call `payInvoice` directly; that would silently reintroduce the exact rule-#12
anti-pattern this whole design exists to prevent.

Note: `online-acquiring` does **not** go through this inbox today — `onlineStubPaymentHandler`
calls `payInvoice` synchronously at checkout time, which is itself an instance of the rule-#12
anti-pattern, accepted for now only because there is no real acquirer webhook yet (see "Flow:
online payment" below). Once Robokassa is integrated, its webhook must be routed through this
same inbox, not left as a synchronous checkout-time call.

### 3. Business-level uniqueness

The same real-world fact can sometimes arrive as more than one distinct provider event (e.g. a
retried webhook with a new `providerEventId` for the same underlying operation) — event-id
dedup alone isn't sufficient. A second, business-level uniqueness constraint:

```
(providerPaymentId, operationType, providerOperationId)
```

### Reliable delivery to the ERP: transactional outbox, same as everywhere else in this codebase

Recording the local payment fact and creating the outbound event for the ERP happen in **one
local transaction** — this is not a new pattern, it's AGENTS.md sync rule #1 (outbox is
mandatory) applied to payments specifically:

```sql
BEGIN;
UPDATE payment ...;
INSERT INTO sync_outbox ...;
COMMIT;
```

A separate process delivers the outbox entry to the ERP with retries (the existing
`OutboxWorker`). Outbox delivery is at-least-once, never exactly-once — the receiving side (the
ERP, or this platform's own consumers) must be idempotent regardless, per sync rule #2. This is
exactly why level 1 (command idempotency) matters even with a reliable outbox: the outbox can
redeliver.

---

## Entities

- **`Invoice`** (new — see "Organizations" below) — one per our organization within an aggregate
  `Order`: `orderId`, `organizationId` (references `OrganizationRequisites`, `plugin-documents`),
  `counterpartyId`, `amount`, `currencyCode`, `status`
  (`pending`/`issued`/`paid`/`cancelled`). The object a payment actually settles — not `Order`
  directly, once real splitting is wired.
- **`PaymentAttempt`** (the platform's own record of a payment) — `paymentId`, `channel`
  (`online-acquiring` | `branch-kassa` | `bank-transfer-erp`), `invoiceId` (which `Invoice` — and
  therefore which of our organizations — this payment settles; nullable today, see "Organizations"
  below), `orderId` (nullable — a lump payment may not be allocated to an order yet, see "Cash
  application" below), `amount`, `currencyCode` (was missing from the original `payment.recorded`
  payload — add it; don't assume a single implicit currency), `providerPaymentId`,
  `paymentStatus`, `erpPostingStatus`.
- **`FiscalReceipt`** — see above. One-to-one (or one-to-few, for partial captures) with a
  `PaymentAttempt`.
- **`PaymentRefund`** (named `PaymentRefund`, not `Refund` — `@vendure/core` already registers its
  own `Refund` entity tied 1:1 to a Vendure `Payment`, and two entities sharing a class name
  crashes bootstrap with `error.entity-name-conflict` regardless of which plugin they come from)
  — `refundId`, `paymentId`, `amount`, `status`, `providerRefundId`, `reason`. Its own entity,
  never a mutation of `PaymentAttempt`.
- **`Dispute`** — `disputeId`, `paymentId`, `type` (`dispute` | `chargeback`), `status`
  (`opened`/`won`/`lost`/`reversed`), `amount`, `openedAt`. Its own lifecycle, not folded into
  `PaymentRefund`.
- **`SettlementEntry`** — an append-only, per-counterparty **and per-organization** ledger row
  (not per-order — see "Organizations" below for why organization is a required second axis, not
  optional), referencing `invoiceId`, the local provisional reflection of a movement
  (`sourceType`: `payment.captured` | `refund.succeeded` | `chargeback.created` | `order.created` |
  `erp-reconciliation`), `reconciled: boolean`, plus `allocatedOrderId`/`allocationAmount` (see
  "Cash application" — one `SettlementEntry` can spawn several allocation rows if a single payment
  covers several orders). **Never mutate or delete a row** — corrections are offsetting entries,
  same accounting-ledger discipline as before.
- **`PaymentReconciliationIssue`** — raised, never silently auto-resolved, whenever something
  doesn't cleanly match:

    ```
    issueType: DUPLICATE_OPERATION | AMOUNT_MISMATCH | CURRENCY_MISMATCH | ORDER_MISMATCH
             | ORGANIZATION_MISMATCH | ERP_DOCUMENT_MISSING | PLATFORM_PAYMENT_MISSING
             | UNKNOWN_PROVIDER_OPERATION | INVALID_STATE_TRANSITION
             | REFUND_EXCEEDS_CAPTURED_AMOUNT
    paymentId, invoiceId, providerPaymentId, erpDocumentId
    expectedAmount, actualAmount, expectedCurrency, actualCurrency
    detectedAt, status, resolution
    ```

    This is the same "escalate to a human, never guess" convention already used throughout
    `plugin-approval-workflow` — a mismatch is surfaced for someone to look at, not resolved by
    picking whichever system's number looks more plausible.

---

## Cash application and payment allocation (decided)

**Automatic hybrid model: explicit reference first, then FIFO.** Manual allocation is not the
primary process — it exists only as a correction path.

- **If a payment was created against a specific order:**
    1. That order is settled first, up to its outstanding amount.
    2. Any amount beyond that order's remaining balance is automatically distributed across the
       counterparty's other open obligations, oldest first (FIFO).
    3. Whatever still can't be allocated is recorded as an advance (a credit sitting on the
       counterparty, not forced onto any order).
- **If a payment has no order reference at all:**
    1. The full amount is distributed across the counterparty's open obligations, FIFO.
    2. Any unallocated remainder is recorded as an advance, same as above.
- A user with the right permission can manually re-associate an already-recorded payment (in
  whole or in part) to different orders. **Re-allocation never changes the original payment
  fact** — it only changes how the existing, immutable amount is distributed across settlement
  objects. This is a deliberate consequence of `SettlementEntry` being append-only (see above):
  re-allocation adds new allocation rows, it never edits the original `payment.captured` entry.

This matches how ERP systems commonly model mutual settlements against counterparties by
settlement document: an amount allocated against a specific sale/invoice counts as settled; the
remainder sitting on the payment document itself counts as an advance; one payment can be split
across several settlement-object lines. `SettlementEntry`'s allocation rows are the platform-side
mirror of that same shape — this is what lets ERP reconciliation match cleanly (see below) rather
than requiring a translation layer between two different allocation models.

---

## Organizations (our own legal entities) — a payment cannot be captured without this

`OrganizationRequisites` (`plugin-documents`) already models one of **our own** legal entities
(the seller side — requisites/bank details for document rendering), sourced from the ERP. Today
it's used for exactly one purpose: `DocumentsService.getActiveRequisites()` picks "the" single
active organization for PDF templates. **Nothing else in the platform is organization-aware** —
`Order` itself carries no `organizationId`. This project genuinely has several such organizations:
which one owns a given product/SKU is driven by warehouse address-based storage (one storage
location = one product = one organization — a deliberate constraint for scanning marked-goods
unit/package codes cleanly, not an accident; this is a stricter instance of the generally
recommended "bind marked goods to specific storage cells/batches" practice, not an anti-pattern).
So **one storefront checkout can legitimately span several of our organizations** — e.g. 3 order
lines, 3 organizations, 3 invoices, 3 payments.

**This is not optional and not deferrable to "after payment."** A split-payment acquirer (the
correct primitive here — see below) requires the full recipient/amount breakdown **at
payment-creation time**, before the customer pays, with no documented way to add or restructure
recipients afterward (confirmed against ЮKassa's split-payments API: the `transfers` array — which
organization gets how much — is a required parameter of the payment-creation request itself; only
already-listed transfers' amounts can be adjusted later, during two-stage capture). So an online
payment cannot be requested until the order's organization split is already known — waiting for an
async ERP acknowledgement is not compatible with this.

**Decided direction:**

- **`Invoice`** (new entity, `plugin-acquiring`) — one aggregate `Order` splits into one `Invoice`
  per organization it touches: `orderId`, `organizationId`, `counterpartyId`, `amount`,
  `currencyCode`, `status`. `PaymentAttempt`/`SettlementEntry`/`PaymentReconciliationIssue`
  reference `invoiceId` (nullable today — see "Not yet designed" below), not a bare
  `organizationId` — `Invoice` is the single source of truth for which organization a payment
  belongs to.
- The organization-per-product mapping (today only known inside 1C's warehouse/storage-location
  data) is imported into the platform as **catalog master data**, the same way `PriceEntry` is
  (AGENTS.md sync rule #7 — ERP is master; the platform holds a local read replica so checkout
  doesn't need a synchronous round-trip to 1C): `ProductVariant.customFields.organizationId`, set
  by `erp-import`'s product record. `OrderLine.customFields.organizationId` is derived from it at
  add-to-cart time.
- **Split mechanism (decided): lightweight `customFields`, not Vendure's full `Seller`/`Channel`
  marketplace machinery.** Vendure's own multi-vendor primitives (`Seller`, one `Channel` per
  seller, `OrderSellerStrategy.setOrderLineSellerChannel()`/`.splitOrder()` — see
  `docs.vendure.io/guides/how-to/multi-vendor-marketplaces`) are the right reference shape
  conceptually ("tag each `OrderLine` with an owner at add-to-cart time, split the aggregate
  `Order` into per-owner orders at the payment step") but real overkill for our own legal
  entities today (per-channel pricing, `ShippingLineAssignmentStrategy`, separate admin
  logins/stock locations — none of which apply here). Deliberately chosen so the migration path
  to real `Seller`/`Channel` stays open later without a rewrite — there's real potential demand
  for external sellers using this platform, tracked as a deferred, low-priority idea:
  [#47](https://github.com/NlightN22/mivend/issues/47).
- **Split-payment acquirer (decided): Robokassa.** ЮKassa "Сплитование платежей" and Т-Банк
  "Мультирасчёты" are the same category of product and were considered, but Robokassa is the
  integration target for `plugin-acquiring`'s online-acquiring flow.
- **Bootstrapping without a real 1C export**: don't wait for 1C to actually expose
  `organizationId` per storage location — 3 synthetic organizations are seeded directly
  (`OrganizationRequisites` via `make seed`) and `erp-import`'s product record carries an
  `organizationId` field now, so the real split can be built and exercised end-to-end today. Swap
  in the real 1C export later without changing the platform-side contract shape.
- **Enforcement (decided): a hard requirement gated by an admin-controlled toggle, not a silent
  fallback.** `GlobalSettings.customFields.organizationSplitEnabled` (boolean, defaults `true`,
  shows up automatically in Admin UI's Settings screen since it's a `GlobalSettings` customField)
  — while on: `erp-import`'s `ProductHandler` **rejects** any product record with no
  `organizationId` (a real import error, not `null`); `onlineStubPaymentHandler` (the
  stand-in payment handler used until Robokassa is integrated) **fails the payment** if the split
  can't be computed, rather than silently falling back to a single unsplit payment. There is no
  "grandfathered" exemption — every product must carry a real organization once the toggle is on.
  `make seed` explicitly turns the toggle on (`ensureOrganizationSplitEnabled` in
  `seed-erp.mjs`) before seeding any products. **Known gap**: `packages/e2e/fixtures/seed.ts`'s
  product fixtures don't carry `organizationId` yet — e2e runs against the same dev stack `make
seed` configures, so those fixtures will now fail import unless updated; not yet fixed, flagged
  here rather than silently left broken.

**Counterparty-side note (does not need modeling yet):** a counterparty can itself belong to a
"holding" grouping in 1C, but that's purely an analytical tag — one `Counterparty` is always
exactly one legal entity on the buyer side. Not a design gap; no action needed here.

**Deferred (decided to postpone, not blocking online payment):**

- Per-organization `creditLimit`/`paymentDelayDays` on `Counterparty`, or contracts/agreements
  (`TODO.md`: "Добавить организации и лимиты в разрезе организаций. Добавить договоры и лимиты в
  разрезе договоров.") — touches `plugin-counterparty`, `plugin-erp-order`, order creation,
  credit-terms approval, and the manager portal's finance views. `Invoice`/`SettlementEntry`
  already carry `organizationId`, which is enough for correct payment allocation without this.
  UI direction for when it does land: aggregate totals in dashboard KPI tiles, per-organization
  breakdown lower on the page/in tabs —
  [#48](https://github.com/NlightN22/mivend/issues/48) (needs a real design pass later).
- Refund/dispute/document (invoice PDF) generation per-`Invoice` rather than per-`Order`.
- Cash-application FIFO ("open obligations") must, once wired, scope by
  **`(counterpartyId, organizationId)` together** — a debt owed to organization A must never be
  silently offset by a payment made to organization B.

---

## `pushPayment` / `pushRefund` contract (business semantics decided, transport TBD)

The exact wire payload for `pushPayment`/`pushRefund` is **not** fixed at this stage — it depends
on the real ERP integration surface, not yet fully explored. What **is** fixed is the required
business semantics any transport must carry:

- a platform-side unique operation id
- operation type: `payment` | `refund`
- payment channel
- legal entity (organization)
- counterparty
- contract/agreement reference
- amount
- currency
- operation date/time
- for a refund: a reference to the original payment
- target order, or a list of allocations, if already known at push time
- unallocated remainder, if any
- external id from the payment provider or kassa server
- idempotency key
- correlation id

The ERP side of this integration must, in turn:

- create a standard payment or refund document (not raw register movements)
- post it through the configuration's normal posting mechanism
- let that posting generate the standard register movements — **never write movements directly**
- not create a duplicate document when the same idempotency key is received again
- return the original result when the same operation is redelivered
- return a conflict error if the same idempotency key arrives with different data
- return the created ERP document's id and posting result

The exact method names, field names, and wire format are decided by whoever implements this,
once the real ERP integration interface is chosen — this section fixes the contract's required
_content_, not its transport encoding.

---

## Flow: online payment (Central)

```
1.  Platform creates PaymentAttempt, generates operationId.
2.  Platform calls the provider with an idempotencyKey (level 1 above).
3.  Provider returns a preliminary result — NOT treated as final.
4.  Provider sends a webhook — this is the authoritative confirmation.
5.  Platform stores the webhook in its inbox (level 2 dedup) before acting on it.
6.  Platform updates paymentStatus from the webhook.
7.  Same local transaction: append a SettlementEntry (provisional, allocated per "Cash
    application" above) + write the ERP-bound outbox event.
8.  If fiscalization applies, fiscalizationStatus starts `pending` independently (via
    FiscalizationAdapter) — does not block steps 7/9.
9.  Central delivers the outbox event to the ERP (a new ErpAdapter.pushPayment(...), mirroring
    the existing pushOrder(order): Promise<ErpOrderRef> shape already in
    packages/plugins/sync/src/erp-adapter.interface.ts).
10. The ERP idempotently creates/updates its own document, returns an acknowledgement + document
    id (per the contract above).
11. Platform sets erpPostingStatus = accepted, marks the matching SettlementEntry reconciled.
12. Any mismatch anywhere in this chain (amount, currency, order, duplicate, missing
    counterpart) → a PaymentReconciliationIssue, not a silent overwrite.
```

Treating the provider's synchronous HTTP response as final (skipping the webhook wait) is a
common mistake this design deliberately avoids — asynchronous confirmation via webhook is the
standard, documented pattern for essentially every major provider.

## Flow: bank transfer witnessed by the ERP (`bank-transfer-erp`, implemented)

Unlike the online-payment flow above (Central → provider → webhook, an outbound-initiated
operation), a bank transfer is a fact the ERP already knows about (an accountant reconciled a
bank statement) and needs to push **into** this platform — the reverse direction:

```
1.  1C posts a payment document against an Invoice it knows about (organizationId/counterpartyId
    resolved on the ERP side, same as any other ERP-sourced fact).
2.  1C calls POST /erp/callback/payment (plugin-sync's ErpCallbackController) with
    { invoiceId, outcome, erpEventId } — see ErpPaymentReportedDto, documented at /api-docs for
    1C developers to implement against directly.
3.  plugin-sync publishes ErpPaymentReportedEvent on the EventBus and returns { ok: true }
    immediately — this ack is unconditional and fast; it says "received", not "processed".
4.  plugin-acquiring's PaymentEventListener enqueues the event into the payment inbox
    (provider: 'erp', providerEventId: erpEventId) and returns.
5.  PaymentInboxWorker's next sweep (or an ops-triggered triggerPaymentInboxSweep) calls
    PaymentAttemptService.payInvoice, which does the real, transactional work: create the
    PaymentAttempt, run FIFO cash-application via SettlementEntryService.allocate.
6.  A resend of the same erpEventId (1C retrying after a timeout, a duplicate exchange record)
    is a no-op at step 4 — InboxService.enqueue returns the existing row instead of creating a
    second one.
```

This is the general rule-#12 anti-pattern applied concretely: step 3 (ack) and step 5
(processing) are deliberately different points in time, on different triggers, so a crash or bug
between them never loses the payment fact — the row just sits `pending` until the next sweep.

## Flow: branch till (kassa) payment

**Target flow, once real kassa hardware exists:**

```
kassa device (ККТ)
    → kassa server
        → branch (this platform)
            → central
                → ERP
```

```
Branch:
    - performs the kassa operation, gets the fiscal confirmation from the kassa server (or a
      pending state, per the async fiscalization note above)
    - stores its own local PaymentAttempt + FiscalReceipt reference
    - publishes payment.recorded (existing mechanism, see docs/architecture.md) to Central

Central:
    - registers the payment, links it to the real order if Central owns it, or applies it as
      an informational projection if it only holds a replica (existing rule, unchanged)
    - pushes the fact to the ERP via ErpAdapter.pushPayment (same as the online flow, step 9-11)

ERP:
    - idempotently creates/updates its own cash/payment document
    - returns an acknowledgement + document id
```

**The fiscal fact itself is still owned by the kassa server / fiscal registrar, never by this
platform** — the platform stores its confirmation (`FiscalReceipt`), it does not generate or
assert the fiscal state on its own authority.

### `recordWitnessedPayment` — interim status, not the target integration point

No real kassa server integration exists yet. Until it does, the placeholder admin mutation
(`recordWitnessedPayment`) is deliberately restricted to:

- a test/staging environment,
- debugging the business process end-to-end,
- a temporary, permission-gated administrative operation — never the normal path a branch
  operator uses for routine sales.

**Once a real kassa server is connected, the kassa server becomes the source of the cash-op
fact — not a manual call to `recordWitnessedPayment`.** At that point, the mutation must be
either removed outright, or kept strictly as a controlled emergency/fallback mechanism (e.g. for
a kassa-server outage), never as a routine input path.

**Implemented so far**: `recordWitnessedPayment` writes the branch-local fact and, via the
existing `payment.recorded` outbox event (`order-sync.service.ts`), reaches Central through the
normal branch→central sync transport (`docs/sync.md`'s "Branch → Hub" flow — no new transport was
added for this). `PaymentRecordedPayload` (`packages/shared/src/sync.ts`) gained optional
`invoiceId`/`outcome` fields so the same event can carry "this cash payment settles
`plugin-acquiring`'s `Invoice` #N" when the caller knows it. `CentralConsumer.handlePaymentRecorded`
applies the payment fact as before (unchanged) and, when those optional fields are present, also
publishes `BranchKassaPaymentEvent` on the `EventBus` — which durably lands in the payment inbox
exactly like the ERP path above (see the "Idempotency" section's "Producers" list). What's still
missing is the real kassa server itself; the sync/inbox wiring downstream of
`recordWitnessedPayment` is real, not a stub.

---

## Collision management: why it's needed even with one writer per channel

Business-level duplicate entry is genuinely unlikely when each channel has exactly one owner
(kassa integrated with the platform ⇒ not also entered in the ERP by hand; online payment
gateway integrated with the platform ⇒ same; bank statements entered directly in the ERP only,
for now — and if this platform ever takes over bank-statement entry too, the ERP-side manual
entry for that channel stops, so no dual-entry window opens there either). **But collision
management is still required — not because of multiple sources per channel, but because of
distributed delivery and uncertain outcomes**, all of which are real and will happen:

- the same message delivered more than once
- a timeout with a genuinely unknown outcome (did the call succeed before the connection died?)
- a webhook arriving before the API response that supposedly triggered it
- events arriving out of order
- a refund event arriving before its original payment's confirmation
- the ERP accepted the posting, but the acknowledgement was lost in transit
- a staff member double-clicking "pay"
- a branch reconnecting after an outage and resending its accumulated operations
- a document in the ERP edited or deleted by an accountant after import
- an amount or order mismatch between the platform's record and the ERP's

This is exactly why the three idempotency levels above, the inbox/outbox pattern, and
`PaymentReconciliationIssue` all exist — they solve _distributed-systems_ uncertainty, not a
multi-source-of-truth problem. Both matter; they're just different problems with different fixes.

---

## Open questions (explicitly out of scope for now)

These are real, acknowledged gaps — not guessed at here, tracked for a future design pass:

- **Which fiscal registrar/operator** (a branch-local device, a kassa server, a cloud registrar,
  a third-party fiscalization service, or another option) — isolated behind
  `FiscalizationAdapter` specifically so this choice doesn't block the rest of the design. Once
  decided, the adapter's real field list and polling/push behavior follow from that choice.
- **The exact `pushPayment`/`pushRefund` wire payload and ERP document/method names** — business
  semantics are fixed (see above); the transport encoding depends on the real ERP integration
  surface, not yet fully explored.
- **The reconciliation matching rule's exact algorithm** — likely `counterpartyId` + amount + a
  time window for ERP-originated entries the platform never pushed itself (e.g. a bank statement
  entered directly in the ERP), since the ERP has no knowledge of this platform's own
  `idempotencyKey`/`correlationId` for those. Entries the platform _did_ push can match by that
  id directly — the fuzzy fallback is only for the other direction.
- **Real branch kassa hardware/kassa-server integration** — see `recordWitnessedPayment`'s
  interim-status section above.
- **Currency handling beyond a single implicit currency** — `currencyCode` is now part of the
  contract, but multi-currency settlement logic (conversion timing, which rate applies) isn't
  designed — flag if the business ever actually needs more than one currency.
- **Automated resolution rules for `PaymentReconciliationIssue`** — today, every issue is
  surfaced for a human; whether any issue types are safe to auto-resolve later (e.g. a
  known-benign rounding difference under some threshold) is an open, deliberately deferred
  question — don't build auto-resolution speculatively before a real pattern of issues shows
  which ones are actually safe.
