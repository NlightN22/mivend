# Identifiers: uuid and numeric document numbers

Rules are in `AGENTS.md` ("Identifiers"); this page has the decided details. Issue #207.

## Two identifiers, two jobs

| | `uuid` | `number` |
| --- | --- | --- |
| For | systems: idempotency, links, exchange | people and the other system's search |
| Form | UUID v4, assigned by mivend at creation, immutable | digits only, from a database sequence |
| Unique | globally | per document type |
| Reused | never | never |
| Sent in contracts | yes, the key | yes, a reference |

The integer primary key stays internal and is never sent. `eventId` is a transport key (redelivery of the same message)
and is never an idempotency key for a business entity.

## Which entities

- **uuid + number** (documents): Order, Invoice (and proforma snapshots, #206), PaymentAttempt / payment document,
  Refund, SettlementEntry, DiscountGrant.
- **uuid only**: OrderLine, Reservation (replaces the separate `erpOperationId` / `erpReleaseOperationId` ids as the
  entity identity; operation ids stay for operations), rendered Document records, reconciliation issue records, and every
  other mivend-created entity as it is touched (shared base for plugin entities, a custom field for Vendure core entities).
- **Neither** (ERP-owned masters: Counterparty, Contract, Product, Organization, Warehouse, ...): they keep the ERP's own
  `entityId`.

## Number format

- A plain number, digits only: a **3-digit instance code** (fixed per deployment: one code for the central hub, one for
  each branch) followed by a **7-digit sequence** from a PostgreSQL sequence per document type on that instance, for
  example `1000000012` (never `MAX+1`, never a random suffix). The code makes numbers unique across instances without
  any coordination, so the number is issued **immediately** by the instance that creates the document, hub or branch,
  with no wait for synchronization and no dependency on the hub being reachable.
- Gaps after a rolled-back transaction are acceptable: these are not accounting documents (the ERP holds those);
  gapless numbering is a legal requirement for tax invoices only.
- `Order.code` is the order number (digits only).
- Documents that belong to an order are numbered `<order number>-NN` (`1000000012-01`, `-02`, ...), NN being the
  ordinal of the document within the order. Other document types (payment document, refund, discount grant) have
  their own sequence per instance.
- **Proforma versions (#206):** every version is a new document with its own new number; the earlier version stays
  under its old number and the new one links to it ("replaces"), so a number is never reused and `-NN` is only the
  ordinal within the order; the organization is shown separately.
- **Payment documents:** our number always comes from the sequence; an external reference (acquirer id, receipt number,
  the ERP's event id) is stored and shown separately as the provider/bank reference and never replaces our number.
- Shown everywhere people see a document and accepted by every search box (typing digits finds it).

## Exchange

- Outbound events carry `uuid` and `number` of the entity, plus `uuid` of each line. The producer has a guard keyed by
  the entity `uuid`: a second publish of the same entity (re-confirm, release then confirm, expiry then confirm) has no
  second external effect.
- The ERP stores our `uuid` and `number` in the document it creates and registers idempotently by `uuid` (a repeated
  registration returns the existing document); replies refer to our entity by `uuid`.
- Inbound events about our entities are matched by `uuid` first.

## Implementation status (issue #207)

- Done: `Order.customFields.uuid` / `OrderLine.customFields.uuid`, assigned synchronously at insert by
  `apps/server/src/order-uuid.subscriber.ts` (a TypeORM `EntitySubscriber`, not an EventBus listener, so it is atomic
  with the row's own insert); backfilled for existing rows by migration `1791460000000-order-uuid`.
- Done: `order.submitted`'s duplicate-publish guard (issue #199), in `OrderSubmittedBuilder.build()` via
  `OutboundGateway.hasActiveEntryForOrder`. **Known limitation:** there is no dedicated "ERP rejected this order" fact
  recorded anywhere yet, so the guard's only rejection signal is `Order.customFields.erpStatus === 'REJECTED'` (set by
  `ReservationWriteOffSyncService` from the ERP's registration result). Any other existing `pending`/`published`
  `order.submitted` outbox entry for the order blocks a new one. If a case arises where a legitimate re-submit should
  be allowed on some other signal, that needs its own design, not a workaround here.
- Done: `NumberingService` (`packages/plugins/numbering`) — `next(ctx, documentType)` against a fixed, hardcoded
  Postgres sequence per `NumberingDocumentType` (`order`/`invoice`/`payment`/`refund`/`discount-grant`/`proforma`,
  migration `1791470000000-numbering-sequences`), formats `<3-digit INSTANCE_NUMBER_CODE><7+-digit sequence value>`;
  `formatOrderDocumentNumber(orderNumber, ordinal)` is the pure `<order number>-NN` helper. `INSTANCE_NUMBER_CODE` is
  validated as exactly 3 digits at plugin init and documented in `.env.local.example`/`docs/environments.md`.
- Done: shared `UuidEntity` base (`packages/shared/src/uuid-entity.ts`), assigned via `@BeforeInsert()` so it is
  readable before the row's own insert commits.
- Deferred (not done this pass — out of budget for this slice of #207, tracked for follow-up): applying `UuidEntity`
  to Invoice/PaymentAttempt/Refund/SettlementEntry/DiscountGrant/Document/ErpReconciliationIssue/Reservation (no
  entities changed, no backfill migrations written yet); the Reservation uuid/`erpOperationId` unification
  (not investigated); replacing `generateDocumentCode`/`documentCode.ts` call sites in `DiscountGrantService`/
  `PaymentAttemptService.payInvoice`/`InvoiceService.createInvoicesForOrder` with `NumberingService` (no order-scoping
  decision made yet for PaymentAttempt/Refund/SettlementEntry — flat sequence vs. `<order number>-NN` — re-read this
  doc's "Payment documents" paragraph above when making that call); the per-order `-NN` ordinal's required
  lock/transaction per `docs/concurrency.md` and its concurrent-writer test; and replacing
  `DateStampedOrderCodeStrategy`/renumbering existing Order/Invoice/PaymentAttempt/DiscountGrant codes (stretch goal,
  not attempted). `generateDocumentCode` is still live and in use — do not delete it until every call site above is
  migrated.
