# Order flow: placement → reservation → confirmation

This document exists because a live incident showed the manager portal had no shared
understanding of what "order confirmation" means, and no design doc described the order
lifecycle end to end. It captures what's actually implemented today, researched industry
patterns, and the target architecture agreed with the client before implementing a
role-specific "orders awaiting confirmation" view for Manager/Operator (see AGENTS.md →
Manager portal rules).

**Status: stages 1–6 implemented and verified (`make lint`/`make test`/plugin builds/integration
tests all green). Only stage 7 (deliberately deferred, no target date) remains.** See
"Progress" below for what each stage actually built.

**Progress**: stages 1–2 of "Implementation order" are done — `Reservation` entity carries
`stockLocationId`/`reservationGeneration`/`creationMethod`/`confirmedByAdministratorId`, a
partial unique index enforces at most one active reservation per order line + stock location,
`Order.customFields.reservationState` exists, and `ReservationService.reserveOrder()` is the
single concurrency-safe (`StockLevel` row locking), idempotent, full-order-only entry point;
`confirmOrder()` is now a thin wrapper over it.

Stage 3 is also done — `ConfirmOrder` permission (covers confirm + release, granted to
operator/manager/general-director/portal-admin), an `OrderPlacedEvent` subscriber sets
`reservationState = AWAITING_CONFIRMATION` for non-prepaid orders (via the new
`PaymentMethod.customFields.paymentClassification`, pulled forward from stage 4 since it was
needed for correct eligibility), `expireDueReservations()` now also returns an order to
`AWAITING_CONFIRMATION` on expiry (a real gap found during this stage — it previously only
flipped `Reservation.status`), and the manager portal's `OrdersPage.vue` got a new "Awaiting
confirmation" chip plus a first, reusable URL-sync composable
(`packages/manager/src/composables/useUrlSyncedState.ts`) retrofitting the whole page per
AGENTS.md's Manager portal rules. `ReservationPanel.vue`'s confirm/release buttons are now
gated on the `ConfirmOrder` permission in the UI too.

Stage 4 is also done — `PaymentMethod.customFields.reservationTtlDays` override (falls back to
30 days PREPAID / 7 days non-prepaid), an `OrderStateTransitionEvent` subscriber
(`fromState === 'ArrangingPayment'` → `PaymentAuthorized`/`PaymentSettled`, mirroring Vendure's
own `DefaultStockAllocationStrategy` guard) auto-reserves PREPAID orders via the same
`reserveOrder()`. Manual path's stale TTL default corrected 3→7 days to match. Prepaid
reservations that expire without release are never silently freed — flagged once via
`Reservation.interventionFlaggedAt` + `Logger.warn` (a real notifications surface is tracked as
[#42](https://github.com/NlightN22/mivend/issues/42), not built here). Note:
`online-stub`/`offline-terms` still need `paymentClassification` set via the native Admin UI
(port 3000) before auto-reserve actually distinguishes prepaid orders — until then all orders
correctly-but-unhelpfully enter the manual confirmation queue.

Stages 5–6 are also done:

- **1C outbox** — `plugin-reservation` publishes `ReservationConfirmedEvent`/
  `ReservationReleasedEvent` (never touches RabbitMQ/outbox directly, per AGENTS.md sync
  rules); a new `ReservationConsumer` in `plugin-sync` writes `reservation.created`/
  `reservation.released` to `sync_outbox` (`target: 'erp'`), keyed by `Reservation`'s
  `erpOperationId`/`erpReleaseOperationId` (two distinct stable ids — reusing one across both
  commands would collide on `sync_outbox`'s unique `eventId`). `packages/shared/src/sync.ts`'s
  `ReservationCreatedPayload`/`ReservationReleasedPayload` gained `orderCode` so 1C can
  correlate the command with its own document. Inbound: 1C's existing
  `POST /erp/callback/order-status` → `ErpOrderStatusEvent` is now also consumed by
  `plugin-reservation` — `RESERVED`/`CONFIRMED` sets `Reservation.erpConfirmedAt`;
  `CANCELLED` releases the local hold (1C wins conflicts, per this project's explicit
  decision). Filed [#43](https://github.com/NlightN22/mivend/issues/43) — the general gap that
  most other `SyncEventSchema` event types still have no real outbound producer
  (`order.consumer.ts`'s `OrderReadyForErpEvent` handler is still a stub); this round only
  fixes it for reservations, as a template.
- **MOQ** — new `packages/plugins/moq` (`ProductVariant.customFields.multiplicity`, populated
  from 1C via `erp-import`'s `product.handler.ts`) enforces pack-size via Vendure's own
  `OrderInterceptor` extension point (`willAddItemToOrder`/`willAdjustOrderLine`) — covers the
  shop API and the admin draft-order flow in one hook. `reserveOrder()` re-validates the same
  rule as defense in depth. The manager portal's Catalog table still shows a hardcoded `1` for
  multiplicity — it renders via Vendure's Elasticsearch-backed `search` query, which doesn't
  expose arbitrary `customFields`; wiring it in would need a search-index mapping change, out
  of scope for this round.

`ReservationService` was split into six focused services during this round
(`ReservationService`, `ReservationPaymentService`, `ReservationExtensionService`,
`ReservationErpSyncService`, `ReservationExpiryService`, `ReservationAvailabilityService`) to
stay under AGENTS.md's ~300-line guideline.

Stage 7 (trusted-customer auto-confirm, partial reservation) stays explicitly deferred per the
doc — no work started, none planned until real usage data exists.

## Current state (as implemented)

- Vendure's order state machine is unmodified — no custom `OrderProcess`, no state named
  "awaiting confirmation." Orders use Vendure's standard states.
- **"Confirm" only exists as a manual staff action**: `ReservationService.confirmOrder`
  (`packages/plugins/reservation/src/reservation.service.ts`) creates one `Reservation` row
  per order line (soft stock hold, TTL = `reservationDays`). It does **not** transition
  `Order.state`, and it does **not** touch Vendure's own `stockAllocated` — the two
  mechanisms currently have no defined relationship, which is a real gap (see "Two-stage
  reservation model" below).
- Stock allocation is otherwise untouched — no `StockAllocationStrategy` customization ties
  reservation to payment state yet.
- The storefront shows only fuzzy stock tiers (low/medium/high/none) to customers — never
  exact free-stock numbers.
- Pack-size/multiplicity (MOQ) is **not enforced anywhere** — confirmed gap.
- Price/discount/credit-term deviations are already gated by the `approval-workflow` plugin
  — a separate concern from stock reservation, out of scope here.

## Researched patterns (industry practice)

**ATP (Available-to-Promise)**: mature systems track on-hand, allocated/reserved, and free
(ATP) stock as distinct numbers. Customer-facing fuzzy tiers should be computed from ATP, not
raw on-hand.
[ShipBob](https://www.shipbob.com/blog/available-to-promise/)

**Three reservation-trigger patterns**: reserve-on-payment (Vendure's own default,
`DefaultStockAllocationStrategy` on `PaymentAuthorized`/`PaymentSettled`), reserve-on-
placement (short TTL, higher hoarding risk), reserve-after-manual-confirm (recognized B2B
wholesale pattern — matches this project's non-prepaid path).
[Vendure stock-control](https://docs.vendure.io/guides/core-concepts/stock-control/)

**Oversell mitigation under fuzzy visibility**: atomic compare-and-set against free stock at
the reservation-write step (not real-time exact-number display to the customer), short hold

- release-on-timeout.
  [Redis inventory reservation](https://redis.io/tutorials/inventory-reservation-in-real-time-with-redis/)

**Pack-size/MOQ enforcement**: standard practice enforces at product-page stepper, cart, and
server-side checkout — server-side is non-optional. Ask the customer to correct; don't
silently round on B2B orders.

**Vendure-native building blocks** (don't reinvent): `stockOnHand`/`stockAllocated` per
`StockLocation`, `DefaultStockAllocationStrategy`, `StockLocationStrategy`. Vendure has no
built-in TTL/expiring-reservation or ERP "pending reconciliation" concept — that part is
genuinely custom to this project (`plugin-reservation`).

## Business constraints (from the client)

- Prepaid orders should auto-reserve stock immediately.
- Non-prepaid orders require manual staff confirmation before reservation — this _is_ "order
  confirmation" in this business.
- ERP-side (1C): reservation transitions the order to "на согласование" (pending
  reconciliation) in 1C; reservation TTL is set at that same transition.
- After reservation, credit-limit/price/discount checks apply via the existing
  `approval-workflow` plugin — out of scope here.
- Completed/cancelled orders never re-enter "awaiting confirmation."

## Target architecture (agreed direction)

### One source of truth for free stock — two-stage reservation model

Do not let the same unit of stock be counted as reserved by both `Reservation` and Vendure's
own `stockAllocated` without an explicit conversion rule between them.

- **`Reservation`** — temporary business hold. Created before actual fulfillment; has a TTL;
  can expire or be released; drives the confirmation queue. Records: who confirmed, created
  at, expires at, creation method (auto/manual), stock location, quantity, ERP-sync state.
- **`stockAllocated`** — Vendure's own final commitment, created when the order is finally
  accepted into fulfillment. Must not double-decrement ATP alongside an active `Reservation`
  for the same units — the conversion from `Reservation` → `stockAllocated` must be atomic
  (single transaction).

**ATP formula (decided)**: `ATP = stockOnHand - stockAllocated - activeReservations`. No
`safetyStock` term — confirmed not needed for this business.

### Single reservation service, two triggers

One transactional method, e.g. `ReservationService.reserveOrder()`, handles the actual
stock-check + reservation-write for **both** paths:

- **Prepaid** — an `EventBus` listener (or custom `StockAllocationStrategy`) on
  `PaymentAuthorized`/`PaymentSettled` calls `reserveOrder()` automatically. Must be
  idempotent: a repeat event, or the `PaymentAuthorized` → `PaymentSettled` transition, must
  never create a second reservation for the same order.
- **Non-prepaid** — `confirmOrder()` (existing, staff-facing) becomes a thin wrapper:
  permission check, record who confirmed, then call the same `reserveOrder()`.

This guarantees identical stock-safety behavior regardless of which path triggered the
reservation — no divergent logic between "automatic" and "manual."

**Payment classification (decided)**: don't infer prepaid/non-prepaid by matching a payment
handler's name in a switch statement. Add `PaymentMethod.customFields.paymentClassification`
(string, one of `PREPAID` / `CREDIT` / `OFFLINE_TERMS`) — configured per payment method in
the **native Vendure Admin UI (port 3000)**, same as the TTL field above. Pre-filled defaults
for this project's two existing handlers (`apps/server/src/payment-method-handlers.ts`):
`online-stub` → `PREPAID`, `offline-terms` → `OFFLINE_TERMS`. Both classifications resolve to
"non-prepaid" for reservation purposes except `PREPAID` itself.

### Concurrency safety

Stock check + reservation write must be atomic — never read-then-check-then-write as
separate steps (two concurrent orders can both read the same free-stock number). Use a DB
transaction with row locking (`SELECT ... FOR UPDATE`) or an atomic conditional `UPDATE`,
with retry on conflict. Postgres-level transactional correctness is sufficient for this
project's scale — do not introduce Redis solely for this; it's already used for
BullMQ/sessions but is not a requirement for atomic stock reservation here.

### Reservation state (separate from `Order.state`)

Track reservation state as its own field, not folded into Vendure's order state machine —
order lifecycle, reservation, commercial approval, and ERP sync are four separate concerns;
merging them into one state machine multiplies combinations fast. States needed for the
full-order-only, synchronous model described above:

`NOT_REQUIRED | AWAITING_CONFIRMATION | RESERVED | EXPIRED | RELEASED | FAILED`

(Deliberately excludes `RESERVING`/`PARTIALLY_RESERVED` from an earlier draft of this
recommendation — the reservation write is synchronous/atomic, so there's no meaningful
"in-progress" state to observe, and partial reservation is explicitly out of scope for stage
1 per "Full-order-only reservation" below.)

The manager-portal UI can compute and show a combined business status from `Order.state` +
payment state + reservation state + approval state + ERP-sync state, without needing a
single unified state machine underneath.

### "Awaiting confirmation" queue definition

Query directly on `reservationState = AWAITING_CONFIRMATION` (a stored/computed field) rather
than reconstructing the condition from several indirect signals (no active `Reservation` AND
not `Cancelled`/`Delivered` AND non-prepaid AND not already being processed, etc.) every time
the queue is rendered — more reliable and matches this project's existing "push filtering
into a real, queryable field" convention (see `AGENTS.md` → Pagination section's
`DiscountRegistryEntry` precedent for the same reasoning).

### Full-order-only reservation (stage 1)

Reserve the whole order or nothing: if any line can't be fully reserved, the operation
doesn't proceed, any reservations already written within that attempt roll back, and the
staff member sees exactly which lines failed and why. Partial reservation (splitting an
order, waiting on partial restock) is a real feature but adds significant complexity
(commercial re-approval on a changed order, 1C integration complexity) — defer until there's
a confirmed business need for it.

### TTL (decided)

Defaults: **30 days for prepaid**, **7 days for non-prepaid**. Configurable, not hardcoded —
stored as `PaymentMethod.customFields` (`reservationTtlDays`, nullable int; falls back to the
30/7 default per classification when unset) so it's editable per payment method in the
**native Vendure Admin UI (port 3000)** — Vendure's admin-ui auto-renders customFields for
`PaymentMethod` out of the box, no bespoke Angular admin-ui-plugin extension needed for this.
Per-channel/per-customer-segment overrides are not needed for stage 1.

**On expiry**:

- Non-prepaid: reservation → `EXPIRED`, stock returns to ATP, order returns to the
  `AWAITING_CONFIRMATION` queue — requires a fresh confirmation (re-check stock and, if
  needed, commercial conditions).
- Prepaid: do **not** silently release a paid customer's stock. Use a longer TTL for this
  path, and on expiry move to a distinct "needs intervention" state with a task/notification
  for staff, rather than auto-releasing.

### Idempotency

`reserveOrder()` must be safe to call more than once for the same intent. Suggested
uniqueness key: `orderId + orderLineId + stockLocationId + reservationGeneration`, with at
most one active reservation per order line + stock location at a time.

### 1C integration — outbox, not a shared transaction

Reservation-write (local DB) and the 1C status transition cannot be one transaction across
two systems. This project already has a hard rule for this exact situation (`AGENTS.md` →
Sync rules): write to `sync_outbox` in the same local transaction as the reservation, and let
a separate worker deliver the ERP command, retrying with backoff, never silently dropping a
failure. Each command needs a stable `reservationOperationId` so 1C can safely receive the
same command twice without creating a duplicate document/reservation.

**On 1C unavailability**: keep the local reservation active (don't cancel it just because the
ERP is briefly unreachable), queue the outbound command for retry, surface an "ERP sync
error" status to staff, and only escalate to a task/notification after a configured retry
limit — releasing stock on a transient sync failure risks reselling something already
promised to a customer.

### Commercial approval stays a separate step, after reservation

Reserve first (so the item can't be sold to someone else while under review), then run
credit-limit/price/discount checks via the existing `approval-workflow` plugin. If rejected,
release the reservation. Tradeoff: a rejected order holds stock for its review window — keep
that TTL tight and monitor slow-to-approve orders separately, rather than reordering the
steps.

### Pack-size / MOQ

Independent of the reservation work above. `multiplicity` (already a visible field in the
manager Catalog table) is the single source of truth — the current dev/seed data is a
placeholder only; real ERP-sourced `multiplicity` values are confirmed correct once 1C
integration is live, so no separate data-audit step is needed before enforcing validation.
Normalize: null/0/negative = data error, `1` = no constraint, `>1` = required step. Enforce
server-side at every mutation point that can change order quantity (add line, update
quantity, checkout, order-confirm, API-driven changes) — this is the one point that's
non-optional; product-page/cart-level checks are UX sugar on top, not a substitute. Don't
auto-round silently.

**Only some SKUs are constrained — this is intentional, not a partial implementation.** In 1C,
a package multiplicity only applies to items whose default sales unit of measure
("Ед. изм. для продажи по умолчанию") is itself a package (a screenshot from the client showed
this: a boxed item has a "упак" unit with a quantity coefficient, e.g. 20 pcs/pack; most items
have no such package unit and sell by piece with no constraint). `multiplicity` is nullable for
exactly this reason: **1C should only send it for items that actually have this default
package sales unit set**, as the single resolved coefficient (e.g. `20`), not as the two raw
1C fields (default sales UoM + package coefficient) separately — omit the field entirely for
everything else. See `ProductRecordDto.multiplicity`'s Swagger description
(`packages/plugins/erp-import/src/dto/records/product-record.dto.ts`) for the exact contract
given to 1C's integrators — that description is the source of truth for the ERP side, keep it
in sync with this paragraph if either changes.

### Permissions

A `ConfirmOrder` permission (covers confirm + release — one staff action from the operator's
perspective), grantable to Manager/Operator/Administrator, checked in the UI, the resolver,
and the service layer (never rely on hiding a button). A separate, more restricted
permission (e.g. `ForceReserveOrder`) for overriding a stock shortfall — don't grant this to
regular Manager/Operator by default. Start with these two; only split further
(view-only/extend-TTL/resend-to-ERP as distinct rights) if a real need for that separation
shows up — this project's existing permission model grants by meaningful capability, not by
maximal upfront granularity.

### Audit (decided)

Reuse Vendure's own `HistoryEntry` mechanism (surfaced via `ReadEntityHistory`) instead of
building a bespoke audit table — write a `HistoryEntry` on the `Order` for each reservation
lifecycle event (created, confirmed, released, expired, force-overridden, ERP-sync result),
carrying line/SKU/location/quantity/ATP-at-the-time/acting-user/reason in its `data` payload.
Visible directly in the native Vendure Admin UI's order history timeline (port 3000) — no
new manager-portal UI needed for this to be inspectable.

### EventBus usage

Fine for triggering `reserveOrder()` after a payment event, for outbox event creation, for
audit/notifications/analytics. Do **not** rely on `EventBus` alone as the stock-safety
guarantee — the actual reservation check-and-write must be a synchronous transactional
service call, not something inferred purely from an event having fired.

### Error handling

Return structured errors, not a generic "confirmation failed" message: error code (e.g.
`INSUFFICIENT_STOCK`, `RESERVATION_ALREADY_EXISTS`, `ORDER_NOT_ELIGIBLE`,
`INVALID_MULTIPLICITY`, `PAYMENT_NOT_CONFIRMED`, `ORDER_ALREADY_COMPLETED`,
`ERP_SYNC_FAILED`, `CONCURRENT_RESERVATION_CONFLICT`) plus line/SKU/required-qty/available-
qty/location context, so the manager-portal UI can show exactly what's wrong per line.

## Deferred (not stage 1)

- Trusted-customer auto-confirm (skip manual confirmation for established, low-risk
  non-prepaid customers) — a real, likely-valuable idea, but deliberately deferred until the
  core manual/auto path is stable and there's usage data to define real criteria (no overdue
  debt, sufficient credit limit, account age, no cancellation history, order value under a
  threshold, no scarce SKUs, no price/discount deviations). Design `reserveOrder()`'s trigger
  parameter now to accept a `manual | auto-prepaid | auto-trust-rule` reason, even though only
  the first two callers exist yet — keeps this extension point open without building the
  unused rule engine today.
- Partial reservation, automatic order-splitting, multi-warehouse reservation.

## Decisions (resolved 2026-07-15)

- Payment classification: `PaymentMethod.customFields.paymentClassification`
  (`PREPAID`/`CREDIT`/`OFFLINE_TERMS`), configured in the native Vendure Admin UI (port
  3000). Pre-filled: `online-stub` → `PREPAID`, `offline-terms` → `OFFLINE_TERMS`.
- TTL: 30 days (prepaid) / 7 days (non-prepaid) default, overridable per payment method via
  `PaymentMethod.customFields.reservationTtlDays`, same native Admin UI.
- `safetyStock`: not needed — dropped from the ATP formula.
- Audit: reuse Vendure's `HistoryEntry`/`ReadEntityHistory` — no new audit table.
- `multiplicity` data: will arrive correctly once 1C integration is live; current seed data
  is a placeholder only — no separate data-cleanup step needed before enforcing validation.

## Implementation order

Follow the staged rollout from "Recommended sequence" implicit above: (1) data model —
`Reservation`/`stockAllocated` relationship, ATP formula, reservation-state field; (2) single
`ReservationService.reserveOrder()` with concurrency-safe write + idempotency; (3) manual
confirmation path (`ConfirmOrder` permission, `AWAITING_CONFIRMATION` queue, manager-portal
UI); (4) automatic prepaid path (`PaymentMethod` customFields, `EventBus` listener); (5) 1C
outbox integration for the reservation → "на согласование" transition; (6) pack-size/MOQ
server-side validation; (7) deferred items (trusted-customer auto-confirm etc.) only after
the above is stable.
