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

## Reservation end, expiry and cancellation (decided, planned in #194)

Not implemented yet; recorded here so the decisions are not lost. Plan and open points are in #194.

- The ERP order document has its own "reserve until" attribute (`РезервДо`), and the ERP releases reserves
  by that date. The reserve register has no expiry and our current contract carries only the reserved
  quantity, so the attribute is used and exchanged: mivend sends its own reservation end as `reserveUntil`
  in `order.submitted`, and the ERP exports the date back on `order-changed` and on the registration result.
- Before the ERP registers an order, mivend owns the deadline: at expiry it **cancels** the order (it no
  longer returns it to the confirmation queue) and tells the ERP.
- Cancellation is propagated to the ERP in both cases, for an order not yet registered and for one already
  registered: mivend asks, the ERP decides and answers through `order-changed`; if the ERP refuses (for
  example already shipped), mivend follows the ERP and the order stays. mivend never cancels a registered
  order on its own authority.
- Transport: a mivend-owned `order.cancelled` event in `@nlightn22/event-contracts` (same ownership procedure
  as `order.submitted`), turned by the ERP integration into a narrow cancellation command. Not the
  `order-change-requests` stream (it reconciles the state of an already registered order).
- Race (a late `order.submitted` after our cancel): a still-pending outbox row is marked `skipped`, and the
  ERP keeps a cancelled-`orderId` tombstone and rejects a late submit.
- If the ERP reports a different reserved quantity than ours, the ERP wins (#199): our reservation follows it
  and the difference is only recorded for staff.
- The ERP release is a scheduled job (`АвтоматическоеЗакрытиеЗаказовПокупателей`): it picks orders whose
  `РезервДо` is earlier than yesterday and posts a "closing of customer orders" document, and posting it
  releases the reserve in the register (the order itself is not changed). Our orders have an empty
  `РезервДо` today, so the job never selects them: sending `reserveUntil` is what makes it work.
- Cancelling a registered posted order is most likely the same closing document; a separate manual cancel
  flow is still to be checked on the ERP side.

## Deliberately out of scope (open questions)

- Contracts with dedicated sub-limits (amount, term) inside the total credit limit, and contracts
  restricted to brands or positions. Credit limits stay counterparty-wide (see #48).
- Letting the customer choose the contract, or splitting one customer order into several ERP orders
  per contract.
- A full Seller entity with its own warehouses, offers and delivery terms (#47).
