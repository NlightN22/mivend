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
boolean — see the external-integration-rules skill, the general anti-pattern this design exists to avoid.
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
processing (`PaymentAttemptService.payProformaInvoice`) happens — never inline in whatever received the
event. An ops-only admin mutation, `triggerPaymentInboxSweep` (`proforma-invoice.resolver.ts`), runs the
exact same `processPendingEvents()` path on demand — a "run the sweep now" tool, not a bypass of
the async contract.

**Producers** (who calls `enqueue()`, i.e. who is `provider`):

- `provider: 'erp'` — `POST /erp/callback/payment` (`plugin-sync`'s `ErpCallbackController`,
  body typed as `ErpPaymentReportedDto` with Swagger docs at `/api-docs`, for ERP developers to
  implement against) publishes `ErpPaymentReportedEvent` on the `EventBus`; `plugin-acquiring`'s
  `PaymentEventListener` subscribes and enqueues with `providerEventId = erpEventId` (the ERP's
  own id for the payment fact — a resend is a safe no-op; the document is named by
  `proformaInvoiceUuid`, never the internal id). Also the simulation entry point until
  a real ERP integration exists.
  Known gap: this endpoint has no guard or authentication of its own (no auth in the controller, none in the sync plugin); access control is not defined yet.
- `provider: 'branch-kassa'` — no separate transport: a branch's existing `payment.recorded`
  outbox event (see "Flow: branch till (kassa) payment" below) carries optional `proformaInvoiceId`/
  `outcome` fields; Central's `CentralConsumer.handlePaymentRecorded` publishes
  `BranchKassaPaymentEvent` (`providerEventId = ` the sync envelope's own `eventId`) once it has
  applied the payment fact locally, and the same `PaymentEventListener` enqueues it.

Both events carry a `RequestContext` (`event.ctx`) rather than the listener re-deriving one, and
both event classes live in `plugin-sync` (`erp-payment.events.ts`) — `plugin-acquiring` imports
them from `plugin-sync`'s public `index.ts` only, never `plugin-sync/src/...` directly. The
listener itself (`payment-event.listener.ts`) only ever calls `inboxService.enqueue(...)` — it
must never call `payProformaInvoice` directly; that would silently reintroduce the exact rule-#12
anti-pattern this whole design exists to prevent.

Note: `online-acquiring` does **not** go through this inbox today — `onlineStubPaymentHandler`
calls `payProformaInvoice` synchronously at checkout time, which is itself an instance of the rule-#12
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
local transaction** — this is not a new pattern, it's the outbox-pattern messaging invariant (outbox is
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

- **`ProformaInvoice`** (new — see "Organizations" below) — one per our organization within an aggregate
  `Order`: `orderId`, `organizationId` (references `OrganizationRequisites`, `plugin-documents`),
  `counterpartyId`, `amount`, `currencyCode`, `status`
  (`pending`/`issued`/`paid`/`cancelled`). The object a payment actually settles — not `Order`
  directly, once real splitting is wired.
- **`PaymentAttempt`** (the platform's own record of a payment) — `paymentId`, `channel`
  (`online-acquiring` | `branch-kassa` | `bank-transfer-erp`), `proformaInvoiceId` (which `ProformaInvoice` — and
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
  optional), referencing `proformaInvoiceId`, the local provisional reflection of a movement
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
    paymentId, proformaInvoiceId, providerPaymentId, erpDocumentId
    expectedAmount, actualAmount, expectedCurrency, actualCurrency
    detectedAt, status, resolution
    ```

    This is the same "escalate to a human, never guess" convention already used throughout
    `plugin-approval-workflow` — a mismatch is surfaced for someone to look at, not resolved by
    picking whichever system's number looks more plausible.

---

## Proforma invoice: concept, versions, statuses (decided 2026-10-13)

- **A proforma invoice is informational.** It is a payment request, not a debt and not an accounting
  document. It is never "closed": money and debt live in the ERP. The only source of debt is the **sales
  invoice** (the ERP's realization of an actual shipment); the order is only a preliminary commitment.
- **One document, many versions.** One document per (order, organization); its versions are successive
  editions: v1 at order placement, v2 when the order changes, v3 "by shipment" once the realization is
  ingested (not available yet: the settlement stream, #224, must carry realizations first; design for it
  now, build it later). The shipment version links to the sales invoice number and is labelled as such;
  it is still a proforma (informational), never an accounting document.
- **Number carries the version:** `<order number>-<NN>-<version>` (digits and hyphens only), e.g.
  `1000000303-01-1`, `1000000303-01-2`. `<order number>-<NN>` is the stable document id, the last part is the
  version; unique, never reused. The same number goes into the print form, the payment QR and the
  payment purpose, so a payment shows which version the customer paid and we link to that version.
- **Dates per version:** each version has its own issue date and its own due date (payment term in days,
  a business setting, default 3). Yesterday's version keeps its date and term; today's has a new one. The
  customer may pay any version; money lands on the balance either way.
- **Statuses (customer/manager facing):** *Current* (the latest version, not cancelled), *Superseded* (a newer
  version exists; informational "there is a newer version", the old one stays readable and payable, never
  "not valid"), *Cancelled* (withdrawn without replacement: order cancelled, the organization has no lines
  left, or a manager withdrew it). "Paid" is not shown on a proforma: payment is shown at order level from
  ERP data (`paidAmount`, settlement documents).
- **Implementation (#206):** `ProformaInvoice` has `issuedAt`, `dueDate` (issue + `BranchSettings.proformaPaymentTermDays`,
  default 3, resolved for the order's servicing branch with the default branch as fallback, edited in the manager
  Settings), `kind` (`order-placed` | `order-changed` | `by-shipment`; only the first two are produced) and a nullable
  `salesInvoiceNumber` for the future by-shipment version. The API exposes `displayStatus` (current | superseded |
  cancelled) and the list filter `status: "current"`; the stored `paid` is never shown. A manager can withdraw a
  current, unpaid proforma (`withdrawProformaInvoice`, UpdateOrder + order visibility); a later order change or request
  issues a new version. "Paid X of Y" on the order is not shown: the ERP `paidAmount` is not stored by the order stream.
- **Allocation of payments to documents (FIFO in this module) is frozen:** kept as is, not extended and not
  used for display. Payments are money on the counterparty balance; documents and debt come from the ERP.
  Later: the customer allocates a payment across orders in our system (the allocation must be sent to the
  ERP: a contract designed with the integration side), and FIFO over the balance can drive a computed "paid"
  display. Overpayment is an advance that offsets the next sales invoice.

## Payment allocation

How an ERP-reported payment fact is applied (`PaymentInboxProcessorService` -> `PaymentAttemptService` ->
`SettlementEntryService.allocate`):

1. **Reference and amount.** The fact names a document by `proformaInvoiceUuid` (optionally with its number, which
   must match) and carries the payment's own `amount` (integer minor units, > 0) and `currencyCode`. Allocation uses
   this amount, never the document's: it may be partial or exceed the document. A currency different from the
   document's is rejected (`CURRENCY_MISMATCH` issue). The organization must match the document's, otherwise an
   `ORGANIZATION_MISMATCH` issue is raised. A payment with no document reference belongs to the future real payments
   stream (#195) and follows the same FIFO rule; the REST callback (test-only) always names a document.
2. **Order.** The named document first, when open (`pending`/`issued`). A `superseded` named document redirects to
   the current head of its version chain (`supersededById`, same counterparty and organization). Whatever remains,
   or everything when the named document is not open (`paid`, `cancelled`, no open head), goes FIFO over the
   counterparty's open documents of the same organization and currency, oldest first. An already paid named
   document never blocks the money.
3. **Remainder.** Money no open document can take is stored as an advance `SettlementEntry` (no document, no
   order) on the counterparty. It is not consumed automatically by later documents; a person re-allocates it.
4. **Version is irrelevant.** The printed version the customer paid does not matter, only the fact of payment.
5. **Idempotency** is by the ERP event id only (`channel` + external reference). A repeated fact with another event
   id is new money and is allocated by the rules above.
6. **Why a document link remains.** It marks documents paid/open for the customer and managers and keeps the audit
   trail per document. The link is to the current version, never required to be the printed one.
7. **Order change after payment** never rewrites a paid snapshot; the difference is settled through the ERP.

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
settlement document: an amount allocated against a specific sale/sales invoice counts as settled; the
remainder sitting on the payment document itself counts as an advance; one payment can be split
across several settlement-object lines. `SettlementEntry`'s allocation rows are the platform-side
mirror of that same shape — this is what lets ERP reconciliation match cleanly (see below) rather
than requiring a translation layer between two different allocation models.

---

## Organizations (our own legal entities) — a payment cannot be captured without this

Field ownership: the `organization` stream and `erp-import` both write `OrganizationRequisites`; the
stream carries name, active state, inn/kpp/ogrn, legal address, bank details, phone and a signatory list
(role = ERP enum name, person name, optional position; stored as JSON). An empty value means "not
provided" and never overwrites a stored one, a non-empty value always does; a non-empty signatory list
replaces the whole stored list, an empty one keeps it. The print form takes the head and chief accountant
from the list (head falls back to `signatoryName`/`signatoryTitle`); logo stays admin-only. When a row first gets inn and legal address, failed proforma documents of that
organization are re-queued once (a conditional `failed` -> `pending` update, so no duplicates).

### Proforma invoice print form

The PDF follows the structure of a standard payment-request form: payment-terms notice
(`PAYMENT_NOTICE`, one constant), bank block (bank, BIK, correspondent and settlement accounts,
INN/KPP, recipient name, payment QR box captioned "Отсканируйте для оплаты"), title "Счет на оплату №
<number> от <date in words>" (the full versioned number), a "Срок оплаты до <date>" line, a "Версия N" line above version 1
(with "по отгрузке (реализация № ...)" for a by-shipment version) and a neutral "Есть более новая версия" note for superseded versions, supplier/consignor and buyer/consignee lines, the items
table, totals, amount in words and signature lines. The layout fits the A4 width; long names wrap in
cells and only rows may break across pages (totals and signatures stay together).

- Required to generate: legal name, INN, bank name, BIK, settlement account (a document whose
  organization lacks them fails and is re-queued once they arrive). Optional, printed only when
  present: KPP, legal address, correspondent account, OGRN, signatory name/title. The buyer needs only a name.
- Unit comes from the variant's sold-unit name; discount columns appear only if a line has a
  discount; no manufacturer-code column (no single per-variant code exists).
- VAT: one total line "В том числе НДС: <sum>" between "Итого" and "Всего к оплате" (no per-line or
  per-rate printing, no VAT column). The snapshot stores per line `taxRate`, `taxCategoryName` and
  `taxAmount`, taken at issue time from the order line's tax lines; prices are VAT-inclusive, so
  `taxAmount = round(net line amount * rate / (100 + rate))` and the total is the sum of line amounts.
  Tax data is not part of the content hash (a version follows the money; a rate change alone never
  re-issues). All lines 0% prints "НДС 0%" when a line's category is НДС0, else "Без НДС".
  A rate is "not confirmed" when the line has no tax line or a 0 rate on the ERP placeholder rate
  (`isUnconfirmedTaxRateName` in `shared`, used by both the auto-create and the snapshot); the snapshot
  stores `taxRate: null` and is never rewritten. At print time VAT is derived from the category's
  confirmed rate; while it is still unknown, generation fails with "VAT rate not confirmed for category X".
  The `vat-rate` handler renames the rate on confirmation and requeues failed documents of that category.
  An order line normally has one tax line; several would be summed. Snapshots issued before tax data
  was stored print "не указан" with a logged warning; nothing is derived for them.
- Payment QR (`plugin-documents/src/qr-payment/`): GOST R 56042-2014 format ST00012 ("ST0001" +
  encoding digit, 2 = UTF-8; 1 = windows-1251, 3 = KOI8-R), plain bank details, no SBP. Payload
  `ST00012|Name|PersonalAcc|BankName|BIC|CorrespAcc|Sum|Purpose|PayeeINN[|KPP]`, `Sum` in kopecks.
  Limits: Name 160, BankName 45, Purpose 210, accounts 20 digits, BIC 9, INN 10 or 12, KPP 9, whole
  string 300 characters (the Purpose limit is the standard's own table value, 210 "at the time of writing",
  see [the standard text](https://meganorm.ru/Data2/1/4293771/4293771168.htm)); a BankName over 45 is cut on
  a word boundary instead of dropping the QR; the SVG keeps a 4-module quiet zone; `|` and control
  characters inside values become spaces. Our rule is stricter
  than the standard: Sum (this version's amount, > 0), Purpose and PayeeINN are required too; Purpose
  is "Оплата по счету № <number> от dd.mm.yyyy" plus ", в т.ч. НДС <sum>" when the VAT total is known;
  KPP is sent only when the organization has one. Any missing or invalid value leaves the box empty (a superseded version still prints its QR: it stays payable) (a warning lists the fields) and the PDF still generates. The image is
  an SVG drawn from the `qrcode` package's module matrix (error correction M). Own small module instead
  of a GOST library: the format is a fixed string, and the existing packages are unmaintained.

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
lines, 3 organizations, 3 proforma invoices, 3 payments.

**This is not optional and not deferrable to "after payment."** A split-payment acquirer (the
correct primitive here — see below) requires the full recipient/amount breakdown **at
payment-creation time**, before the customer pays, with no documented way to add or restructure
recipients afterward (confirmed against ЮKassa's split-payments API: the `transfers` array — which
organization gets how much — is a required parameter of the payment-creation request itself; only
already-listed transfers' amounts can be adjusted later, during two-stage capture). So an online
payment cannot be requested until the order's organization split is already known — waiting for an
async ERP acknowledgement is not compatible with this.

**Decided direction:**

- **`ProformaInvoice`** (new entity, `plugin-acquiring`) — one aggregate `Order` splits into one `ProformaInvoice`
  per organization it touches: `orderId`, `organizationId`, `counterpartyId`, `amount`,
  `currencyCode`, `status`. `PaymentAttempt`/`SettlementEntry`/`PaymentReconciliationIssue`
  reference `proformaInvoiceId` (nullable today — see "Not yet designed" below), not a bare
  `organizationId` — `ProformaInvoice` is the single source of truth for which organization a payment
  belongs to.
- The organization-per-product mapping (today only known inside the ERP's warehouse/storage-location
  data) is imported into the platform as **catalog master data**, the same way `PriceEntry` is
  (the external-integration-rules skill — ERP is master; the platform holds a local read replica so checkout
  doesn't need a synchronous round-trip to the ERP): `ProductVariant.customFields.organizationId`, set
  by `erp-import`'s product record. `OrderLine.customFields.organizationId` is stamped from it
  each time the order enters `ArrangingPayment` (`organizationOrderGuard.onTransitionEnd`); proforma invoice
  split, reservation gate and the `order.submitted` builder read the line, never the variant. The
  `order.submitted` carries the organization of the order's contract instead; the contract is the
  stored selection, else the main one, else another active contract (docs/order-flow.md "Order
  contract").
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
- **Bootstrapping without a real ERP export**: don't wait for ERP to actually expose
  `organizationId` per storage location — 3 synthetic organizations are seeded directly
  (`OrganizationRequisites` via `make seed`) and `erp-import`'s product record carries an
  `organizationId` field now, so the real split can be built and exercised end-to-end today. Swap
  in the real ERP export later without changing the platform-side contract shape.
- **Several storage locations per product**: each organization-bearing `storage-location` row is
  stored (`storage_location_assignment`) and `ProductVariant.organizationId` is recomputed from all
  of them under a per-product lock: lowest priority wins, then lowest `entityId`. A deleted row,
  or a row that loses its organization, leaves the set and the next best row takes over; the
  variant is cleared only when none is left. Known gap: a location that moves to another product
  keeps its old row until it is deleted. The migration seeds the table from the current winners;
  a contour that uses `synchronize` needs the same seed (or a topic replay) once.
- **Enforcement (decided): a variant with no organization (seller of record) is not sellable, for
  anyone.** Missing organizations are an expected data condition (storage-location rows can arrive
  late or without one), so the gate sits where the order is built, not only at import:
    - **Customer catalog and search** hide the variant (external lookup requires an enabled variant
      with an organization; the internal index carries `variant-hasOrganization`, so a reindex is
      needed once). Staff views (manager portal, Admin API) show it, marked "No organization"
      (`SearchResult.availableForOrder` on the Admin API).
    - **Cart** marks the line "Not available for order" (`ProductVariant.availableForOrder`) and
      disables checkout until it is removed.
    - **Hard gate**: `organizationOrderGuard` (`plugin-acquiring`) refuses the transition to
      `ArrangingPayment`, which every payment method needs, naming the SKUs. Safety nets: payment
      handlers still decline an unsplittable order, `reserveOrder()` rejects the order as
      ERP-export data missing (`organizationId`), and a skipped `order.submitted` is recorded as a
      `skipped` outbox row (see docs/integration-health.md).
    - Integration health shows how many enabled variants have no organization
      (`variantOrganizationHealth`).
    - `GlobalSettings.customFields.organizationSplitEnabled` (default `true`) still makes
      `erp-import`'s `ProductHandler` reject a product record without `organizationId` and fails an
      online payment whose split cannot be computed. `make seed` turns it on; e2e fixtures get
      organizations assigned in `global-setup.ts`.

**Counterparty-side note (does not need modeling yet):** a counterparty can itself belong to a
"holding" grouping in the ERP, but that's purely an analytical tag — one `Counterparty` is always
exactly one legal entity on the buyer side. Not a design gap; no action needed here.

**Deferred (decided to postpone, not blocking online payment):**

- Per-organization `creditLimit`/`paymentDelayDays` on `Counterparty`, or contracts/agreements
  (`TODO.md`: "Добавить организации и лимиты в разрезе организаций. Добавить договоры и лимиты в
  разрезе договоров.") — touches `plugin-counterparty`, `plugin-erp-order`, order creation,
  credit-terms approval, and the manager portal's finance views. `ProformaInvoice`/`SettlementEntry`
  already carry `organizationId`, which is enough for correct payment allocation without this.
  UI direction for when it does land: aggregate totals in dashboard KPI tiles, per-organization
  breakdown lower on the page/in tabs —
  [#48](https://github.com/NlightN22/mivend/issues/48) (needs a real design pass later).
- Refund/dispute/document (proforma invoice PDF) generation per-`ProformaInvoice` rather than per-`Order`.
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
1.  ERP posts a payment document against a ProformaInvoice it knows about (organizationId/counterpartyId
    resolved on the ERP side, same as any other ERP-sourced fact).
2.  ERP calls POST /erp/callback/payment (plugin-sync's ErpCallbackController) with
    { proformaInvoiceUuid, organizationId, outcome, erpEventId, proformaInvoiceNumber? } — see
    ErpPaymentReportedDto, documented at /api-docs for ERP developers to implement against
    directly. The document is addressed by its immutable uuid; the optional number is a
    reference only and a mismatch dead-letters the event.
3.  plugin-sync publishes ErpPaymentReportedEvent on the EventBus and returns { ok: true }
    immediately — this ack is unconditional and fast; it says "received", not "processed".
4.  plugin-acquiring's PaymentEventListener enqueues the event into the payment inbox
    (provider: 'erp', providerEventId: erpEventId) and returns.
5.  PaymentInboxWorker's next sweep (or an ops-triggered triggerPaymentInboxSweep) calls
    PaymentAttemptService.payProformaInvoice, which does the real, transactional work: create the
    PaymentAttempt, run FIFO cash-application via SettlementEntryService.allocate.
6.  A resend of the same erpEventId (ERP retrying after a timeout, a duplicate exchange record)
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
`proformaInvoiceId`/`outcome` fields so the same event can carry "this cash payment settles
`plugin-acquiring`'s `ProformaInvoice` #N" when the caller knows it. `CentralConsumer.handlePaymentRecorded`
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

## Checkout payment methods and credit control (issue #180)

**Availability = plugin presence.** The storefront renders only what `eligiblePaymentMethods` returns
(no hardcoded list); with none eligible, checkout says so and blocks placing the order.

- `deferred-payment` (plugin-deferred-payment) owns credit control. Its eligibility checker hides the
  method for counterparties without a computed general limit (`creditLimit > 0` required; prepayment
  customers). `Counterparty.creditLimit` is filled by the credit-limit job below, not by import.
- `offline-terms` (bank proforma invoice) stays in acquiring (documents depend on it). `OFFLINE_TERMS_ENABLED=false`
  disables its PaymentMethod row.
- `online-stub` PaymentMethod is enabled by `OnlinePaymentPlugin`'s bootstrap only when
  `ONLINE_PAYMENT_STUB_ENABLED=true` (`apps/server/.env.central`; the staging-integration contour leaves
  it unset, so it is disabled there).

### Target model: form of payment vs terms (issue #222, decided 2026-10-12, backend built in stages 1-2a)

The checkout list below mixes a form (proforma invoice, online) with terms (deferred). The decided model separates them;
"Stage 2a done" below describes what the backend does now, the older sections that follow are history.

- **Form** (customer choice): cash, bank proforma invoice, card online. There is no "deferred" option.
- **Terms** (derived, never chosen): limit > 0 and payment delay days > 0 means limit control applies; otherwise
  prepayment, or a one-off manager confirmation. The limit is a hidden control, not a payment method.
- An order occupies the limit until it is paid (cash accepted, proforma invoices paid, card payment received); a paid order
  does not count. How shipment/realization replaces the preliminary estimate is a separate discussion.
- A proforma invoice (formerly `ProformaInvoice`, renamed in #223) is a document of the order and can be requested on any form and
  under any terms (#206). Order of work: #222, #223, #206.

| Limit state | Form | Placement | Goes to ERP | Counts against limit |
| --- | --- | --- | --- | --- |
| Within limit | cash | placed | immediately | until cash accepted |
| Within limit | bank proforma invoice | proforma invoices generated, printable pages opened in new browser tabs | immediately | until paid |
| Within limit | card online | payment page at once | after payment | no |
| Over limit | any | placed with `creditLimitExceeded`, customer ticks an acknowledgement | immediately if the branch allows exceeding and the customer ticked; otherwise after manager confirmation | yes |
| No limit | cash | placed, waits for a manager | immediately with a short reserve; manager confirms cash received | no (prepayment) |
| No limit | bank proforma invoice | proforma invoices generated and opened at once | immediately with a short reserve; a manager marks paid (no automatic tracking yet) | no |
| No limit | card online | payment page at once | after payment | no |

- Prepayment orders go to the ERP at placement with `reserveUntil` = placement + N days (default 3, a business
  setting in the manager portal, not the Vendure admin); expiry follows the standard reserve auto-cancel (#194).
- Card payment amount = existing excess over the limit (max(0, exposure - limit), before this order) + the full
  order total; no excess means the order total. Proforma invoices and payments are always for the full amount; partial
  payments and overpayment come later.
- A manager may confirm without payment when there is no limit: a one-off deferral under their responsibility;
  the order occupies the limit.
- New branch setting: allow exceeding the limit with the customer's acknowledgement (no manager wait).
- "Cash received" is a dedicated manager action if cheap, otherwise `ConfirmOrder`.
- Code consequences: `deferred-payment` becomes a policy applied to every form; `offline-terms` becomes a clean
  bank-transfer form whose payment is not `Authorized` at placement; the reserve/ERP trigger follows payment or
  manager confirmation; exposure is computed from payment fact, not ERP status.

**Stage 1 done (#222):** `OpenDeferredExposureService` is payment-method-agnostic: an unconfirmed (ERP `PENDING`/
`SENT_TO_ERP`/`RESERVED`), non-cancelled, not-too-old order of the counterparty counts until a payment of a method
other than `deferred-payment` is `Settled`. Legacy `deferred-payment` payments (`Authorized` at placement, no money)
keep counting. New branch setting `allowExceedingCreditLimit` (default off, manager portal Settings -> Branches) is
exposed as `DeferredCreditAssessment.allowExceedingCreditLimit`; the storefront checkout uses it since stage 2b.

**Stage 2a done (#222, backend only; storefront checkout UI is the next run):**

- Forms are PaymentMethods `cash` (new, bootstrap-created once), `offline-terms` (= bank transfer, name "Bank transfer")
  and `online-stub` (= card). `deferred-payment` is gone: handler, eligibility checker and bootstrap deleted, migration
  `1791493000000` renames its payments to `offline-terms` (still unpaid, so they keep occupying the limit) and deletes
  the method row. `PAYMENT_FORM_BY_METHOD_CODE` in `packages/shared` maps method code to form id.
- Terms are derived in `DeferredCreditAssessmentService` (`limitControlled` = limit > 0 and delay days > 0); the matrix
  lives in one pure function, `decidePlacement` (deferred-payment `placement-policy.ts`). Every handler calls
  `CreditPlacementService.place` at placement; the result is stored in `Payment.metadata.placement`
  (`route`: `erp-now` | `after-payment` | `manager-confirmation`, `countsAgainstLimit`, `reserveDays`) plus the public
  `creditLimitExceeded` flag. Reservation reads `route`; the exposure SQL skips a payment with
  `countsAgainstLimit = false` (card awaiting payment) and counts everything else not Settled.
- Over the limit the server never trusts the UI: `erp-now` needs the branch setting `allowExceedingCreditLimit` AND the
  customer's `creditLimitAcknowledged: true` in the `addPaymentToOrder` metadata; otherwise the order waits in
  `AWAITING_CONFIRMATION`. This also holds for card (the matrix says "any form").
- Concurrency: exposure read, decision and payment creation run under the advisory lock
  `credit-exposure:<counterpartyId>` inside the `addPaymentToOrder` transaction, so two racing orders of one
  counterparty cannot both pass (concurrent-writer integration test).
- Card amount: `Payment.amount` = `max(0, balance + open exposure - limit)` before the order + the order total;
  the excess is not allocated to the older orders' proforma invoices yet (acquirer/allocation work).
- Prepayment reserve: `BranchSettings.prepaymentReserveDays` (default 3, manager portal Branch settings -> Credit) is
  copied into `placement.reserveDays` at placement and becomes the reservation TTL, so it reaches the ERP as
  `reserveUntil`; expiry is the standard #194 auto-cancel. Orders on credit terms keep the 7-day default, paid card
  orders 30 days.
- Vendure places an order only on an `Authorized` payment, so cash and bank transfer stay `Authorized` at placement
  (meaning "obligation accepted"); `Settled` is the payment fact. The previous `paymentClassification` /
  `reservationTtlDays` PaymentMethod fields are removed (columns dropped by the migration).
- "Payment received": Admin mutation `confirmPaymentReceived(orderId)`, permission `ConfirmPaymentReceived` (operator,
  manager, general-director, portal-admin), settles the order's Authorized cash/bank-transfer payment under
  `payment-received:<orderId>`; a repeat is a no-op. Manager order page shows "Cash received" / "Bank transfer received".
  A manager may still confirm an order without payment through `ConfirmOrder`; it keeps occupying the limit.
- Shop API `deferredCreditPreview` (additive) now also returns `limitControlled`, `allowExceedingCreditLimit`,
  `acknowledgementRequired`, `payableCardAmount` (rubles) and `availableForms` (`cash`, `bank-transfer`, `card`).
- Open: manager marking of a bank transfer does not create a `PaymentAttempt`; partial payments and allocating a card
  excess to older orders are later work.

**Stage 2b done (#222, storefront checkout):**

- Checkout lists the forms from `deferredCreditPreview.availableForms` (bank proforma invoice, card online, cash); the
  preview is loaded on checkout open and re-fetched when the cart total changes. No `deferred-payment` code mapping
  is left in the storefront.
- Correction to the matrix: a card order that is over the limit is cured by its payment (excess + total). It is placed
  `after-payment`, does not count against the limit, carries `creditLimitExceeded = false` and goes to the ERP once the
  payment is Settled; it never falls back to manager confirmation. Cash and bank transfer keep the over-limit rule.
- Over the limit (`acknowledgementRequired`) cash and bank transfer need the acknowledgement checkbox; when
  `limitControlled` and not `allowExceedingCreditLimit` the checkout says the order will wait for manager
  confirmation. The acknowledgement is sent as `creditLimitAcknowledged: true` in the `addPaymentToOrder` metadata.
  A card does not ask for it.
- Card path shows `payableCardAmount` ("To pay online") and, when it exceeds the order total, a note that the excess is
  debt above the limit cleared together with the order.
- After a bank-transfer placement one browser tab opens per non-cancelled proforma invoice of the order
  (`/proforma-invoices/:id?print=1`, the detail page prints itself when loaded; sidebar hidden in print); the current
  tab lands on the order-created page, which also lists a print link per proforma invoice (popup blockers). Shop API
  `ProformaInvoiceListOptions.orderCode` (additive) selects the invoices of one own order.
- Cash: the order-created page shows "waiting for the manager to confirm receipt" until the manager marks the cash
  received. Public payment metadata flag `awaitingManagerConfirmation` (route `manager-confirmation`) drives the
  over-limit manager-wait notice.

**Stage 2 audit follow-ups (#222):**

- Placement choice is deterministic: when an order has several payments (card retry, form change), the placement
  (route, `countsAgainstLimit`, `reserveDays`) comes from the latest payment that is not Cancelled/Declined/Error
  (`createdAt`, then `id`); the exposure SQL applies the same rule.
- Card amount confirmation: the storefront sends `expectedAmountKopecks` (the figure it displayed) in the card
  `addPaymentToOrder` metadata; if the recomputed amount differs the payment is Declined with a
  `CARD_AMOUNT_CHANGED` message before any proforma invoice is created, and the storefront returns to checkout to
  re-confirm the refreshed amount. The card button shows the amount.
- `confirmPaymentReceived(orderId, paymentId?)` settles only payments carrying `placement` metadata (a legacy payment
  is never "paid" by it), records `confirmedByAdministratorId` and `confirmedAt` in the (non-public) payment metadata,
  and can target one payment.
- Migration `1791494000000` labels payments migrated from the removed deferred method with metadata
  `origin: "legacy-deferred"` (offline-terms payments with neither `placement` nor `proformaInvoices`). The removal of
  the deferred method is irreversible: its method row, classification fields and the original method code are gone, and
  `down()` of both migrations cannot restore them.
- `ERP_CALLBACK_API_KEY` guards refuse the dev placeholder key when `NODE_ENV=production`, like the import guard.

**Proforma invoice versions (#206):**

- `ProformaInvoice` carries `lines` (immutable snapshot), `version`, `supersedesId`, `supersededById`; status
  `superseded` joins pending/issued/paid/cancelled. `ProformaInvoiceIssuingService.issueForOrder` is the only creator
  (checkout handlers and the on-demand request call it); see `docs/order-contracts.md`, "Proforma invoices".
- Payment binds to a snapshot (`proformaInvoiceId`). A direct `payProformaInvoice` call rejects a cancelled one with a clear error; a superseded version stays payable. A payment fact reported by the ERP never fails on the version: allocation follows
  `supersededById` to the current version (same counterparty and organization) and settles it first; if that is not
  open, the "Cash application" rules above apply (FIFO over the open documents of the organization, then advance).
- Whole-order status updates at checkout (`updateStatusForOrder`) only move `pending` snapshots.
- Difference after payment = current content of the organization minus the paid snapshot amount (GraphQL
  `ProformaInvoice.orderChangedDifference`, null when nothing changed). The paid head stays the current document, so
  no new proforma invoice is ever issued for the difference: by the owner's decision (#206) it is settled through the
  ERP and the paid snapshot is never rewritten or replaced.
- A `cancelled` head (organization left the order) is never reused: if the organization returns, a new version is
  issued (next version of the same document id, `supersedesId` = the cancelled one). Head selection is deterministic
  (highest version, then highest id among non-superseded rows); a new organization's `NN` follows the highest used ordinal.
- Pay vs supersede race: allocation re-reads the target under its row lock; a target that became `superseded` meanwhile
  hands the payment to the current version of its chain, otherwise the cash-application rules above apply.
- Requesting a proforma (Shop `requestProformaInvoices`) is scoped to the counterparty, not the author: a colleague's
  order of the same counterparty is allowed, because proformas are visible to the whole counterparty anyway. Draft
  and pre-placement states (`Created`, `AddingItems`, `ArrangingPayment`, `Draft`) are refused.
- Printed discount and the stored amount share `lineDiscountTotal`/`lineNetAmount` (acquiring). At PDF time a
  mismatch between the sum of printed row totals and the stored amount is logged at error level and the stored amount
  is printed (older versions may carry the old amount); generation is not failed. Amounts in words reject
  non-integer or negative minor units; dates are printed as UTC calendar dates (no business timezone is configured).
- A failed proforma document is requeued on every `organization` event of a complete organization; if the queue add
  fails the document goes back to `failed` and the event is retried (no sweep picks up `pending` documents).
- `OrganizationChanged.is_active` is `optional` (presence-tracked): an event without it keeps the stored value.
- The `Document` of a snapshot uses the proforma invoice's own number (a legacy `<order>-<organizationId>` number is
  fixed by migration `1791495000000`, irreversible: the old numbers are not restored; checked on the dev databases, `document.number` has no unique index and no renumbered value collides); the PDF shows "Version N" (migration `1791501000000` later moved numbers to `<order>-<NN>-<version>`, irreversible).

**Known gaps (#222, deliberate):**

- Orders in `SHIPPING`/`DELIVERING` stop counting in the open exposure (the ERP balance is expected to include them),
  so there is a window until the ERP balance reflects the sales document; accepted, the balance sync delay is the
  ERP's.
- Orders with a NULL `erpStatus` are not counted: they are imported/external orders (#215) whose debt is already in
  the ERP balance, by decision.
- Leftover names: the plugin package `deferred-payment`, `OpenDeferredExposureService` and the Shop API field
  `deferredCreditPreview` keep the old wording until a dedicated rename.

### Credit limit on deferred orders

Decision (2026-10-06): exceeding the limit **does not reject** the order. It is placed, and the
customer sees a warning ("credit limit exceeded, wait for your manager to confirm"). Whether it goes
through is decided downstream (ERP, later a manager-portal approval workflow, see #142's
`creditTermApproval`); that workflow is deliberately not built yet.

- Single source of truth for the comparison: `CreditLimitCheckService.decide(counterparty, contract,
  pendingAmount)` in plugin-counterparty, compared in kopecks (limit/balance are whole rubles).
- `pendingAmount` = this order's total + the open deferred orders of the same counterparty that ERP has
  not confirmed yet (`erpStatus` in `PENDING`, `SENT_TO_ERP`, `RESERVED`; `OpenDeferredExposureService`).
  `creditBalance` itself only changes via the ERP credit-balance stream.
- The result travels as the public payment metadata flag `creditLimitExceeded` (key
  `CREDIT_LIMIT_EXCEEDED_KEY` in `packages/shared`); the storefront redirects to `/order-created` with
  `limitExceeded=1` and shows the warning there.
- Pre-placement warning: Shop API `deferredCreditPreview` (active order of the logged-in customer)
  returns `{ exceeded, availableCredit, orderAmount }` from `DeferredCreditAssessmentService`, the same
  service the payment handler uses, so the two cannot disagree. Checkout shows the numbers and a required
  acknowledgement checkbox while deferred is selected and `exceeded` is true (`canPlaceOrder` in the
  checkout store); another payment method drops the requirement. It never blocks the order itself.
- Manager portal: Admin API `Order.creditLimitExceeded` (read from the payment metadata flag) drives a
  badge on the order detail page and in the orders list status column; `creditLimitExceededCounterpartyIds`
  (scoped through `OrderVisibilityService`, unconfirmed non-cancelled orders, at most 500 scanned, in the default list order, so beyond 500
  orders which ones are scanned is not stable between calls) feeds the customers page "Needs attention" block.
- Cancelled orders (Vendure state `Cancelled`) never count. Interim cap: an open deferred order older
  than `GlobalSettings.deferredOrderMaxAgeDays` (default 7, editable in settings) since placement stops
  counting. Real TTL cancellation and ERP notification are separate work, not built here.
- Per-contract limits (`controlledIndividually`) are not evaluated here: the order carries no contract.
- Known limitations: concurrent checkouts of one counterparty are not serialized (the warning may be
  missed in a race, nothing is blocked either way); related-orders links are not built; mandatory proforma invoice requisites are deferred.

### General credit limit job

Scheduled task `erp-integration-credit-limit-recompute` (worker, central instance only, every 15 min,
`CreditLimitRecomputeService`; set-based SQL in batches, writes only rows whose value changed). The three
passes (contracts, counterparty limit, payment delay days) run without a shared lock, so a contract event
arriving between them can leave the three values briefly inconsistent; the next run (15 min) corrects it:

- pool = sum of `limit` of the counterparty's active contracts without `controlledIndividually`;
  stored in `Counterparty.creditLimit` (our calculation wins over any 1C number).
- Flagged active contracts are sublimits inside the pool; if their sum exceeds it, each is clamped to
  `limit * pool / sumOfFlagged`. The effective value is `Contract.effectiveCreditLimit`.
- No pool contracts or no limits gives 0: "deferred payment unavailable", never "unlimited".
- Deferred is available only with a limit > 0 AND `Counterparty.paymentDelayDays` > 0; 0 days (unknown) means
  prepayment regardless of the limit. Days are the active main contract's `debtDaysLimit`, written by the
  same job (0 when the main contract is missing, inactive or has no days), even if that contract is flagged.
- A flagged main contract's own `effectiveCreditLimit` is not enforced at checkout yet (needs per-contract
  balances, #151); only the pool check applies.
- Debt = the counterparty balance stream value (all contracts); check = balance + open deferred
  orders + this order against the pool.

### Local verification data and tests

- `infrastructure/scripts/seed-erp.mjs` (local contour only) seeds two buyers for this flow:
  `credit-limited@buyer.example` (limit 100000, balance 0) and `prepay@buyer.example` (limit 0), password
  `Password123!`. Bump the script's `run` id whenever seed records change: ERP import is idempotent by
  `exchangeId`, so a reused id silently skips new records.
- Seeded customers have no servicing branch, so placing an order needs a preferred trading point whose
  `servicingBranchId` is set (local e2e fixtures create one); otherwise payment fails with "no
  branch-scoped StockLocation".
- Integration test (real Postgres schema): `packages/plugins/deferred-payment/src/__tests__/integration/
  deferred-credit.int.test.ts` covers eligibility, within/over/exact-boundary limits, several open
  orders, confirmed/cancelled/other-method exclusion, counterparty isolation and idempotent re-runs.
  The Shop API layer itself still has no bootstrap harness; it was verified live in a browser.
