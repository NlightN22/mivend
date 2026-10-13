# Order contracts and organizations

Decisions for how an order is tied to a customer contract and to the selling organizations.
Issues: #201, #202, #203, #205 (ERP rejection handling is #204, tracked separately).

## Two different organization concepts

| Concept                   | Where it lives                                  | Used for                                               |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Line organization         | `OrderLine.customFields.organizationId`         | Proforma invoices, payment split, reservations (our own split)  |
| Order (header) contract   | `Order.customFields.selectedContractId`         | `order.confirmed` header: contract + contract's organization |

- The line organization comes from the product: one storage location = one product = one
  organization (`ProductVariant.customFields.organizationId`, winner election in
  `StorageLocationStreamHandler`, per-location rows in `storage_location_assignment`).
- The ERP registers an order under one contract of the customer. The order document has a header
  organization bound to that contract, and each line carries its own organization that the ERP
  distributes itself from the storage location. That distribution later splits the order into
  separate sales documents and settlements inside the ERP. We do not send or imitate it.
- We split on our side too: one proforma invoice per distinct line organization in the cart (one cart with
  three organizations gives three proforma invoices), created at cart confirmation, independent of the
  payment method.

## A product without an organization is not sellable (#201)

- Hidden in the customer catalog and search (both backends; the external search service also gets
  `requireOrganization`, the local post-filter stays as a safety net). Staff see it with a marker.
- Hard gate at cart confirmation (transition to `ArrangingPayment`), re-checked when the stamp is
  written and in `reserveOrder()` and the `order.confirmed` listener. Nobody, including a manager,
  can override it. A skipped `order.confirmed` is never silent (`skipped` outbox row, shown on the
  Integration health page).
- Missing organizations are an expected data condition (some storage locations legitimately carry
  none), so the Integration health page shows a "variants without organization" counter.

## Which contract an order gets (#205)

Evaluated when the order enters `ArrangingPayment` and re-checked by the reservation and the
event builder with the same rule:

1. The stored selection (`selectedContractId`), if still valid: active, same counterparty, has an
   organization.
2. The counterparty's main contract, if active.
3. Any other active contract of the counterparty, chosen deterministically: same price type as the
   customer's, then the most recently created, then the lowest `erpId`.
4. Nothing suitable: confirmation is blocked with a clear reason ("no active contract") shown to
   the manager and to the customer.

Why a fallback: `Contract.isActive` mirrors the ERP deletion mark, and in the current data only
about one in six counterparties has an active main contract while about two in five have at least
one active contract. Requiring the main contract would block most customers. The ERP itself picks
the main contract, otherwise the first suitable one, so any active contract is acceptable to it
as long as the pair is consistent.

Staff can change the contract before confirmation (`setOrderContract`, permission `ConfirmOrder`,
order visibility scope as for the order, history entry). Allowed only while there is no active
reservation and the ERP has not received the order, and only to an active contract of the same
counterparty. It takes the same lock as `reserveOrder()`. The customer has no choice for now.

## `order.confirmed` contents

- One event per order (one warehouse, see "Order events topic" below); never per organization.
- Header `organizationId` = the selected contract's organization (`Organization.entityId` of the
  `organization-changed` stream, a GUID, never our numeric id) and `contractId` = `Contract.erpId`.
  The ERP validates that the contract belongs to the customer and that its organization equals
  `organizationId`, and rejects the order otherwise.
- Lines carry `productId`, `quantity`, `priceTypeId` and no organization.
- The schema is owned by mivend and lives in the shared `@nlightn22/event-contracts` package
  (subject `mivend.orders.events.v1.order-events-value`, compatibility `FORWARD`, Confluent wire format). Procedure:
  change the schema in the package repository on a branch, review by the ERP side, publish by
  pushing to its `master`, bump the dependency here. See `docs/integration-health.md` for the
  contract drift indicator on the Outbound tab.

## Payment allocation (#206)

An ERP payment fact is applied to the named document, or to the current head of its version chain when that is
superseded, then FIFO over the counterparty's open documents in the same organization; a remainder becomes an advance.
The paid snapshot is never rewritten. Rules: `docs/payments.md`, "Payment allocation".

## Proforma invoices

Terminology (owner decision, #223): our payment request is a **proforma invoice** (the entity was named `ProformaInvoice` before
#223); "sales invoice" is reserved for the ERP's fact of sale (1C realization), which mivend never issues. It will be mirrored as a read-only, ERP-owned `SalesInvoice` (fact of
shipment) in a later task; #223 only frees the name.

- Proforma invoices (`ProformaInvoice`, one per distinct line organization) are created for the payment methods that
  need them: pay-by-proforma-invoice and online payment. Orders on deferred terms get no automatic proforma invoices:
  the ERP holds the accounting documents (sales documents after its own distribution, settlements).
- **Versions and snapshots (#206, implemented).** A proforma invoice is an immutable snapshot: number, organization,
  lines (`ProformaInvoice.lines`, with variant, quantity, prices and discounts), amount and currency at issue time.
  Per (order, organization) the content hash decides: unchanged content returns the same snapshot; changed content
  creates a new version (a new document with its own next `<order number>-NN` number, `version` + 1,
  `supersedesId`/`supersededById`) and marks the unpaid older one `superseded` (kept, never edited, cannot be paid). A
  paid snapshot stays paid and no new version is created for it: the order shows "order changed after payment,
  difference X" (current organization content minus the paid amount); no new proforma invoice is issued for the difference, it is settled through the ERP and the paid snapshot is never rewritten. An
  organization that left the order has its unpaid snapshot cancelled. Not an accounting document and not synced to
  the ERP.
- **Request on demand.** Shop `requestProformaInvoices(orderCode)` (an order of the same counterparty, including a colleague's) and Admin
  `requestProformaInvoicesForOrder(orderId)` (permission `UpdateOrder`, order visibility scope). Allowed for a placed,
  non-cancelled order on any payment form and terms; refused for a cart and for a cancelled order. Idempotent and
  serialized per order (`proformaInvoices-for-order:<orderId>` advisory lock). Checkout creates version 1 through the
  same service, so a later request with unchanged content returns it.

## Reserve and order cancellation (decided and implemented in #194)

Implemented as `OrderCancellationService` (plugin-reservation), `order.cancel-requested` (outbound) and
the `order-cancel-result` stream (inbound); the decisions are recorded here and in #194. The ERP-side facts come from
search-platform#178 (read from the 1C configuration and checked with live tests on a test order).

### Two operations

| | What it does | Who and when | In 1C |
| --- | --- | --- | --- |
| **A. Cancel the reserve** | Zeroes the reserves of an order; the order stays alive | 1C by its scheduled job at the order's "reserve until" date (`РезервДо`); mivend at its own expiry (releases its reservations) | Posting a "closing of customer orders" document |
| **B. Cancel the order** | Cancels the order and, with it, its reserves (B includes A) | The customer on request; mivend at the reserve deadline, for orders that can still be cancelled | "Mark for deletion" on the order |

Closing (A) is not a cancellation of the order. It is the routine write-off 1C runs for every order in the
end, cancelled or shipped; posting it never refuses and silently does nothing for an order with a sale.

### Cancellability (technical condition for B, from what 1C already checks)

- **Pending** (no warehouse order, no sale; `erpStatus` UNDER_APPROVAL/APPROVED or not registered yet):
  cancellable, automatically.
- **Order or sale exists** (`hasOrder`, i.e. PICKING, or any later status): refused at once with no request to a
  person. The ERP answers the same way (`ORDER_IN_PROGRESS`, `ORDER_SHIPPED`). Returns are a separate flow.
- A `REJECTED` order was never created by the ERP: an explicit cancel by the customer or staff cancels it locally
  without a cancel request (at the reserve deadline it keeps its own #204 rules).
- The server is the single source of "may be cancelled now": `Order.cancellable` (shop and admin API) is computed
  through the same decision function; both portals show the cancel button from it alone.
- No partial cancellation is modelled.

### Who may cancel (owner-decided)

| Actor | Rule |
| --- | --- |
| Customer | Cancels own order without a manager's approval, only while the order is pending |
| Manager | Same condition, through the new `CancelOrder` permission |
| System | Reserve deadline expiry, only for a pending or unregistered order |

- A paid (settled) order is not cancelled automatically: refused until a refund flow exists.
- The ERP may still cancel any order itself; its deletion mark arrives as `markedForDeletion` and is applied.

### The reserve deadline

- The deadline is one shared date. mivend sends it as `reserveUntil` in `order.confirmed` (mandatory: with an
  empty `РезервДо` the 1C job only picks an order after about four months) and the ERP writes it to `РезервДо`.
- At the deadline 1C does A and mivend does A and, for a pending or unregistered order, B. Both are idempotent
  and the order of execution does not matter. An order that is in progress or shipped is left alone: its
  reserve is already used up, and mivend follows what the ERP reports.
- Not confirmed/unregistered order: mivend cancels it locally and, if `order.confirmed` was already sent, tells
  the ERP. It no longer returns to the confirmation queue.
- Prepaid orders and the ERP-rejected reserves (#204) keep their own rules (manual intervention / their deadline).

### Signals from the ERP

- Posting the closing document does not rewrite the order, so the exchange exports **no `order-changed`** after
  any closure (live test). mivend must not wait for `order-changed` to learn that the ERP released or closed an
  order. The ERP side provides an explicit signal: a stream with the live reserve per order key, and the three
  base facts per order (warehouse order exists, sale exists, marked for deletion).
- mivend asks for B with `cancel-requested` on the order-events topic (see below); the ERP answers
  explicitly with `order-cancel-result` (`cancelled`/`rejected` with a reason). The
  `order-change-requests` stream is not used.
- A late `order.confirmed` after a cancel: a still-pending outbox row is marked `skipped`, and the ERP keeps a
  cancelled-`orderId` tombstone and rejects a late submit.
- If the ERP reports a different reserved quantity than ours, the ERP wins (#199).

### Statuses

- `erpStatus` is mivend's own; `erpOrderStatus` is the ERP's raw status. They stay separate. The three base
  facts map onto ours later (warehouse order -> assembled, sale -> shipped, waybill for delivered orders ->
  delivered, marked for deletion -> cancelled); a non-priority task.
- The customer sees a simplified status, staff a detailed one; the ERP only supplies facts.

### Order events topic and warehouse semantics (decided with the ERP side; supersedes the earlier `order.cancelled` idea)

- One topic `mivend.orders.events.v1.order-events`, message key = `orderUuid`, one subject
  `mivend.orders.events.v1.order-events-value` (JSON Schema `oneOf` discriminated by the const `type`, also sent as
  the Kafka header `type`, FORWARD, Confluent wire format). Types: `confirmed` (today's `order.submitted` plus
  `type` and a mandatory `reserveUntil`) and `cancel-requested` (`eventId`, `orderUuid`, `requestedAt`). Schema:
  `order-events.ts` in `@nlightn22/event-contracts` (0.59.0). The old `order.submitted` topic is no longer
  published (integration contour, no dual publish).
- One order = one `confirmed` event = one ERP order = one `warehouseId`; no per-warehouse split, no
  `registrationUuid`, no warehouse on lines. The answer to a cancel is `order-cancel-result` per `orderUuid`
  (`cancelled` | `rejected` with a reason); a `confirmed` after a cancel for the same `orderUuid` is not registered.
- Warehouse semantics in the ERP: the reserve is per line; the header warehouse reserves nothing, it is only the
  preferred warehouse and the source of the shipping scheme. The ERP distributes each line over warehouses by free
  stock (preferred first, then the user's warehouse group, splitting a line when one is short). We send any
  warehouse from the order's reservations. Until the ERP switches to this standard autoreserve (tracked in
  search-platform#179) the whole order is reserved at the warehouse we send.
- Products without a stock-keeping unit in the ERP are skipped from the reserve (the order still registers):
  their `reservedQuantity` is 0 and indistinguishable from "no stock" (accepted contract gap).
- `reserveUntil` is our deadline and the source of truth (ISO-8601 UTC); the ERP stores it as the order's
  "reserve until" and closes the reserve only after it, so it never releases earlier than mivend. Times coming from
  the ERP are treated as UTC only after search-platform#187 (local time labelled as UTC) is fixed.
- Which organization/storage place the ERP reserves a line at is its own distribution; mivend's per-line warehouse
  choice (most available stock) and per-product organization winner are not coordinated with it (known gap).

### How mivend cancels (implemented, #194)

- One entry point, `OrderCancellationService.cancel(orderId, reason)`, under `withAggregateLock('reserve-order:<id>')`,
  the lock `reserveOrder` and the registration-result handler take, so a cancel, a manual confirm and a late
  registration result serialize per order. `reserveOrder` refuses a cancelled order.
- Decision (pure function `decideCancellation`): already cancelled -> no-op; shipped (order/fulfillment state or
  `erpStatus` SHIPPED/DELIVERED), in progress (`erpStatus` PICKING), or a settled payment -> refused, nothing
  automatic. Otherwise: the `order.confirmed` outbox row still waiting (pending or failed) -> row marked `skipped`
  (a conditional update that loses to a publisher holding the row) and a local cancel; sent but no `erpOrderId`
  -> `cancel-requested` and a local cancel at once; registered (`erpOrderId` set, written under the lock by the
  registration result) -> `cancel-requested`, `cancelRequestedAt`/`cancelReason`/`cancelRequestStatus=REQUESTED`
  recorded, no local cancel until the ERP answers.
- `order-cancel-result` (applied under the same lock): `cancelled` -> local cancel, `CANCELLED`; `rejected` ->
  `cancelRequestStatus=REFUSED`, `cancelRefusalReason`, staff notification, the order stays (a refusal after a
  local cancel is an error notification). One `cancel-requested` per `orderUuid`: after a refusal there is no
  automatic second request.
- Local cancel: release reservations, void the authorized payment, Vendure `Cancelled` with the reason in the
  history, `ErpOrderStatusEvent` CANCELLED, staff notification (a settled payment adds a manual-refund warning).
- Reserve deadline (`ReservationExpiryService`): the same service with `requestRegistered=false`: pending or
  unregistered orders are cancelled; a registered, in-progress or shipped order gets no local action and staff
  are warned once, one day after the deadline; prepaid and `REJECTED` orders keep their own rules; an order that
  cannot be cancelled automatically returns to the confirmation queue.
- `OpenDeferredExposureService` excludes `Cancelled` orders.

### ERP order statuses (agreed with the ERP side, owner-confirmed; contract 0.60.0 consumed, the ERP side is not live yet)

The ERP publishes **facts** on `order-changed`; mivend builds its own `erpStatus` from them (the ERP does not send
our statuses). `erpOrderStatus` stays the ERP's raw `status` value, stored as received. Names are "process" names on purpose: an order has several warehouse orders and as many sales
documents, so "fully assembled / fully shipped" cannot be known until the last document and is not tracked.
Source on the ERP side: the integration-service design doc, section "order statuses on the ERP side".

Priority, highest first (the first matching fact wins):

| `erpStatus` | ERP fact (on `order-changed`) | Underlying ERP objects |
| --- | --- | --- |
| CANCELLED | `markedForDeletion` = true | deletion mark on the order; NOT `isDeleted`, which only marks a tombstone of the stream record |
| DELIVERED | `delivered` = true | all waybills of the order are completed (status "processed" or the arrival date filled, as the ERP counts); a sales document outside any route sheet (pickup) is NOT delivered by this fact |
| DELIVERING | `inDelivery` = true | the order's sales document is in a route sheet and a waybill of it is not completed (a route sheet shared with other orders and without a waybill is neither DELIVERING nor DELIVERED) |
| SHIPPING | `hasRealization` = true | at least one posted sales document of the order (linked through the deal field); pickup stays here |
| PICKING | `hasOrder` = true, no sales document yet | at least one posted outgoing warehouse order (receipt-type orders under the same order are ignored) |
| APPROVED | `status` = "Согласован" | processing-status enum value |
| UNDER_APPROVAL | `status` = "НаСогласовании" | processing-status enum value |

- `status` is the raw enum value name; the list of values is open, so consumers must tolerate unknown values. For
  retail orders without a warehouse order `status` stays "pending approval" even after a sales document is posted,
  so it never shows shipping on its own.
- The ERP's own operational-status enum/register is NOT used (under development on the ERP side).
- The exchange scope grows by warehouse orders, sales documents, route sheets and waybills; only documents of mivend
  orders are queued. All facts ship in one event-contracts version (owner decision).
- Consumption (event-contracts 0.60.0): the five facts are `optional bool`; an explicit `false` is a computed
  fact, an absent field means the producer did not compute it and never counts as `false`. `deriveOrderErpStatus`
  maps the facts to the table above; with nothing derivable `erpStatus` is left untouched.
- `erpStatus` only moves forward (PENDING < SENT_TO_ERP < RESERVED/CONFIRMED < UNDER_APPROVAL < APPROVED < PICKING <
  SHIPPING < DELIVERING < DELIVERED); CANCELLED is terminal. A repeated event is a no-op. The write is a partial
  update of `erpStatus`/`erpStatusAt` under the order's `reserve-order:<id>` lock.
- `markedForDeletion` is not a plain status write: a not-yet-cancelled order goes through the same path as an
  `order-cancel-result` "cancelled" answer (local cancel, reservations released, `CANCELLED` status event).
- The old placeholders `ASSEMBLED`/`SHIPPED` are gone: "in progress" is `PICKING`, "shipped" is
  `SHIPPING`/`DELIVERING`/`DELIVERED` in `order-cancellation.decision.ts`. `SENT_TO_ERP`/`REJECTED` are unchanged.
- Cancellation rules (who may cancel and when) are in "Cancellability" and "Who may cancel" above.

- `reservedQuantity` is the ERP's current remaining reserve of the order, not a status signal: it may be 0 (no
  reserve kept, or closed after warehouse orders exist) or still above 0 after shipment. Statuses come from the
  facts only; once a warehouse order exists (PICKING or later) a zero reserve is not reported as a mismatch.

### Still to verify with the ERP side

- Whether marking an order for deletion also zeroes its reserve in the register automatically (expected: yes,
  "two in one"); if not, B must include A explicitly.

## Historical ERP orders without a mivend `orderUuid` (decided in #215)

Orders created in the ERP before mivend existed keep arriving as `order-changed` without an `orderUuid`.
Today the consumer drops them as a `noop`. Decision: import them as real `Order` rows and mark them as external.

- **Owner marker.** `Order` gets an origin flag (`isExternal`, or `origin` = `mivend` | `erp`), set once at
  creation: an `order-changed` with no `orderUuid` and no local match by `erpOrderId` creates an external order.
  It is not derived from `orderUuid` later, so adopting the order (writing our uuid back) does not lose it.
- **Direct counterparty link.** `Order` gets its own `counterpartyId` (denormalized at creation). Visibility
  (manager scope and the customer's own list) is computed from it, not through `Order -> Customer ->
  Counterparty`. An external order needs no `Customer` (`Order.customer` is nullable).
- **Waiting only for the counterparty.** If the counterparty is not imported yet, the raw ERP id is kept and the
  order is attached when the counterparty arrives (same pending pattern as `assignedManagerId`), instead of
  retrying inside the 24 h inbox budget. No wait for a `Customer` and none for another `order-changed`.
- **Rules by owner.** External orders are read-only for mivend for now: no reserve release/matching from
  `order-changed`, no reserve deadline auto-cancel, no `cancel-requested`, no customer-facing mutations, skipped by
  customer notifications/emails that assume `order.customer`. Managing them is deliberately later.
- **Credit control: no change.** The open deferred exposure counts only mivend deferred payments not yet
  reflected in the ERP balance; external orders have no mivend payment and are already in the ERP balance.
- **Data.** `order-changed` carries the full order snapshot since event-contracts 0.62.1 (document date, currency,
  totals, VAT, line price/amount, linked documents). A historical order's `status` may be an empty string, not an error.
- **Vendure state.** Created directly in the Vendure state matching `erpStatus` (no state-machine transitions);
  an `OrderProcess` guard (same idea as `ReplicaOrderProcess`) rejects every transition of an external order.
- **Import mapping.** Customer is taken from `customerId` (`Counterparty.erpId`; `organizationId` is the seller
  organization). An empty or non-derivable status gives `erpStatus = CONFIRMED`. Quantity is converted to the
  base unit and stored in Vendure's integer line quantity (see docs/order-flow.md, fractional quantities); lines
  with an unknown product are skipped and the order total comes from `totalAmount`; such an order is flagged
  `externalLinesIncomplete` (cleared when a later event resolves every line) and the skipped count is logged.
- **Status is forward-only.** An existing external order follows the same rule as a mivend order: `erpStatus`
  and the Vendure state only advance (`canAdvanceErpStatus`), `CANCELLED` is terminal, and an event without
  status facts leaves both untouched (it still refreshes the raw status, document number and totals). A sparse
  event never clears a known counterparty or document number.
- **Branch.** The order copies `Counterparty.branchId` (also when the counterparty is attached later); a
  counterparty without a branch leaves it empty, which follows the temporary branch-less carve-out of #123.
- **Reconciliation.** Pending counterparties are also attached by a scheduled, idempotent task (and once at
  worker bootstrap), not only by `CounterpartyCreatedEvent`.
- **No access by code.** An external order has no customer, so the Shop API `order(id)` returns nothing and
  `orderByCode` is denied for it (also for anonymous callers inside the default access window); it is listed
  only through `myOrders`.
- **Visibility.** All portal users of the counterparty see its external orders (they have no author user);
  managers by the usual scope. The storefront "my orders" list shows them in the same list with a "from ERP"
  badge and a source filter, without actions (no cancel, no repeat).
- **Guards by flag.** Skip external orders in anything that assumes `order.customer`: proforma invoices, reserve, moq,
  price resolution, replication, notifications. `order-submitted` already skips an order without a customer.
- **Open for later.** Writing a mivend `orderUuid`/number back to the ERP needs a new event type
  (`confirmed` would register a duplicate) and an ERP-side change; not required for showing history.
- **Migration.** Backfill `counterpartyId` on existing orders from their customer's counterparty.

## Settlement documents (receivables history, #224)

Documents that form a customer's receivables (sales, payments, returns, corrections) arrive on two streams
(event-contracts 0.65.0): `company.customers.events.v1.settlement-document-changed` and
`company.customers.events.v1.settlement-balance-changed`. Contract source: search-platform#195.

- **Entities (ERP-owned).** `SettlementDocument` (key: the document uuid, never the number) -> `SettlementEntry`
  (one per organization/counterparty/contract triple, signed amount) -> `SettlementOrderLink` (order uuid, amount).
  Not the `documents` plugin Document and not the proforma invoice. Amounts are stored as integer minor units.
- **Idempotency.** A re-sent version replaces the whole entries array; stale versions are dropped; `isDeleted`
  voids all entries; an unknown uuid with `isDeleted` is a no-op; a cleaned document that changes again is upserted.
  Versions compare as time when both are ISO dates, as integers when both are numeric, otherwise as strings.
- **Empty entries.** A live (not deleted) document with an empty `entries` array replaces the stored entries with
  none: the document stays, with no register effect.
- **Invalid entries.** A live document with an entry missing organization/counterparty/contract or with a
  non-numeric amount is not a no-op: the inbox row fails at once with the reason (dismissable, #212).
- **Order link.** Only by the document's own `order_links`; never inferred, and never from `orderDebt`,
  `shippedQuantity` or `paidAmount`. A document without an order is valid and is shown by counterparty/contract.
- **Balance.** `SettlementBalanceChanged` per (organization, counterparty, contract) is a reconciliation fact; the
  balance is never summed from documents. Overdue aging (FIFO) is computed in mivend from `due_date` or the
  contract's payment delay (`ContractChanged.payment_delay_days`).
- **Corrected balance.** After an unposting/deletion Integration Service may send a corrected balance event that
  changes only `closing_balance` (`opening_*` stay; a triple missing from the register becomes 0). Then
  `closing = opening + sum(entries)` may temporarily not hold: `closing_balance` is authoritative, never reject or
  alert on that mismatch. Versions are monotonic per document and per triple.
- **Pending.** An entry whose contract/counterparty is not imported yet waits and is attached later. Employee and
  supplier contracts are filtered by `contract_kind`/`contract_type`/`payment_kind`.
- **Customer view.** A separate storefront section (own menu item) with balance cards (opening, current from
  `closing_balance`, overdue), type chips, filters by contract/organization/period/number, built on the standard
  ui-kit table and filters. Customer-visible types are a whitelist by `documentType`. A "Reconciliation acts" menu
  item exists with a "not implemented yet" page; acts themselves are #226.
- **Retention cleaner.** Scheduled and idempotent; removes only explicit ERP-owned rows outside the window of their
  triple (`opening_date`) plus a period set in the Vendure admin dashboard (default 12 months); never a row linked to an order or
  payment still open in mivend. A tombstone (`isDeleted`) is kept for twice that period so a late older version
  cannot resurrect it. Each run logs the count of documents whose triple has no balance fact (never removed).
- **Reconciliation.** A scheduled, idempotent task (and once at worker bootstrap) attaches pending entries and
  balances (counterparty, contract) and order links (by ERP order id or order uuid, including a mivend order
  created after the document arrived), in addition to the event-driven attach.

## Deliberately out of scope (open questions)

- Contracts with dedicated sub-limits (amount, term) inside the total credit limit, and contracts
  restricted to brands or positions. Credit limits stay counterparty-wide (see #48).
- Letting the customer choose the contract, or splitting one customer order into several ERP orders
  per contract.
- A full Seller entity with its own warehouses, offers and delivery terms (#47).
