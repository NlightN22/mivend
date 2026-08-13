# Sync architecture

Data exchange between hub, branches, and the legacy ERP.

**Target direction (decided, not yet implemented — see
`docs/ai/1c-integration-service-decision.md`):** the central hub no longer talks to the legacy
ERP directly. A separate Integration Service (its own project, not part of this monorepo) owns
the ERP-facing side of the exchange and exchanges data with this repo over Kafka **in both
directions** — inbound entity events (catalog/prices/stock) and outbound business events
(order-registration, reservations, payment confirmations) alike. There is no synchronous RPC
channel in the target design — see "Why Kafka both ways, not Kafka + RPC" below. The sections
below describe both the current, still-live direct-ERP-adapter shape and the target shape — read
`1c-integration-service-decision.md` before changing anything in `plugin-sync`/`erp-import`.

---

## Topology

Current (still live):

```
[Legacy ERP]
     ↕ HTTP adapter (plugin-sync, central only)
[Central Hub]
     ↕ RabbitMQ (cloud, durable queues)
     ├── [Branch A]
     ├── [Branch B]
     └── [Branch ...]
```

Target (decided, not yet implemented):

```
[Legacy ERP]
     ↕ (owned entirely by Integration Service — this repo never talks to the ERP)
[Integration Service]           ← separate project, not part of this monorepo
     ↕ Kafka, bidirectional (inbound: catalog/prices/stock; outbound: order-registration,
        reservations, payment confirmations — each topic schema-registered by its own producer)
[Central Hub]
     ↕ RabbitMQ (cloud, durable queues)
     ├── [Branch A]
     ├── [Branch B]
     └── [Branch ...]
```

### Why Kafka both ways, not Kafka + a synchronous RPC channel

An earlier pass at this document had the central hub using Kafka for inbound events and a
synchronous RPC channel (tRPC, mirroring Integration Service's own internal stack) for outbound
commands/queries. That was based on a partial reading of Integration Service's own design and
was wrong: their own architecture already routes outbound business commands (order-registration,
reservations, payment confirmations) through Kafka too — the hub publishes a business event
(e.g. `OrderSubmitted`), Integration Service's own consumer turns it into a durable outbound
command, delivered to 1C on 1C's own regulated-job PULL/ACK cycle. A synchronous RPC channel is
reserved there only for genuinely rare cases needing an immediate real-time answer (e.g. a
credit-limit check at order time) — explicitly not the default transport, and not needed for
anything in this repo's current scope. Adopt the same default here: **one transport
(Kafka, bidirectional) for the whole exchange**, not two, until a concrete case is identified that
actually cannot tolerate the regulated-job cycle's latency.

- The central hub is the **only** node that talks to Integration Service over Kafka — branches
  never do, exactly as they never talked to the ERP directly under the current shape.
- Branches never call the ERP, and never will call Integration Service, directly.
- All hub↔branch communication goes through RabbitMQ — never direct HTTP between instances. This
  part of the topology is unaffected by the Integration Service migration: it is scoped entirely
  to the hub↔branch boundary, not the hub↔ERP boundary.
- Branch instances operate fully offline when RabbitMQ is unavailable.

---

## Data flow directions

| Data                          | Direction                                                     | Authority            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product catalog               | ERP → Hub → Branch                                            | ERP                  | Read-only on branches                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Price types                   | ERP → Hub → Branch                                            | ERP                  | Upserted by code, never created manually                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Prices per variant            | ERP → Hub → Branch                                            | ERP                  | Per price type, per variant                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Customer master data          | ERP → Hub → Branch                                            | ERP                  | Branches may enrich (trade points, notes), not override                                                                                                                                                                                                                                                                                                                                                                                                    |
| Credit terms / limits         | ERP → Hub → Branch                                            | ERP                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Orders                        | Bidirectional (Hub → Branch or Branch → Hub → ERP, per order) | Originating instance | Direction is decided per-order by `sourceInstanceId` — a customer order (always placed on the Storefront, Central-hosted) or a remote manager's order placed directly on Central both flow Hub → Branch for fulfillment; a branch-local operator's order flows Branch → Hub → ERP as before. See `docs/architecture.md`'s "Orders: direction follows the instance of origin" for the full reasoning — do not assume orders always originate at the branch. |
| Inventory levels              | Branch → Hub                                                  | Branch               | Hub aggregates; does not modify branch stock                                                                                                                                                                                                                                                                                                                                                                                                               |
| Reservations                  | Branch → Central                                              | Branch               | Hub aggregates for reporting; branch is source of truth                                                                                                                                                                                                                                                                                                                                                                                                    |
| Administrator / user accounts | Central → Branch                                              | Central              | Read-only replica on branches, including the password hash — see docs/architecture.md's "User identity: Central is master, not federated"                                                                                                                                                                                                                                                                                                                  |

---

## Cross-instance correlation keys

An event payload must never carry a sending instance's native (auto-increment) id as the way the
receiving side finds the corresponding local row — that id is per-instance and meaningless on
the other side (the same class of gotcha AGENTS.md documents for GraphQL input-arg ids). Every
synced entity type needs a stable, cross-instance-safe correlation key, resolved on write:

| Entity                   | Correlation key                                          | Why                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product / ProductVariant | `Product.customFields.externalId` / `ProductVariant.sku` | Already ERP-sourced and globally unique — `PriceHandler` already correlates by `sku`, no new field needed                                                        |
| Customer                 | `emailAddress`                                           | Already globally unique — `CustomerHandler` already correlates by it, no new field needed                                                                        |
| Counterparty             | `erpId`                                                  | Already the ERP's own stable id                                                                                                                                  |
| Administrator            | `customFields.sourceAdministratorId`                     | Administrator has no natural external key; stamped on the **branch-side replica only**, never set on Central. See `AdministratorSyncService`.                    |
| Order                    | `customFields.sourceOrderId`                             | An order has no natural external key either; stamped on the **receiving side's local copy only**, never set on the originating instance. See `OrderSyncService`. |

Rule of thumb: if the entity already has an ERP-assigned identifier used elsewhere for
idempotent upsert (`sku`, `erpId`, `emailAddress`), reuse it — don't add a redundant sync-specific
field. Only add a new `sourceXId` custom field when the entity has no such natural key of its own
(Administrator, Order).

---

## Hub → Branch (downstream)

### Outbox on the hub

When the hub receives data from the ERP (or generates domain events), it writes a record to
the `sync_outbox` table **in the same database transaction** as the business data change.

```
ERP push / polling adapter
    → hub service updates DB row
    → hub service inserts sync_outbox row       ← same transaction
    → commit

Background worker (BullMQ)
    → reads undelivered outbox rows
    → publishes SyncEvent to RabbitMQ exchange
    → marks outbox row as delivered
```

### RabbitMQ routing

- One **topic exchange** (`mivend.sync`).
- Each branch has its own **durable queue** (`sync.branch-a`, `sync.branch-b`, …); Central has its
  own (`sync.central`) for the Branch → Central direction.
- **Routing key: `<eventType>.<target>`** — e.g. `product.updated.all-branches`,
  `order.created.branch-a`, `order.created.central`. `target` is the same value already stored on
  the `sync_outbox` row, not separate metadata.
- **Every queue binds with a specific pattern, never a bare `#`.** A branch binds to
  `#.<own-branch-id>` and `#.all-branches`; Central binds to `#.central`. (A leading `#`, not `*`
  — `eventType` itself already contains a dot, e.g. `order.created`, so the routing key has a
  variable number of segments before the target suffix; `*` only matches exactly one word.)
  "Bind everything with `#` and filter in application code" was tried first and rejected as a
  recognized RabbitMQ anti-pattern — the broker should do the filtering it's designed for, not
  push a hand-maintained "skip if not for me" branch into every consumer for every event type it
  was never meant to receive (including its own self-published broadcasts, if a queue's binding
  were wide enough to catch them).

### Branch consumer

- Each branch runs a RabbitMQ consumer via `plugin-sync`.
- Central runs its own separate consumer for the Branch → Central direction (see "Orders:
  direction follows the instance of origin" in `docs/architecture.md`).
- Every consumer defensively skips a message whose `sourceInstanceId` equals its own — not
  load-bearing given the routing-key scheme above, but cheap insurance.
- Messages are acked only after the local DB write commits successfully.
- On failure: message is nacked with requeue; exponential backoff via dead-letter exchange.

---

## Branch → Hub (upstream)

Branch-originated events (orders, inventory deltas) use the same outbox pattern on the branch side.

```
Branch user action (place order, adjust stock)
    → branch service updates DB row
    → branch service inserts sync_outbox row    ← same transaction
    → commit

Background worker (BullMQ)
    → reads undelivered outbox rows
    → publishes SyncEvent to hub-bound queue in RabbitMQ
    → marks outbox row as delivered

Hub consumer
    → receives event
    → writes to hub DB
    → forwards to ERP adapter (for orders)
```

---

## SyncEvent envelope

Every message in RabbitMQ uses a standard envelope (defined in `packages/shared`):

```typescript
interface SyncEvent<T = unknown> {
    eventId: string; // UUIDv4, globally unique
    eventType: string; // e.g. "product.updated"
    sourceInstanceId: string; // "hub" | "branch-a" | ...
    timestamp: string; // ISO 8601
    payload: T;
}
```

Consumers use `eventId` for idempotency — duplicate delivery must be a no-op.

---

## Outbox table

```sql
CREATE TABLE sync_outbox (
    id              BIGSERIAL PRIMARY KEY,
    event_id        UUID NOT NULL UNIQUE,
    event_type      VARCHAR NOT NULL,
    payload         JSONB NOT NULL,
    target          VARCHAR NOT NULL,   -- "all-branches" | "branch-a" | "hub"
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ,
    retry_count     INT NOT NULL DEFAULT 0,
    last_error      TEXT,
    last_error_at   TIMESTAMPTZ
);

CREATE INDEX sync_outbox_undelivered ON sync_outbox (created_at)
    WHERE delivered_at IS NULL;
```

The outbox worker queries only rows where `delivered_at IS NULL`.

---

## ERP adapter interface (current — being superseded)

`plugin-sync` exposes an internal adapter interface that the ERP integration must implement.
This keeps ERP-specific protocol details isolated from the rest of the system.

```typescript
interface ErpAdapter {
    /** Pull pending changes from ERP since the given cursor. */
    fetchChanges(since: Date): Promise<ErpChangeSet>;

    /** Push a confirmed order to ERP. */
    pushOrder(order: Order): Promise<ErpOrderRef>;

    /** Push inventory delta to ERP. */
    pushInventoryDelta(delta: InventoryDelta): Promise<void>;
}
```

The concrete implementation (HTTP, file exchange, direct DB — whatever the ERP supports) is
injected via plugin options and never referenced directly in domain code.

**This interface is superseded end-to-end by the Integration Service direction** (see
`docs/ai/1c-integration-service-decision.md`), inbound and outbound alike — not implemented yet,
kept here only as the current, still-running shape:

- `fetchChanges` (catalog/price/stock polling) is replaced by a Kafka consumer subscribed to
  Integration Service's entity-event topics — no polling, no cursor, delivery is push-based.
- `pushOrder`/`pushInventoryDelta` (direct HTTP to the ERP) is replaced by publishing a MiVend
  business event (e.g. `OrderSubmitted`) to Kafka — via this repo's own outbox pattern, the same
  shape already used for `sync_outbox`/RabbitMQ — that Integration Service's own consumer turns
  into a durable outbound command, delivered to 1C on 1C's own regulated-job pull/ack cycle. This
  repo never calls 1C, or Integration Service, synchronously for this — no RPC channel, Kafka
  both ways (see "Why Kafka both ways" above).

Do not extend or "fix" `ErpAdapter` for new functionality — new work in this area should target
the Integration Service shape instead. See `1c-integration-service-decision.md`'s "Not yet done"
section for what's actually unblocked to start.

---

## Conflict resolution

Conflicts arise only for bidirectional data (customer enrichment fields).

**Rule:** the ERP is the master for all core fields (name, INN, credit limit).  
Branch-owned fields (trade points, local notes) are stored in separate columns and are never
overwritten by a sync from the hub.

There is no merge/CRDT logic. If a conflict is detected (same row modified on two sides before
sync), the hub side wins for ERP-owned fields; branch side wins for branch-owned fields.

---

## Retry and failure handling

- All sync jobs are persisted in the outbox before being sent. A crashed worker loses nothing.
- RabbitMQ messages are published with `persistent: true` (survives broker restart).
- Consumer acks the message only after local commit. Nack + requeue on failure.
- After N retries (configurable), message is routed to a dead-letter queue for manual inspection.
- Dead-letter queue triggers an alert (log + optional webhook). No silent drops.
- Outbox rows that fail delivery are retried with exponential backoff: 1 s, 5 s, 30 s, 5 min, …

---

## Idempotency requirements

Every consumer **must** be idempotent. The same `eventId` arriving twice must produce the same
result as receiving it once.

Implementation pattern:

```typescript
const existing = await repo.findOne({ where: { eventId } });
if (existing) return; // already processed

// ... apply change ...
await repo.save({ eventId, ...data });
```

Use a unique index on `eventId` in any processed-events log table as a hard safety net.

---

## What is never synced

- Admin sessions, API tokens — never leave the instance that issued them.
- BullMQ job state — local to each instance's Redis.
- Elasticsearch indexes — rebuilt independently per instance from local DB.

---

## Plugin-sync responsibilities

`plugin-sync` is the only plugin that knows about RabbitMQ and the ERP adapter.
All other plugins publish domain events via Vendure's `EventBus`.
`plugin-sync` subscribes to those events and translates them into outbox writes.

No other plugin imports from `plugin-sync` or calls RabbitMQ directly.

This still holds for the RabbitMQ/hub-branch half of `plugin-sync`'s job. The ERP-adapter half
is expected to move to a bidirectional Kafka producer/consumer targeting Integration Service
instead (see above) — when that lands, whether it stays inside `plugin-sync` or becomes its own
plugin is an open implementation question, not decided here.

---

## Cross-instance facts as independent event streams (rule #10)

A cross-instance fact about an order or invoice that a **non-owning** instance can legitimately
witness (a payment, a reservation, an approval, an ERP status) is never a direct mutation of
another instance's record, and never folded into a general `*.updated` event's payload — it is
its own independent event stream. `docs/architecture.md`'s "Order as a read-model" section has
the full reasoning; this section documents the concrete payment instance of it.

**Payment facts** (`plugin-acquiring`'s `Invoice`/`PaymentAttempt`) flow in from two directions,
both landing in `plugin-acquiring`'s payment inbox rather than mutating an `Invoice` directly
from `plugin-sync`:

- **ERP → Central**: `plugin-sync`'s `ErpCallbackController` (`POST /erp/callback/payment`)
  receives a payment document 1C already posted, and publishes `ErpPaymentReportedEvent` on the
  `EventBus` — it does not call into `plugin-acquiring` directly, and does not touch RabbitMQ for
  this (no branch is involved).
- **Branch → Central**: a branch-witnessed cash payment (`recordWitnessedPayment`) travels
  through the existing `payment.recorded` outbox/RabbitMQ transport documented above (nothing new
  here — same envelope, same consumer). `CentralConsumer.handlePaymentRecorded` applies the
  payment fact as it always did, and — only when the payload carries the optional `invoiceId`/
  `outcome` fields (`PaymentRecordedPayload`, `packages/shared/src/sync.ts`) — additionally
  publishes `BranchKassaPaymentEvent` on the `EventBus`.

Both event classes live in `plugin-sync` (`erp-payment.events.ts`) and are exported from its
public `index.ts`; `plugin-acquiring`'s `PaymentEventListener` is the only subscriber, and its
only job is to durably enqueue the event (never to process it inline) — see AGENTS.md sync rule
#12 and `docs/payments.md`'s "Idempotency: three independent levels" section for the full
inbox/worker design this event stream feeds into.
