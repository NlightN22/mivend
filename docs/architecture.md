# Architecture overview

## What this platform does

B2B distribution platform for product search, ordering, warehouse reservation, and logistics.
Replaces part of a legacy ERP system used for order management and inventory.

Primary users: business clients (companies) and internal operators/managers.
Catalog scale: tens of thousands of SKUs.

## Hub-spoke: autonomous branch instances

Each business location runs its own independent Vendure instance with its own PostgreSQL database.
Branch instances sync periodically with a central hub.
The central hub is the only node that communicates with the legacy ERP.

**Why autonomous:** Locations may have unreliable network connectivity. Each branch must operate fully without access to the central hub.

```
[Legacy ERP]  ←→  [Central Hub]
                       ↕ RabbitMQ (cloud)
                  [Branch Instance A]
                  [Branch Instance B]
                  [Branch Instance ...]
```

## Sync architecture

### Message broker: RabbitMQ

RabbitMQ runs in the cloud alongside the central hub.
Branch instances connect to it when network is available.
Durable queues accumulate messages while a branch is offline; messages are delivered on reconnect.

**Why RabbitMQ over Kafka:** Kafka is built for millions of events per second and adds significant operational overhead. RabbitMQ fits this scale (< 10 branches, moderate event volume) and provides flexible routing via exchanges and per-branch queues.

### Sync flow

```
Hub DB change
    → publishes SyncEvent to RabbitMQ exchange
        → routed to branch-specific durable queue
            → Branch consumer applies update to local DB (when online)

Branch DB change (order, reservation)
    → written to local sync_outbox table (same DB transaction)
        → background worker reads outbox
            → publishes to hub-bound queue in RabbitMQ
                → Hub consumer applies update
```

### Sync rules

| Data                  | Direction                       | Conflict owner               |
| --------------------- | ------------------------------- | ---------------------------- |
| Product catalog       | Central → Branch                | Central                      |
| Prices / price types  | Central → Branch                | Central                      |
| Customer data         | Bidirectional                   | Branch (for its own clients) |
| Credit terms / limits | Central → Branch                | Central                      |
| Orders                | Branch → Central                | Branch                       |
| Inventory             | Branch owns; Central aggregates | Branch                       |
| Reservations          | Branch → Central                | Branch                       |

Sync jobs are idempotent. Failures are logged and retried — never silently dropped.
Every synced entity carries `sourceId` and `syncedAt`.

## Branch instance: high availability

Branch app is stateless — multiple instances behind a load balancer share all state externally.

```
[Load Balancer]
      ↓
[Branch App × N]   ← stateless
      ↓        ↓
[PostgreSQL HA] [Redis]
                  ↓
            [BullMQ workers]
```

- **PostgreSQL** — branch data (HA via Patroni or managed PostgreSQL)
- **Redis** — BullMQ job queues (Vendure uses BullMQ by default for job processing)
- **BullMQ workers** — process sync jobs, reservation TTL expiry, and other background tasks
- Infrastructure: Docker on local servers (Proxmox)

## Domain decisions

**Reservation:** soft reservation per warehouse. Default TTL is configurable; managers can extend up to a configured maximum without additional approval. Auto-release on expiry.

**Pricing:** multiple price types per customer (e.g. wholesale, special). Price type is assigned per customer and resolved at order time.

**Credit terms:** each customer has a deferred payment period and a credit limit defined by contract. Orders are checked against the credit limit before confirmation.

**Cross-reference search:** primary lookup by part number (OEM) and manufacturer code. Analog/cross-reference matching via external catalog integration. Vehicle selection by make/model/year is delegated to external catalogs — not implemented natively.

## Plugin responsibilities

| Plugin             | Responsibility                                                             |
| ------------------ | -------------------------------------------------------------------------- |
| `reservation`      | Soft reservation, TTL management, auto-release                             |
| `customer-pricing` | Price type assignment and resolution per customer                          |
| `credit-terms`     | Credit limits and deferred payment enforcement                             |
| `cross-reference`  | OEM number lookup, analog matching, external catalog integration           |
| `search`           | Elasticsearch: full-text, fuzzy, OEM search, transliteration               |
| `sync`             | Outbox pattern + RabbitMQ producer/consumer + legacy ERP adapter interface |
| `acquiring`        | Online payment processing                                                  |
| `pos-api`          | API for point-of-sale systems (later phase)                                |

## Development phases

### Phase 1 — Foundation

- Monorepo scaffold (pnpm, TypeScript, ESLint)
- `apps/branch` — minimal working Vendure instance
- `apps/central` — minimal working Vendure instance
- `packages/shared` — base types
- Docker Compose: PostgreSQL × 2 + Elasticsearch + Redis + RabbitMQ

### Phase 2 — Core domain

- `plugin-customer-pricing`
- `plugin-credit-terms`
- `plugin-reservation`

### Phase 3 — Search

- `plugin-cross-reference`
- `plugin-search` (Elasticsearch)

### Phase 4 — Sync

- `plugin-sync` (outbox pattern + RabbitMQ + legacy ERP adapter interface)

### Phase 5 — Payments

- `plugin-acquiring`
- `plugin-pos-api`

### Phase 6 — Storefront

- `packages/storefront` (Vue 3 + TypeScript, component library TBD)

## Out of scope

- Integration with third-party WMS systems
- Native vehicle make/model/year catalog
- Real-time streaming sync between hub and branches
