# Cross-system verification pass (runbook)

Manual pass across mivend, the Integration Service and the ERP (issue #208). Run it on the
staging-integration contour after any change to order contracts, identifiers, reservation or the
ERP inbound/outbound handlers. Never from an automated suite: orders reach the real broker.

## Setup

- `make dev-staging-integration` (start it last; `make dev` can kill it). Restarting it is safe.
- The ERP exchange runs automatically while the owner has it switched on; otherwise it is started by a
  person from the ERP console. The ERP-side checks are asked from the Integration Service owner
  (order number + `orderUuid`), who reads the Integration Service database.
- Place orders with the shop API as the contour test customer (`docs/environments.md`): add items,
  `setOrderShippingMethod`, `transitionOrderToState ArrangingPayment`, `addPaymentToOrder`
  (`deferred-payment`). Pick variants with free stock in the customer's branch location and an
  organization; global "in stock" search results are not enough.
- Check state read-only in the contour database: `order` custom fields (`reservationState`,
  `erpStatus`, `erpOrderId`), `reservation`, `reservation_reconciliation_issue`, `integration_outbox`,
  `integration_inbox_event`.

## Scenarios and what to look at

| Scenario | Expected |
| --- | --- |
| Auto-reserve on placement | `RESERVED`, exactly one published `order.submitted` per warehouse, numeric order number, 1C registers one document, `erpStatus` SENT_TO_ERP, `erpOrderId` set |
| ERP reserves less than ours | Local reservation released, `QUANTITY_MISMATCH` issue recorded, `erpStatus` untouched |
| Re-confirm a submitted order | Second `order.submitted` row is `skipped`, nothing published |
| Same `eventId` redelivered | One inbox row, one customer order, one ERP document |
| New `eventId`, same `orderUuid` | New inbox row processed, still one customer order and one ERP document |
| Same registration result applied twice | State unchanged, no error (re-queue the inbox row) |
| Variant without organization | Hidden for customers, checkout transition refused; reason in `transitionError` |
| Cart with two organizations, same warehouse | One `order.submitted`; lines keep their organizations after checkout |
| Digits search | Order found by digits; the display dash is undone by the manager search only |

Also exercised, with the ERP side run by the Integration Service owner:

| Scenario | Expected |
| --- | --- |
| Over-limit deferred order | Not auto-reserved, waits for a manager; after confirm one `order.submitted` |
| Manager changes the contract | Allowed only before reservation/ERP receipt; inactive, unknown or other-counterparty contracts are refused |
| ERP rejects an order (inconsistent contract and organization) | `REJECTED` with the reason for the manager, `REJECTED` for the customer, health counter 1; a corrected re-submit registers exactly once (needs Integration Service resend-after-rejection support) |
| ERP closing document | No event reaches mivend; the order keeps SENT_TO_ERP (explicit signal is #194) |
| Undecodable message | Stored as failed with raw bytes, listed in the failures query, stream behind it keeps flowing; not replayable (no entity id) |
| Integration Service stopped, then resumed | Message published during the gap is consumed after resume exactly once |
| Schema registry unreachable | Outbox row stays pending with growing retry delay, visible on the outbox health counts; published exactly once after recovery |
| Manual confirm racing the placement auto-reserve | One winner, one active reservation, one `order.submitted`, state RESERVED |

Late registration result after a local release: the order registers, the released reservation stays released, no new reservation or difference is created.

## Known limits

- An order result for an unknown order uuid is retried within the normal inbox budget (24 hours) and
  then resolved as a no-op (#211). A genuine race longer than that budget (for example the
  Integration Service down for more than a day) is not told apart from a result for another instance.

## Pitfalls found

- Raw `pg` returns integer ids as numbers; compare them as strings with entity string ids.
- Never write a full `customFields` snapshot from a stale `Order`; update only the changed fields.
- A background tier refresh saving stale lines can erase an `ArrangingPayment` organization stamp;
  the stamp and the refresh now take the same order row lock.
- The ERP reports `reservedQuantity` 0 for products with an empty storage unit in 1C (about 16%);
  mivend treats that as "ERP wins", releases its hold and records the difference.
- A failed ERP request to break on purpose: start the contour with a shell override such as
  `INTEGRATION_SCHEMA_REGISTRY_URL=http://127.0.0.1:9 make dev-staging-integration`.
