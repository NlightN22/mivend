---
name: external-integration-rules
description: Mandatory rules for anything touching an external system — Integration Service/Kafka (plugin-erp-integration), a payment provider, a fiscal registrar, or any future webhook/callback integration. Read before writing or changing code in plugin-erp-integration, plugin-acquiring's inbound event handling, or any new external-system consumer/producer.
---

# External integration rules

This covers the boundary between mivend and anything **outside** mivend's own hub↔branch
topology: Integration Service (1C via Kafka), a payment provider, a fiscal registrar/operator,
or any future external API/webhook. For the hub↔branch RabbitMQ boundary instead, see the
`internal-sync-rules` skill.

**Messaging invariants — non-negotiable, apply here and to the internal RabbitMQ boundary
alike:** outbox pattern is mandatory (write to an outbox table in the same DB transaction as the
business data, never send directly); every consumer must be idempotent (unique index on
`eventId`, not just an application-level check); ack only after the local DB transaction
commits, never before; no silent drops (log, retry with backoff, dead-letter after bounded
attempts — a `try/catch` that swallows a sync/integration error is forbidden).

Full design: `docs/sync.md`, `docs/payments.md`, `docs/ai/1c-integration-service-decision.md`,
`docs/environments.md` (local/staging-integration/production contour separation — **never let
`make dev`/automated tests reach a real external broker**, see that doc's "Testing must stay
within the local contour").

## Ownership — one plugin per external boundary

**`plugin-erp-integration` (central-hub-only) is the single owner of all traffic to/from
Integration Service, over Kafka exclusively — never a direct HTTP/REST call to Integration
Service or to 1C from this repo, in either direction.** No RPC channel of any kind (see
`docs/sync.md`'s "Why Kafka both ways, not Kafka + RPC"). Inbound catalog/price/stock streams are
consumed from Kafka topics (`company.catalog.events.v1.*`) into `IntegrationInboxEvent`; outbound
business events (e.g. `OrderSubmitted`) are published via `IntegrationOutboxEntry`, both
schema-decoded/encoded per `docs/ai/1c-integration-service-decision.md`. No other plugin imports
from `plugin-erp-integration` or references Kafka/the Schema Registry directly.

**Branches never call the ERP or Integration Service.** Only the central hub does —
`plugin-erp-integration`'s Kafka consumer/producer is gated to `instanceType === 'central'`
only; a branch instance must never bootstrap it.

**ERP is master for business data.** Price types, prices, catalog, customer core fields, and
credit limits flow ERP → Hub → Branch and are never modified locally on branches — "ERP" here
means "ERP via Integration Service." This ownership rule is unchanged by which transport carries
it.

## Kafka consumer resilience patterns

Live incident, 2026-09-05: `plugin-erp-integration`'s Kafka consumer (`KafkaConsumerService`)
went fully dark against the real Integration Service broker — an ACL denial on two topics
(`storage-location-changed`/`stock-organization-changed`) took down consumption of every OTHER,
perfectly healthy topic too, and once the consumer did crash, a single failed reconnect attempt
left it permanently, silently dead. Both root causes are now fixed in the code and are
**mandatory patterns for any future change to this consumer** (or any new Kafka/queue consumer
added to this codebase):

1. **Subscribe to each topic in its own isolated `try/catch`, never a bare loop.** One denied/
   unavailable topic must never prevent `consumer.run()` from being reached for the topics that
   ARE healthy. Log and skip the failing topic; build the topic→stream routing map incrementally
   from whatever actually succeeded. If literally zero topics subscribe, log that explicitly
   (don't let it look identical to "working, just no traffic yet").
2. **The crash-retry/reconnect loop must be self-perpetuating — a failure at ANY point
   (including the very first `start()`, and including a scheduled retry's own failure) must
   schedule ANOTHER retry, not log-and-give-up.** A one-shot retry is functionally identical to
   having no retry supervisor at all the moment the broker is down for longer than one backoff
   window. Capped exponential backoff, looping until success (which resets the attempt counter)
   or an explicit `onModuleDestroy()`/shutdown — never a bounded attempt count for a connection
   supervisor (unlike the inbox's own dead-letter-after-N-attempts, which IS correct — a
   reconnect loop and a business-event retry loop have different termination semantics; don't
   copy one's bound onto the other).
3. **A message handler (`eachMessage`) must never throw for a decode or business-logic
   failure** — wrap it in `try/catch`, log, and either let the offset commit (a genuinely
   malformed payload can't be retried into validity) or route through the inbox's own retry/
   dead-letter path (a downstream processing failure). Only a genuine transport-level issue
   should ever reach kafkajs's own crash/retry machinery.
4. **Only one process may hold membership in a given consumer group.** If both `main.ts` and
   `worker.ts` bootstrap the same plugin, gate the actual `consumer.connect()`/`subscribe()`/
   `run()` call behind `ProcessContext.isWorker` (or equivalent) — two independent members in one
   group triggers a partition rebalance that can silently stall consumption for the reassigned
   partitions (issue #67). This also means any state the consumer needs to expose (e.g. "am I
   connected") must be **persisted** (DB row, not an in-memory flag) if anything outside the
   worker process (an admin endpoint served by `main.ts`) needs to read it — the two processes
   share no memory. See `KafkaConsumerStatus`/`GET /erp/kafka-status` for the reference shape.

Reference implementation for all four: `packages/plugins/erp-integration/src/kafka-consumer.service.ts`
and its `kafka-consumer-crash-retry.test.ts`/`kafka-consumer-topic-subscribe.test.ts` unit tests —
read these before touching this file or writing a new Kafka/queue consumer anywhere in this repo.

## Payments — four independent sources of truth, never conflate them

A payment touches: the payment provider/branch kassa/bank (owns `paymentStatus`, the real money
movement); this platform (business process/event routing only); the ERP (owns
`erpPostingStatus`, but only for postings it has actually accepted — unreachable ERP does not
make an already-captured payment "unconfirmed"); the fiscal registrar/operator (owns
`fiscalizationStatus`, completes asynchronously and independently of the other two).

Track these as separate fields, never one combined status. Refunds and disputes/chargebacks are
their own entities with their own lifecycles — never a negative payment record, never folded into
each other. Never invent a synthetic Vendure `Payment` to make an order's state machine match a
real-world payment that doesn't map 1:1 to that order. Any mismatch between systems becomes a
`PaymentReconciliationIssue` for a human to resolve — never an automatic pick of whichever number
looks right. Full design, including the three-level idempotency requirement (command idempotency,
inbound event dedup, business-level uniqueness): `docs/payments.md`.

## Never process a risky inbound event synchronously

A webhook, an ERP/1C exchange callback, or any other external/unreliable integration entry point
must never process a critical event synchronously as part of accepting it. The source only knows
"did you acknowledge receipt," not "did your business logic actually finish" — if those are the
same synchronous call and processing fails or the instance is down, the fact can be lost forever.
The correct shape, always:

1. Durably record the raw event first, in its own fast, low-risk write — a real **inbox** with a
   genuine per-row lifecycle status (`pending` → `processing` → `processed`, or → `failed` once
   retries are exhausted), never a bare "have we seen this event" boolean. A boolean marks "seen"
   at receipt time regardless of whether processing later succeeds, silently reintroducing the
   exact bug this rule prevents (real incident: `plugin-acquiring`'s original
   `ProcessedProviderEvent`/`recordIfNew`, corrected into `IncomingPaymentEvent` before shipping).
2. Acknowledge receipt once that fast write commits — separate from whether the actual processing
   has happened yet.
3. Do the real, risky processing **asynchronously**, via a retry-capable worker that sweeps for
   `pending`/retryable rows on its own schedule (not triggered synchronously by step 1).
4. Dead-letter (`failed`, terminal) after a bounded number of attempts for manual inspection —
   never retry a genuinely broken event forever.

Reference implementation: `plugin-acquiring`'s `IncomingPaymentEvent` + `InboxService`
(enqueue/claimBatch/markProcessed/markFailed) + `PaymentInboxProcessorService` (the actual
processing) + `PaymentInboxWorker` (BullMQ, sweeping once a minute — mirrors
`ReservationExpiryWorker`/`OutboxWorker`, the established periodic-worker pattern here). Applies
beyond payments: any future webhook/callback surface must follow the same shape.

**Known pre-existing violation, not yet fixed**: `plugin-erp-import`'s `POST /erp/import/batch`
still processes synchronously inline. Flagged, not refactored — don't copy this pattern into new
code.

## External reference id — always persist the source system's own identifier

Any record representing a fact from an external system must capture that system's own unique
identifier for the fact, not only an internally-generated id, so a human or automated process can
later reconcile against the source system. Distinct from the inbox rule above — this is about
what _fields_ the record must have, not how it's processed. Precedent: ISO 20022's
`EndToEndId`/UETR, Stripe's distinction between a short-lived idempotency key and a long-lived
external reference in object metadata.

Concrete instances: `plugin-acquiring`'s `PaymentAttempt` external reference (acquirer's provider
id, a branch kassa's RRN, or the ERP's own `erpEventId`), and `IncomingPaymentEvent.providerEventId`
(serves both as inbox dedup key and reconciliation key — two purposes, one field, by design). A
discrepancy found using this data becomes a `PaymentReconciliationIssue`. General rule, not
specific to payments: any future integration with an external system must persist that system's
own reference, not only this platform's internal id.

## Hierarchical/catalog-like entities — check for a folder/group discriminator first

Real incident, issue #94: 1C's warehouse tree includes folder/group nodes (e.g. "Branch X,
Address Y (group)"), not just real leaf warehouses. `warehouse_changed.proto` already carried the
discriminator (`bool is_folder = 8`, `optional string parent_id = 7`), but the handler read only
`name`/`branchId`/`isActive`/`isDeleted` and created a real Vendure `StockLocation` for every row
unconditionally — folders got treated as physical warehouses, with stock quantities that made no
physical sense, and it went undetected until someone spotted it live in production admin.

**Before writing a new Kafka consumer/stream handler for any hierarchical or catalog-like 1C
entity** (warehouses, categories, organizational units, price groups, or anything else with a
natural parent/child or folder structure in 1C):

1. Check the proto contract for a folder/group/hierarchy discriminator field (`is_folder`,
   `is_group`, `parent_id`, or similarly named).
2. If the field exists, the handler must explicitly branch on it — read it with the same
   `=== true` explicit-boolean pattern already used for `isActive`/`isDeleted` (proto3 omits
   false/zero values on the wire, see `types.ts`) — or explicitly document in a comment why it's
   safe to ignore. Never assume a flat list once a hierarchy field is visible in the contract.
3. If no such field is visible in the contract but the entity is plausibly hierarchical in 1C
   (folders/groups are a common 1C catalog pattern), stop and ask the user/domain owner how
   folder/group nodes should be represented on this stream — or get explicit confirmation that 1C
   never sends them here — rather than assuming a flat list and finding out live in production.

As of issue #94, `warehouse_changed.proto` is the only contract under
`event-contracts/proto/company/` with this kind of field — re-check this per-entity whenever a new
handler is added or an existing one is touched, since 1C is free to add a similar flag later.

## Testing — never against the real external system

Automated tests (any level) mock the external transport boundary (Kafka broker, Schema Registry
client, payment provider, fiscal registrar) — never a live connection. See
`docs/environments.md`'s "Testing must stay within the local contour": `make dev`'s local contour
runs with `INTEGRATION_KAFKA_ENABLED=false` and synthetic `erp-import` seed data; only a
deliberately-launched `make dev-staging-integration` talks to the real broker, and that database
is never seeded. If a test needs data the seed set doesn't have, extend the seed
(`erp-import` record type) or the test's own fixtures — never borrow real data from
staging-integration.

Run the `test-design` skill before writing or changing any test here, per AGENTS.md's Testing
requirements.
