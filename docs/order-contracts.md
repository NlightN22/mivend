# Order contracts and organizations

Decisions for how an order is tied to a customer contract and to the selling organizations.
Issues: #201, #202, #203, #205 (ERP rejection handling is #204, tracked separately).

## Two different organization concepts

| Concept                   | Where it lives                                  | Used for                                               |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Line organization         | `OrderLine.customFields.organizationId`         | Invoices, payment split, reservations (our own split)  |
| Order (header) contract   | `Order.customFields.selectedContractId`         | `order.confirmed` header: contract + contract's organization |

- The line organization comes from the product: one storage location = one product = one
  organization (`ProductVariant.customFields.organizationId`, winner election in
  `StorageLocationStreamHandler`, per-location rows in `storage_location_assignment`).
- The ERP registers an order under one contract of the customer. The order document has a header
  organization bound to that contract, and each line carries its own organization that the ERP
  distributes itself from the storage location. That distribution later splits the order into
  separate sales documents and settlements inside the ERP. We do not send or imitate it.
- We split on our side too: one invoice per distinct line organization in the cart (one cart with
  three organizations gives three invoices), created at cart confirmation, independent of the
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

## Invoices

- Invoices (`Invoice`, one per distinct line organization) are created for the payment methods that
  need them: pay-by-invoice and online payment. Orders on deferred terms get no automatic invoices:
  the ERP holds the accounting documents (sales documents after its own distribution, settlements).
- A customer who needs a document to pay against requests a **proforma payment invoice**: an
  immutable snapshot (number, organization, lines, amounts), idempotent per order content, a new
  version when the order changed, the older unpaid one marked superseded, a paid one never rewritten
  (a later difference is shown on the order and settled through the ERP). Not an accounting document
  and not synced to the ERP. Tracked in #206 together with the question of system-level versioning.

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

- **Pending** (no warehouse order, no sale): cancelled automatically. The same applies to an order the ERP
  has not registered yet.
- **In progress** (a warehouse order exists, no sale): no programmatic cancel. The customer's button becomes a
  request to a person (manager/operator); not automated now.
- **Shipped** (a sale exists): final, no cancellation of any kind. No partial cancellation is modelled: once any
  sale is posted the order is shown as shipped, by what that sale contains.

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
  `erpStatus` SHIPPED/DELIVERED), in progress (`erpStatus` ASSEMBLED), or a settled payment -> refused, nothing
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

### ERP order statuses (agreed with the ERP side, owner-confirmed; contract + exchange change is sp#189, not live yet)

The ERP publishes **facts** on `order-changed`; mivend builds its own `erpOrderStatus` from them (the ERP does not
send our statuses). Source on the ERP side: the integration-service design doc, section "order statuses on the ERP side".

| mivend state | ERP fact (on `order-changed`) | Underlying ERP objects |
| --- | --- | --- |
| Under approval | `status` = "pending approval" | processing-status enum value |
| Approved | `status` = "approved" | processing-status enum value |
| Assembled (in progress) | `hasOrder` = true, `hasRealization` = false | a posted warehouse order based on the order |
| Shipped | `hasRealization` = true | a posted sales document of the order (the order is linked to it through the deal field, through the warehouse order, or through the transfer of goods; the ERP uses its native method, not the deal field alone) |
| Cancelled | `markedForDeletion` = true (wins over the others) | deletion mark on the order; NOT `isDeleted`, which only marks a tombstone of the stream record |
| Delivered | **not decided** | route sheet -> waybill with a "completed" flag exist in the ERP; whether to add `inDelivery`/`delivered` is open |

- `status` is the raw enum value name; the list of values is open, so consumers must tolerate unknown values.
- The ERP's own operational-status enum/register is NOT used (under development on the ERP side).
- The exchange scope grows by warehouse orders and sales documents; only documents of mivend orders are queued.
- Cancellation rules (who may cancel and when) are derived from these facts and are fixed in a separate section once
  the facts are live.

### Still to verify with the ERP side

- Whether marking an order for deletion also zeroes its reserve in the register automatically (expected: yes,
  "two in one"); if not, B must include A explicitly.

## Deliberately out of scope (open questions)

- **Historical ERP orders without a mivend `orderUuid`** (created in the ERP by managers before mivend
  existed): the ERP keeps sending `order-changed` for them. mivend does not need them now; they will be needed
  so customers can view their own historical documents. No decision yet on linking them to customers/orders.
  Until then the consumer ignores an `order-changed` without an `orderUuid` that matches no local order
  (`erpOrderId`) as a `noop` at once, with the reason recorded; one carrying an unknown `orderUuid` still retries
  within the usual 24 h budget (#211).

- Contracts with dedicated sub-limits (amount, term) inside the total credit limit, and contracts
  restricted to brands or positions. Credit limits stay counterparty-wide (see #48).
- Letting the customer choose the contract, or splitting one customer order into several ERP orders
  per contract.
- A full Seller entity with its own warehouses, offers and delivery terms (#47).
