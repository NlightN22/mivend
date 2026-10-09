# Order contracts and organizations

Decisions for how an order is tied to a customer contract and to the selling organizations.
Issues: #201, #202, #203, #205 (ERP rejection handling is #204, tracked separately).

## Two different organization concepts

| Concept                   | Where it lives                                  | Used for                                               |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| Line organization         | `OrderLine.customFields.organizationId`         | Invoices, payment split, reservations (our own split)  |
| Order (header) contract   | `Order.customFields.selectedContractId`         | `order.submitted` header: contract + contract's organization |

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
  written and in `reserveOrder()` and the `order.submitted` listener. Nobody, including a manager,
  can override it. A skipped `order.submitted` is never silent (`skipped` outbox row, shown on the
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

## `order.submitted` contents

- One event per warehouse group (not per organization).
- Header `organizationId` = the selected contract's organization (`Organization.entityId` of the
  `organization-changed` stream, a GUID, never our numeric id) and `contractId` = `Contract.erpId`.
  The ERP validates that the contract belongs to the customer and that its organization equals
  `organizationId`, and rejects the order otherwise.
- Lines carry `productId`, `quantity`, `priceTypeId` and no organization.
- The schema is owned by mivend and lives in the shared `@nlightn22/event-contracts` package
  (subject `order.submitted-value`, compatibility `FORWARD`, Confluent wire format). Procedure:
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

## Reserve and order cancellation (decided, planned in #194)

Not implemented yet; the decisions are recorded here and in #194. The ERP-side facts come from
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

- The deadline is one shared date. mivend sends it as `reserveUntil` in `order.submitted` (mandatory: with an
  empty `РезервДо` the 1C job only picks an order after about four months) and the ERP writes it to `РезервДо`.
- At the deadline 1C does A and mivend does A and, for a pending or unregistered order, B. Both are idempotent
  and the order of execution does not matter. An order that is in progress or shipped is left alone: its
  reserve is already used up, and mivend follows what the ERP reports.
- Not confirmed/unregistered order: mivend cancels it locally and, if `order.submitted` was already sent, tells
  the ERP. It no longer returns to the confirmation queue.
- Prepaid orders and the ERP-rejected reserves (#204) keep their own rules (manual intervention / their deadline).

### Signals from the ERP

- Posting the closing document does not rewrite the order, so the exchange exports **no `order-changed`** after
  any closure (live test). mivend must not wait for `order-changed` to learn that the ERP released or closed an
  order. The ERP side provides an explicit signal: a stream with the live reserve per order key, and the three
  base facts per order (warehouse order exists, sale exists, marked for deletion).
- mivend asks for B with a mivend-owned `order.cancelled` event (same ownership procedure as `order.submitted`);
  the ERP answers explicitly (accepted/refused with a reason). The `order-change-requests` stream is not used.
- A late `order.submitted` after a cancel: a still-pending outbox row is marked `skipped`, and the ERP keeps a
  cancelled-`orderId` tombstone and rejects a late submit.
- If the ERP reports a different reserved quantity than ours, the ERP wins (#199).

### Statuses

- `erpStatus` is mivend's own; `erpOrderStatus` is the ERP's raw status. They stay separate. The three base
  facts map onto ours later (warehouse order -> assembled, sale -> shipped, waybill for delivered orders ->
  delivered, marked for deletion -> cancelled); a non-priority task.
- The customer sees a simplified status, staff a detailed one; the ERP only supplies facts.

### Still to verify with the ERP side

- Whether marking an order for deletion also zeroes its reserve in the register automatically (expected: yes,
  "two in one"); if not, B must include A explicitly.

## Deliberately out of scope (open questions)

- Contracts with dedicated sub-limits (amount, term) inside the total credit limit, and contracts
  restricted to brands or positions. Credit limits stay counterparty-wide (see #48).
- Letting the customer choose the contract, or splitting one customer order into several ERP orders
  per contract.
- A full Seller entity with its own warehouses, offers and delivery terms (#47).
