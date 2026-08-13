# Architecture overview

## What this platform does

B2B distribution platform for product search, ordering, warehouse reservation, and logistics.
Replaces part of a legacy ERP system used for order management and inventory.

Primary users: business clients (companies) and internal operators/managers.
Catalog scale: tens of thousands of SKUs.

## Hub-spoke: autonomous branch instances

Each business location runs its own independent Vendure instance with its own PostgreSQL database.
Branch instances sync periodically with a central hub.
The central hub is the only node that communicates with the legacy ERP side of the exchange.

**Why autonomous:** Locations may have unreliable network connectivity. Each branch must operate fully without access to the central hub.

```
[Legacy ERP]  ←→  [Central Hub]
                       ↕ RabbitMQ (cloud)
                  [Branch Instance A]
                  [Branch Instance B]
                  [Branch Instance ...]
```

**Decided, not yet implemented** (see `docs/ai/1c-integration-service-decision.md`): the direct
`[Legacy ERP] ←→ [Central Hub]` edge above is being replaced. A separate Integration Service (its
own project) becomes the only thing that talks to the ERP; the central hub exchanges data with it
over Kafka **in both directions** — entity events (catalog/price/stock) inbound, business events
(orders/reservations/payments) outbound — schema-registered per producer, not through a
synchronous RPC channel:

```
[Legacy ERP]  ←→  [Integration Service]
                       ↕ Kafka (bidirectional, schema-registered)
                  [Central Hub]
                       ↕ RabbitMQ (cloud)
                  [Branch Instance A]
                  [Branch Instance B]
                  [Branch Instance ...]
```

The hub↔branch RabbitMQ topology is unaffected — this change only moves the ERP-facing edge of
the diagram, not the hub-spoke structure below it. See `docs/sync.md` for the full current vs.
target shape.

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

**The receiving instance gets a full local `Order` copy** (`OrderSyncService.applyCreate`,
implemented and live-verified — see `docs/ai/PROJECT_CONTEXT.md`), not a lighter
fulfillment-only projection — so the receiving side (a branch fulfilling a Central-originated
order, or Central aggregating a branch-originated one) can query/report on it exactly like a
local order. **Known, deliberate limitation**: the replica cannot be driven into a
Payment/Shipping-gated Vendure order state (`ArrangingPayment`/`PaymentAuthorized`/
`PaymentSettled`) because `Payment`/`ShippingLine` records aren't synced — see "Order as a
read-model" below for why this is by design, not a gap to close by syncing those entities too.

**Conflict rule (decided 2026-07-15): the originating instance always wins.** A replica
(`Order.customFields.sourceOrderId` set) is enforced **read-only for any real user** —
`ReplicaOrderInterceptor`/`ReplicaOrderProcess` (`packages/plugins/sync/src/replica-order.guard.ts`)
block `addItemToOrder`/`adjustOrderLine`/`removeItemFromOrder` and every state transition when
`ctx.activeUserId` is set, allowing only the sync-internal system context
(`OrderSyncService`'s own `requestContextService.create({apiType:'admin'})` calls, which never
carry a logged-in user) to write to it. **Explicitly not last-write-wins by timestamp** — real
RabbitMQ delivery delay (seconds to tens of seconds under backoff) means "arrived last" and
"happened last" routinely disagree, and `Order.state` is an FSM, not an independently-mergeable
field, so a naive timestamp comparison can silently produce a business-nonsensical state (e.g.
`Shipped` and `Cancelled` both "winning" different fields). Making the conflict structurally
impossible — only one side can ever legitimately write — was chosen over detecting and
resolving it after the fact.

### Order as a read-model: independent event streams per concern (CQRS)

**Decided 2026-07-15.** A concrete case exposed a gap in the conflict rule above: a customer's
online card payment happens on Central (the order's origin), but a walk-in customer paying cash
at a branch's till happens _locally_, against what that branch only holds as a **replica** of a
Central-originated order. The read-only-replica rule alone would wrongly block this — it's not
an attempt to override the order's real status, it's a legitimate fact witnessed somewhere other
than the origin.

The resolution generalizes beyond payment: **`Order`, as seen by any one instance, is a
CQRS-style read-model — a projection built by consuming independent event streams, one per
concern, never a single entity multiple sides fight to own.** A stream's _producer_ is whichever
instance actually witnessed the fact (Central for an online payment, a branch for a till
payment, either for a stock reservation, the approval-workflow engine for a sign-off); every
instance interested in the order applies each fact to its **own** local copy — the true owner
applies it for real (through the normal, already-guarded Vendure APIs, e.g. a real
`addPaymentToOrder`), everyone else applies it as an **informational projection** (a
`customFields` display value, not a real Vendure state transition). No instance ever reaches
into another instance's order directly — a fact always flows through the event stream, never as
a direct mutation request. This is not a new idea for this codebase — it formalizes a pattern
already present in three places, just not previously named as one principle:

- **Reservation** — `ReservationConfirmedEvent`/`ReservationReleasedEvent` (`plugin-reservation`)
  are their own stream, consumed by `plugin-sync`'s `ReservationConsumer` and written to the
  outbox independently of `order.*` events; `Order.customFields.reservationState` is a
  projection of it, never written to directly by another concern.
- **Approval/confirmation** — `ApprovalRequest`/`ApprovalStep` (`plugin-approval-workflow`) is
  its own aggregate with its own state machine; an approved decision is _applied_ to the order
  (e.g. a price adjustment) as a downstream effect, never by the approval engine reaching in and
  mutating the order as a co-owner.
- **ERP status** — `ErpOrderStatusEvent` is the ERP's own fact stream; `Order.customFields.erpStatus`
  is a projection, and this project's own explicit rule is "the ERP wins on conflict" (a fixed
  authority, the same shape as "origin always wins" above, not a timestamp comparison).

**Payment follows the same shape** — a `payment.recorded` sync event (implemented, live-verified
2026-07-15), produced by whichever instance witnessed the payment (Central's real payment gateway
event, or a branch till/kassa integration), carrying `sourceOrderId`/method/amount/state/
`witnessedBy`. The instance that owns the order applies it for real; every other instance holding
only a replica applies it as a `customFields.paymentStatus`-style projection for staff visibility
(branch operators need to _see_ payment status — e.g. a customer calling in to check — without
being able to _set_ it). **`payment.recorded` only captures the "did this order get paid"
signal — it is not, by itself, a general ledger.** A customer's real payment may not map 1:1 to
one order (a lump sum covering several orders, an advance, a partial payment) — see
`docs/payments.md` for the fuller design: four independent sources of truth (money movement
owned by the provider/kassa, business process owned by this platform, accounting reflection
owned by the ERP only once accepted, fiscal receipt owned by the fiscal registrar/operator —
never conflated into one status), a separate append-only `SettlementEntry` ledger per
counterparty, refunds/disputes as
their own entities, and three-level idempotency (command/inbound-dedup/business-uniqueness) —
never a synthetic Vendure `Payment` invented to force-fit a real-world payment onto one order.

**Rule for any future cross-instance signal about an order** (new to this list — apply this
before inventing a new mechanism): if a fact can legitimately be witnessed by more than one
instance, or by an instance that doesn't own the order, model it as its **own** independent
event stream with its own producer/consumer pair, correlated by `sourceOrderId`/`orderCode` —
never by extending `order.updated`'s payload or by relaxing the read-only-replica guard to let
that concern mutate the order directly. Applying a fact to a non-owning instance's copy of the
order is always a projection (`customFields`), never a real Vendure state transition, unless
that instance is the order's actual origin.

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

| Plugin             | Responsibility                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reservation`      | Soft reservation, TTL management, auto-release                                                                                                                   |
| `customer-pricing` | Price type assignment and resolution per customer                                                                                                                |
| `credit-terms`     | Credit limits and deferred payment enforcement                                                                                                                   |
| `cross-reference`  | OEM number lookup, analog matching, external catalog integration                                                                                                 |
| `search`           | Elasticsearch: full-text, fuzzy, OEM search, transliteration                                                                                                     |
| `sync`             | Outbox pattern + RabbitMQ producer/consumer + legacy ERP adapter interface (ERP adapter half being superseded by Integration Service/Kafka — see `docs/sync.md`) |
| `acquiring`        | Online payment processing                                                                                                                                        |
| `pos-api`          | API for point-of-sale systems (later phase)                                                                                                                      |

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
