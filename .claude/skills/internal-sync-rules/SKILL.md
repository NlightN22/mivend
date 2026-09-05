---
name: internal-sync-rules
description: Mandatory rules for hub↔branch synchronization inside mivend itself (plugin-sync, RabbitMQ) — order/reservation replication, conflict resolution, CQRS event streams per concern. Read before writing or changing code in plugin-sync, any ReplicaOrderInterceptor/ReplicaOrderProcess-adjacent code, or anything that mutates an Order/Reservation that could also be touched by another instance.
---

# Internal sync rules (hub ↔ branch, RabbitMQ)

This covers sync **between mivend's own instances** — central hub and branch, over RabbitMQ
(`plugin-sync`). For the external boundary with Integration Service/Kafka or any other outside
system instead, see the `external-integration-rules` skill.

**Messaging invariants — non-negotiable, apply here and to the external boundary alike:**
outbox pattern is mandatory (write to an outbox table in the same DB transaction as the business
data, never send directly); every consumer must be idempotent (unique index on `eventId`, not
just an application-level check); ack only after the local DB transaction commits, never before;
no silent drops (log, retry with backoff, dead-letter after bounded attempts — a `try/catch` that
swallows a sync error is forbidden).

Full design: `docs/architecture.md`, `docs/sync.md`.

## Ownership

**`plugin-sync` owns RabbitMQ (hub↔branch) — nothing else touches this transport.** Other
plugins publish to Vendure's `EventBus`; `plugin-sync` subscribes and handles the hub↔branch
RabbitMQ transport. No other plugin imports from `plugin-sync` or references RabbitMQ directly.

**Reservations sync Branch → Central only.** Branch is the source of truth; the hub aggregates
for reporting. Reservations never flow from hub back to branches.

## Order conflict resolution — origin always wins

**An order's originating instance always wins — a replica is read-only for real users.** Never
resolve an order conflict by last-write-wins/timestamp comparison: real delivery delay under
backoff means "arrived last" ≠ "happened last," and `Order.state` is an FSM, not an
independently-mergeable field. See `docs/architecture.md`'s "Orders: direction follows the
instance of origin" for the full reasoning. `ReplicaOrderInterceptor`/`ReplicaOrderProcess`
(`packages/plugins/sync/src/replica-order.guard.ts`) enforce this — do not bypass or weaken them
to let a non-owning instance mutate an order directly.

## Order as a read-model — independent event streams per concern (CQRS)

A cross-instance fact about an order that can legitimately be witnessed by a non-owning instance
(payment, reservation, approval, ERP status, and any future one) is its own independent event
stream — never a direct mutation of another instance's order, and never folded into
`order.updated`'s payload. See `docs/architecture.md`'s "Order as a read-model: independent event
streams per concern (CQRS)" for the full principle and worked examples
(`ReservationConfirmedEvent`, `ApprovalRequest`, `ErpOrderStatusEvent`, `payment.recorded`). The
owning instance applies a fact for real, through the normal Vendure APIs; every other instance
applies it as an informational `customFields` projection only.

**Known limitation**: a replica can't be driven into a Payment/Shipping-gated state. **Still
open**: general order conflict resolution beyond "origin wins"; bidirectional reservation sync
(branch→central only today).

## Testing — never against a real cross-instance RabbitMQ round trip in unit tests

Same principle as `external-integration-rules`: unit tests mock the RabbitMQ transport boundary.
Integration/component tests may use a real RabbitMQ (via `make test-int`'s dev infra), but always
within the local contour's own seeded data — see `docs/environments.md`. Run the `test-design`
skill before writing or changing any test here, per AGENTS.md's Testing requirements.
