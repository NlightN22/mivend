# ERP sales documents map (#394)

Scope: the nine sales-chain documents the Integration Service publishes as `erp.<kind>.events.v1` (event-contracts
0.94.0, already in the pinned 0.99.0; no bump needed, IS is at 0.101.0 but 0.100/0.101 are catalogs only). Supersedes
the tech debt in #383. `sales-correction`, `order-correction` and `customer-claim` are already consumed (#254) and stay
as they are.

Shared contract shape (every document): envelope (`event_id`, `occurred_at`, `entity_id` = document uuid = Kafka key,
`version`, `updated_at`), header (`number`, `date`, `is_posted`, `is_deletion_marked`), `is_deleted` (deleted in the ERP,
then only the envelope is set), own attributes (references are ids, money is a plain double), table parts as repeated
rows, and for a huge document `truncated = true` plus `table_row_counts` instead of the rows. There is **no accounting
block** (`AccountingReflection`) on these messages: only plain `reflect_in_*` booleans, which the ERP owner says are not
the "reflected in accounting" signal.

## Rules

- **Reflected in accounting** (what a customer may see) = `is_posted` and not `is_deletion_marked` and not `is_deleted`.
  Computed at read time from stored columns, never stored as a flag, never read from `reflect_in_*`.
- Line-change sources are only realizations and returns (plus the existing realization corrections). Claims, order
  closings, proforma invoices, VAT invoices and payment documents are never a source.
- A realization is an informational event ("shipped N"): it does not move the order line's remainder, a return and a
  correction do. A realization re-posted after a claim is the same document with a newer version, so the stored one is
  replaced and the customer sees the current shipped quantity; the old quantity is not kept.
- The customer sees a change only when reflected in accounting, only on the customer's own orders (the field is reached
  through an order the caller may read). Staff see every event, including unposted and deletion-marked documents, and
  the money effect (`soldTotalWithTax`). Order-state already provides paid amount, linked documents and status, so none
  of that is rebuilt from payment documents.
- No guessed link: a document is linked to an order only by an id that equals the order's ERP id (or, for a return, the
  order of a stored customer claim whose id is the return's deal). Anything else stays stored and unlinked.

## Storage decision: one generic mirror, not nine tables

Tables `erp_sales_document` (header) and `erp_sales_document_line` (rows of every table part, with a `table` column).
Reasons: the nine documents share the same header skeleton and none needs behaviour of its own beyond a read by order;
the realization alone has 55 header attributes and 11 table parts whose rows are mostly empty messages. Typed columns
only for what we filter or join on (kind, number, date, posted, deletion mark, counterparty, contract, organization,
deal, basis document, order of the proforma, currency code, total in minor units, truncated, row counts); line columns
for product, quantity, unit coefficient, amount, VAT amount, linked order/deal id; everything else stays as received in
a jsonb `attributes` column. `kind` is the stream name (`goods-and-services-sale`, ...), never a hardcoded enum list in
logic: the handler registry decides which streams exist. Written through the existing `ErpDocumentWriter` (aggregate
lock, version guard, tombstone, whole-set line replacement).

Truncated documents store the header and no rows (`truncated`, `rowCounts` kept); a truncated document yields no line
change (we cannot guess quantities), staff see its header only.

## Documents

| Document (stream) | Link to our entities | Stored | Shown | Deferred |
|---|---|---|---|---|
| goods-and-services-sale (realization) | no order header field. `deal_id` (+`deal_type`) and `basis_document_id` usually carry the order; each goods row has `customer_order_id`. Row id wins over header. Counterparty, contract, organization by id | header + goods rows (product, quantity, coefficient, price in attributes, amount, VAT, row order) | order card: "shipped" event per product (customer when reflected in accounting, staff always) | documents list pages; services rows (the contract message for them is empty today); set components, serial numbers, barcodes (jsonb only) |
| customer-goods-return | `deal_id` mostly an order; goods row `customer_order_id` only in some; `deal_id` can be a customer claim (about 40%): the claim's own `orderId` is used. No link to a realization. Return by transfer has no order: unlinked | header + goods rows | order card: "return from the customer" event, negative quantity and amount | unlinked returns are not shown to customers; a manager list of unlinked returns |
| customer-order-closing | `orders` rows carry `customer_order_id` and a closing reason id | header + rows | nothing yet | an order "closed, reason" line needs the reason catalog (`order-closing-reason`, 0.96.0, not consumed): deferred together with it |
| customer-proforma-invoice (ERP payment request) | `customer_order_id` header and row, `sale_document_id` | header + goods/services rows | nothing: our own proforma invoices are shown, order-state already lists linked documents | showing the ERP request next to ours (needs a product decision on duplicates) |
| issued-vat-invoice | `basis_document_id` (a realization), counterparty, contract; no order | header + rows | nothing | customer download of VAT invoices; needs the realization link only (resolved at read time through the basis) |
| incoming-payment-order | `payment_breakdown` rows carry `deal_id` (order) and `settlement_document_id`; counterparty, contract | header + breakdown rows | nothing: paid amount and settlement history already come from order-state and the settlement documents | per-order payment list |
| cash-receipt-order | same breakdown shape as above | header + rows | nothing, same reason | same |
| customer-card-payment | breakdown rows with `deal_id`; `basis_document_id` | header + rows | nothing, same reason | same |
| debt-correction | debtor/creditor counterparty, `basis_document_id`, `debt_amounts` rows with contract | header + rows | nothing | staff debt view |

## Why the customer screens stay as they are

Only the order card has a screen for these (the line-change block, already rendering `realization` and `return`). A
manager portal list of the nine kinds, VAT invoices for download and a per-order payment list each need a screen and a
product decision; all are deferred and none blocks the data from being stored and replayed. Visibility for any future
list: customer sees rows whose counterparty is one of theirs and that are reflected in accounting; staff go through the
usual counterparty scope with `ReadOrder`/`ReadCounterparty`.

## Operational facts

- Prod IS is seeded from 2024-01-01: about 8,000 documents across the nine kinds (3,170 realizations, 2,505 card
  payments, 1,047 cash receipts), a few thousand rows each for the big ones. They get their own inbox lane so the seed
  never delays the bulk lane; each document is one transactional write (header, delete, insert of its rows).
- Replay aggregate types are the camelCase kind names (`goodsAndServicesSale`, ...), the IS `GENERATED_ENTITY_TYPES`.
- Reconciliation: not compared yet (the upstream summary does not list these kinds); each kind is registered as not
  comparable with a reason.
- Needs the dev/prod IS to verify: real values of `deal_type`, which of `deal_id`/`basis_document_id`/row order is
  filled on real realizations and returns, real `truncated` documents, and the volume of table rows.
