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

| Data                          | Direction                       | Conflict owner               |
| ----------------------------- | ------------------------------- | ---------------------------- |
| Product catalog               | Central → Branch                | Central                      |
| Prices / price types          | Central → Branch                | Central                      |
| Customer data                 | Bidirectional                   | Branch (for its own clients) |
| Credit terms / limits         | Central → Branch                | Central                      |
| Orders                        | Bidirectional (see below)       | Originating instance         |
| Inventory                     | Branch owns; Central aggregates | Branch                       |
| Reservations                  | Branch → Central                | Branch                       |
| Administrator / user accounts | Central → Branch                | Central                      |

Sync jobs are idempotent. Failures are logged and retried — never silently dropped.
Every synced entity carries `sourceId` and `syncedAt`.

### User identity: Central is master, not federated

Administrator accounts are **created, edited, and deleted only on Central** — treated the same
way as ERP-owned business data (catalog, prices), not like branch-owned data (orders,
reservations). A branch never creates its own independent user; it only holds a **read-only
replica** synced down via the same outbox/RabbitMQ mechanism as everything else in this table.

**Why not per-branch independent identity:** the simpler alternative — each branch owning its own
users, cross-linked to a Central account by reference — was considered and rejected. It requires
either a manual link step (portal-admin explicitly pairing a Central account with a Branch
account) or a risky automatic one (matching by email, which can silently merge or fail to merge
the wrong people). Making Central the single source of truth removes the linking problem
entirely: one global identity, one record, replicated downward.

**Why the replica must include the password hash, not just profile data:** a branch must be able
to authenticate a login **fully offline** — this is the same "unreliable network" requirement
that drives the whole hub-spoke design. The synced record therefore carries the bcrypt hash
itself (safe to transmit and store, same as it's stored on Central), not just a display name.

**Known accepted limitation — deactivation lag:** if an Administrator is deactivated or deleted on
Central while a branch is offline, that branch's local replica stays valid (and thus that person
can still log in locally) until the branch reconnects and consumes the deactivation event. This
is the same eventually-consistent trade-off already accepted elsewhere in this table, but it is
more sensitive for access revocation than for e.g. price updates — accepted for now given branch
outages are expected to be short and infrequent; revisit (e.g. a short local-session TTL forcing
periodic re-auth) only if this becomes a real incident, not preemptively.

### Orders: direction follows the instance of origin, not a fixed rule

Unlike catalog/prices/credit terms (always Central → Branch) or inventory (always Branch-owned),
**an order's sync direction is decided per-order by which instance created it** —
`SyncEvent.sourceInstanceId` (already part of the envelope, see `docs/sync.md`) is the conflict
owner for that specific order, not a fixed side. Two entry points exist, both legitimate, and a
manager may use either depending on where they're connected:

- **Customer order via the public Storefront** — Storefront is a single, Central-hosted instance
  for all customers regardless of which branch will fulfill the order (see "Storefront hosting"
  below). The order is created on Central and flows **Central → Branch** so the responsible branch
  (per the order's `TradingPoint.servicingBranchId`, see `docs/access-control.md`) can reserve
  stock and fulfill it locally.
- **Manager/operator-entered order** — created on whichever instance the manager is actually
  logged into at the time. A branch-local operator (including fully offline) creates the order on
  the branch, which flows **Branch → Central** for aggregation/reporting, same as before. A
  remote manager connected directly to Central's manager portal (common for staff not physically
  on-site) creates the order on Central instead, flowing **Central → Branch** exactly like a
  customer order — from the sync layer's point of view these are indistinguishable, both
  originate on Central.

This is deliberate: the business wants managers to be able to work from either Central or their
branch depending on circumstance (remote staff, connectivity, convenience), so the architecture
must not assume "orders always originate at the branch." The rule that must hold instead is
narrower and already enforceable today: **whichever instance receives the write first owns the
outbox row and is the conflict owner for that order** — direction is a per-row fact
(`sourceInstanceId`), not a per-data-type constant.

### Storefront hosting: Central-only, not per-branch

The customer-facing Storefront (`packages/storefront`) runs as a **single Central-hosted
instance**, serving all customers regardless of which branch will end up fulfilling their order.
This is a deliberate departure from "branches operate autonomously" — that requirement exists for
**internal branch staff** continuing to work when the link to Central drops (POS/manager
operations), not for the public-facing storefront. A public storefront's availability depends on
being reachable from arbitrary customer networks; a cloud VPS with a standard uplink is a more
reliable place for that than a physical branch office's internet connection (which is exactly the
unreliable-network problem the hub-spoke design exists to route around in the first place — don't
reintroduce it on the customer-facing side). Order fulfillment routing to the correct branch is
handled by `TradingPoint.servicingBranchId`, not by which server the customer happened to load the
page from.

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

**Pricing:** multiple price types per customer (e.g. wholesale, special). Price type is assigned per customer and resolved at order time. Discount rules (facet + time-window %) apply on top. See `docs/pricing.md` for the full resolution flow, from ERP import through catalog display to the price actually charged on an order.

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
