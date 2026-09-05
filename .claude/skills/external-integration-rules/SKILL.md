---
name: external-integration-rules
description: Mandatory rules for anything touching an external system — Integration Service/Kafka (plugin-erp-integration), a payment provider, a fiscal registrar, or any future webhook/callback integration. Read before writing or changing code in plugin-erp-integration, plugin-acquiring's inbound event handling, or any new external-system consumer/producer.
---

# External integration rules

This covers the boundary between mivend and anything **outside** mivend's own hub↔branch
topology: Integration Service (1C via Kafka), a payment provider, a fiscal registrar/operator,
or any future external API/webhook. For the hub↔branch RabbitMQ boundary instead, see the
`internal-sync-rules` skill. For messaging invariants that apply to both (outbox pattern,
idempotent consumers, ack-after-commit, no silent drops), see AGENTS.md's "Sync rules index"
(rules #1-4) — those are non-negotiable here too, not repeated in full below.

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
