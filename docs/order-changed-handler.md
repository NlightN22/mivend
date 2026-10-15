# order-changed handler notes

Handler: `packages/plugins/erp-integration/src/handlers/order-changed.handler.ts` (issues #110, #72, #215).

## What it does

- Applies the `erp.order.events.v1` event of type `changed`. It reports the order's CURRENT state and fires
  repeatedly over its life (a snapshot, not a diff, like every other stream in this plugin).
- The handler only decodes the payload and resolves each line's ERP `productId` to a Vendure variant id. Order
  correlation, status/contract persistence and the release/quantity-match decision live in
  `ReservationWriteOffSyncService.handleOrderChanged` (reservation plugin).
- An order with no `orderUuid` and no local match becomes an external order (#215, see `order-contracts.md`).
- `isDeleted` is a legitimate no-op here, not a missing-dependency retry. `=== true` is correct for both the old
  plain bool and the current `optional bool` shape.

## Status

- `status_code` (field 38, sp#200) is the ERP-computed status and the only status input. The facts `hasOrder`,
  `hasRealization`, `markedForDeletion`, `inDelivery`, `delivered` stay on the contract for other consumers and are not read.
- A code that is absent from the order status dictionary throws `MissingDependencyError`. There is no special
  case for any code (including `CANCELLED`): the dictionary is data and mivend's own rows are provisioned at boot.
- Retry is bounded by the shared inbox policy (#145): backoff per attempt, and the row is dead-lettered to
  `failed` after 24 hours from its first failure. Failed rows are what the Integration health page and its
  alert count, and they can be replayed or dismissed (#212). Other events are not blocked meanwhile.
- The ERP time of a status change is `updated_at` (fallback `occurred_at`); stored as `occurredAt` for external orders. Mivend orders still use the write time (reservation plugin follow-up).
- The order's `erpStatusAt` custom field takes the same event time (write time only when the event has none).
  History is listed by `occurredAt`, but `previousStatus` is the status written just before in write (id) order, so
  an out-of-order event shows a previous status that is newer in time.
- `documentNumber` (15) refreshes `erpRegistrationDocumentNumber`; stale events are dropped upstream by the inbox
  version check.

## Deliberately not consumed

- Per-line `appliedDiscountAmount` / `priceTypeId` and `comment`: no feature reads them yet (#101/#108).
- Header `customerId` / `organizationId` / `warehouseId` for mivend orders: they are known locally from the Order.
  For an external order `customerId` is the counterparty. Per-line `quantity` (ordered, as opposed to
  `reservedQuantity`) has no consumer; only `reservedQuantity` feeds reservation tracking.

## Field presence

- `reservedQuantity` is a plain proto3 double: absent means 0 (a zeroed line), not malformed. Only an empty
  `productId` is a malformed line.
- `contractId`, `orderUuid`, `documentNumber`, `status_code` are `optional`: absent means not sent.
- An unresolved variant for a mivend order retries as a missing dependency (product stream not consumed yet).
  An unknown unit is read as the base unit, never retried.
