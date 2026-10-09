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

- A plain number, 8 digits, from a PostgreSQL sequence per document type, starting at 10000000 (never `MAX+1`, never a
  random suffix). Gaps after a rolled-back transaction are acceptable: these are not accounting documents (the ERP holds
  those); gapless numbering is a legal requirement for tax invoices only.
- `Order.code` is the order number (digits only).
- Documents that belong to an order are numbered `<order number>-NN` (`10000012-01`, `-02`, ... one per organization
  invoice). Other document types (payment document, refund, discount grant) have their own sequence.
- Shown everywhere people see a document and accepted by every search box (typing digits finds it).
- Numbers are generated on the central hub; a branch instance never generates a document number (if a flow is found
  that does, per-instance ranges are required before it ships).

## Exchange

- Outbound events carry `uuid` and `number` of the entity, plus `uuid` of each line. The producer has a guard keyed by
  the entity `uuid`: a second publish of the same entity (re-confirm, release then confirm, expiry then confirm) has no
  second external effect.
- The ERP stores our `uuid` and `number` in the document it creates and registers idempotently by `uuid` (a repeated
  registration returns the existing document); replies refer to our entity by `uuid`.
- Inbound events about our entities are matched by `uuid` first.
