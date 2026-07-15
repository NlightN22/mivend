# Sync architecture

Data exchange between hub, branches, and the legacy ERP.

---

## Topology

```
[Legacy ERP]
     ↕ HTTP adapter (plugin-sync, central only)
[Central Hub]
     ↕ RabbitMQ (cloud, durable queues)
     ├── [Branch A]
     ├── [Branch B]
     └── [Branch ...]
```

- The central hub is the **only** node that communicates with the legacy ERP.
- Branches never call the ERP directly.
- All hub↔branch communication goes through RabbitMQ — never direct HTTP between instances.
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

## ERP adapter interface

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
