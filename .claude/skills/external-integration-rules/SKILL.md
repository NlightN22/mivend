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

## Wire format — protobuf only, never a JSON-bridge stream

**mivend only builds a consumer against an Integration Service Kafka stream once it's encoded as
real, generated protobuf (`@nlightn22/event-contracts`, `toBinary`/`fromBinary` against a
`.proto`-generated type) — never against a stream still on their interim JSON bridge
(`jsonMapperOnTopic` in their `outbox-event-mapper.ts`).** A hand-parsed JSON payload, however
carefully validated on mivend's own side (a strict class + runtime validator, same rigor as any
REST DTO), only gives compile-time type safety in mivend's own code — it gives zero wire-format
evolution guarantee from the producer's side. Integration Service can rename/retype/remove a
field in a JSON-bridge stream with no schema check catching it before it ships; a real protobuf
schema can't silently break a field backward-incompatibly the same way (field numbers are
load-bearing, removal/retyping is a visible, reviewable schema change, not a silent JSON reshape).

**mivend's own `KafkaConsumerService`'s decode step is protobuf-only by design**
(`fromBinary(SCHEMA_BY_STREAM[stream], ...)`, see the resilience patterns below) — there is no
"JSON decode branch" to add for an exception case. A stream still on their JSON bridge is not
ready to consume, full stop, regardless of how complete or stable its field set looks today.

**When a stream mivend needs is still JSON-bridge**: file it upstream against Integration
Service, asking them to run their own contract-formalization process for that stream (as of this
writing, their `1c-exchange-plan-workflow` skill's stage 6.5 — "Event-contracts protobuf schema
audit" — already exists for exactly this; check whether an equivalent skill/process still exists
on their side before assuming the same reference applies verbatim, their tooling can change).
Don't design or implement a mivend-side handler against the JSON shape as an interim measure —
wait for the real schema, even if that means a stream stays in the "waiting on Integration
Service" bucket for a while.

**When mivend needs a new field added to an already-protobuf stream**: file the request the same
way (see the counterparty/contract/user research threads in issues #104/#105/#109/#117 for the
established "check first, ship if quick, track as a blocker otherwise" process) — Integration
Service should coordinate the exact field name/type with mivend before shipping a schema change
mivend depends on, not ship first and let mivend adapt after the fact.

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

## Cross-entity dependencies — a missing reference must retry, never silently skip

Real incident (issue #95's investigation): several `plugin-erp-integration` stream handlers
(`stock`, `price`, `storage-location`, `order-registration-result`, at least) resolve a foreign
reference to another 1C entity synced via a _different_ Kafka stream (a `Warehouse` by erpId, a
`PriceType`, a `ProductVariant` by external id). When that lookup came back empty — most commonly
because the referenced entity's own stream hasn't delivered it yet, an ordinary race with no
topic-level sequencing guarantee in Kafka — the handler logged a warning and `return`ed normally.
`processOne()` then called `markProcessed()` on a `return`, exactly as if the row had been handled
correctly: the event was **silently and permanently dropped**, with zero retry, the moment the
dependent entity simply hadn't arrived yet.

**Kafka gives no cross-topic ordering or consumption-priority mechanism** — do not try to build
one (a "wait for the warehouse topic before the stock topic" scheduler). The correct fix is always
retry-with-backoff, treated as an ordinary eventual-consistency problem, never sequencing.

**Rule: a stream handler must distinguish two failure classes, never conflate them:**

1. **Malformed/incomplete payload** (a required field is missing or invalid on the message
   itself) — not retryable, no amount of waiting fixes it. Keep the existing pattern: log a
   warning and return normally; the inbox row is marked `processed` (there is nothing to retry
   toward).
2. **Missing cross-entity dependency** (a foreign lookup — `Warehouse.findByErpId`, a
   `ProductVariant` by external id, a `PriceType`, etc. — returns nothing) — this is a **retryable
   condition**. The handler must `throw` (never warn-and-return) so `processOne()`'s existing
   `catch` block routes it through the inbox's retry/dead-letter path instead of marking it
   `processed`.

**When adding or reviewing any stream handler that does a foreign lookup into data owned by
another stream, check: does a failed lookup throw, or does it swallow the failure and return?** A
swallowed failure here is the same class of bug as #95's silent StockLocation fallback — a
required condition wasn't met, and the code proceeded (or, worse, quietly gave up) instead of
failing loudly into the retry mechanism that already exists for exactly this case.

**Concrete retry shape for this failure class** (see `IntegrationInboxEvent`/
`IntegrationInboxService` for the mechanism): exponential backoff via a `nextRetryAt` column
consulted by `claimBatch`'s claim query — base 30s, ×2 per attempt, capped at 30 minutes per
retry, ±20% jitter (avoids a large batch of simultaneously-eligible rows thundering the DB at
once). Give up (`failed`, terminal, for manual inspection) once the row has been sitting unresolved
for **24 hours** wall-clock since `createdAt` — a time-based budget, not a fixed attempt count,
mirroring issue #93's own wall-clock-budget pattern for the bulk lane's reclaim loop (a fixed
attempt count stops meaning anything once backoff is capped — 24h is the actual guarantee being
made, so bound on that directly). This is a distinct, longer budget from the default
`INBOX_MAX_ATTEMPTS_DEFAULT`-based retry used for genuine processing bugs / malformed data, which
should stay short (fail fast, a human needs to look at it, more waiting won't help).

## Non-optional proto3 scalar fields — an absent key means the zero value, never "no data"

**Rule: for any plain (non-`optional`) scalar field in an Integration Service contract — bool,
`double`/numeric, or string — reading the decoded JSON payload must treat an absent key as that
field's zero value (`false` for bool, `0` for numeric, `""` for string), never as "field not
sent, skip it" or "field not sent, treat as null/unknown".** This is not specific to booleans.

**Why**: proto3's JSON mapping (used by `@bufbuild/protobuf`'s `toJson`, which every consumer in
`kafka-consumer.service.ts` goes through) omits a non-optional scalar field from the encoded JSON
entirely when its value equals the type's zero value. A field declared `optional` in the `.proto`
gets real presence tracking (its own bit, `?? undefined` is a legitimate "genuinely not sent" read)
— a plain scalar does not, and its absence is indistinguishable at the JSON level from an explicit
zero. `expectedQuantity` (`optional double`) and `isActive`/`is_folder` (`optional bool`) in these
contracts DO carry real presence; `available_quantity`/`quantity`/`isDeleted` etc. (plain, no
`optional` keyword) do NOT — check the generated `.d.ts` (`node_modules/@nlightn22/event-contracts/
dist/generated/.../*_pb.d.ts`) for the field's own doc comment (`@generated from field: optional
double expected_quantity = 12;` vs `@generated from field: double available_quantity = 11;`) to
tell which is which; do not guess from the field's own semantics.

**Two real incidents from getting this wrong, same root cause, different field/type:**

- issue #89: `isActive`/`isDeleted` bool fields — an absent key was read as "defaults to active",
  making real deactivations from 1C silently invisible. Fixed via the `=== true` explicit-boolean
  read pattern (see `types.ts`'s `InboundStream` comment) — now applied consistently across every
  handler reading these two fields.
- mivend.issue.84.88 (2026-09-15): `stock.handler.ts`'s `availableQuantity` (a `double`, not a
  bool) had the identical bug in a different type — `payload.availableQuantity != null ? Number(
...) : null` treated an absent key as "no data, don't write anything", when it actually meant
  "1C reports zero available stock" — exactly the case the downstream ATP cap
  (`ReservationAvailabilityService`, issue #72) most needs to catch. This silently skipped writing
  the ATP cap for every affected row (a real oversell-risk gap, not just cosmetic) and, separately,
  broke an unrelated reconciliation feature that used the same field's nullness as a proxy for "did
  we receive this fact" (see the item below on not overloading a business field for that). Found
  only because a downstream count mismatch was chased back to it — the underlying data bug (missing
  ATP cap) had no user-visible symptom of its own and could have gone unnoticed indefinitely.

**Before writing or reviewing any handler that reads a field from a decoded Kafka payload:**

1. Look up the field in the generated `.d.ts` — is it declared `optional` or plain?
2. If plain: read an absent key as the zero value (`?? 0` / `=== true` / `?? ''`), never as
   `null`/`undefined`/"skip". A guard like `if (payload.x != null)` on a plain scalar is close to
   always wrong for this reason — it can never distinguish "explicit zero" from "not sent",
   because the wire format itself cannot represent that distinction for a plain field.
3. If `optional`: an absent key genuinely means "not sent" and a `null`/`undefined` branch is
   correct — don't apply this rule there, don't invent a zero-value default the source system
   never asserted.
4. This is a repo-wide pattern, not per-handler — when reviewing a new or changed handler, grep
   the same field name across every OTHER handler/stream that reads it, since a fix applied to one
   handler (e.g. `isActive` in `category.handler.ts`) does not automatically propagate to a
   different handler making the same read for a different field (`availableQuantity` in
   `stock.handler.ts`) — that gap between the two is exactly how issue #84/#88's incident happened
   years after #89 had already established the pattern for booleans.

**Do not use a business-purpose field's nullness as an infrastructure-purpose proxy.** The
`availableQuantity`/`erpAvailableQuantity` incident above was made worse by
`ReconciliationLocalCountsService` separately using `erpAvailableQuantity IS NOT NULL` as its
answer to "did we receive a stock fact at all" — an infrastructure/observability question — when
that field's actual purpose is a business ATP cap. The two questions have different correct
answers (a stock fact can be fully, correctly received and applied while genuinely leaving that
particular business field at its default), and reusing one field for both meant fixing the
business-logic read bug was necessary AND sufficient to also fix a completely different,
previously-mysterious reconciliation gap — which is a sign the reconciliation counter was reading
the wrong signal in the first place, not evidence the two concerns were ever actually the same
thing. If a handler needs an explicit "did we apply a real event" marker, use a dedicated field for
it (a timestamp column set unconditionally, or similar) rather than inferring it from whether some
unrelated business field happens to be non-null.

## A handler bug fix does not retroactively fix already-processed data — reprocessing is mandatory

**Fixing a handler's read/derivation logic only changes how FUTURE Kafka events get applied.**
Every `IntegrationInboxEvent` row already marked `processed` ran through the OLD, buggy logic and
keeps whatever wrong local state that produced — the code fix alone does nothing for it. Treat a
bug fix to any inbound handler's business-data derivation (an `isActive`/`isDeleted` read, a
missing-field default, a wrong filter, anything that changes what gets written to a local entity)
as **incomplete** until you've also identified and reprocessed the already-affected rows. This is
not optional cleanup — it's the same class of requirement as writing a test for the fix itself.

**Real incidents this happened for, repeatedly, same pattern each time** (`mivend.issue.84.88`,
2026-09-15): after fixing `isActive`/`isDeleted` handling (#89) and the category `isPrivate`
filter (#90), the _already-consumed_ Kafka events for `warehouse` (58 events), `category` (1141
events), and `organization` (51 events) were still sitting `processed` with the old bad output —
reconciliation kept showing the same gap even though the code was correct, because nothing had
re-run the new logic against that already-arrived data. Confirmed again by the user directly for
this same `organization`/`isDeleted` fix, immediately after it shipped: "у нас все из-эктив
получаются... ты должен тогда вызывать загрузку этих данных" — exactly this gap.

**Rule of thumb for how to reprocess, in order of preference:**

1. **Known, small, bounded set of affected rows, payload already stored locally** (e.g. an inbox
   row's own `payload` JSON already contains everything the fixed logic needs to re-derive) →
   **self-replay**: reset those `integration_inbox_event.status` rows from `processed` back to
   `pending` (a direct SQL `UPDATE ... WHERE stream = '<x>' AND status = 'processed'`, scoped as
   tightly as you can identify the affected set) and let the existing consumer/worker loop pick
   them up and reapply the now-fixed handler. No external call needed — the fix and the data are
   both already local.
2. **Known entity-id list, but the payload needs to come from the source again** (not fully
   reconstructable from what's stored) → a **targeted replay** via Integration Service's
   `POST /api/resync/v1/replay` (issue #108 on the `search-platform` side; max 200 entityIds per
   request) — ask by explicit ID list, never guess/enumerate on mivend's side.
3. **Unknown or large-scale gap** (you can't enumerate which specific rows are wrong, or the
   count is large enough that enumeration itself is the risk) → ask Search Platform for a full
   `aggregateType` resync through the same endpoint, rather than trying to figure out the
   affected set yourself.

**Never skip this silently.** If you fix a handler bug and decide reprocessing is out of scope for
the current change (e.g. no local/staging-integration contour is reachable, or it's genuinely a
separate follow-up), say so explicitly to the user/in the report — don't let a green `make test`
read as "the data is now correct," because it only proves the code path is correct for new input.
Before reprocessing anything beyond the local dev contour, confirm with the user first — resetting
inbox rows or requesting a resync are real, hard-to-fully-reverse actions against shared state
(this project's own "Executing actions with care" rules apply here, not just to git).

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
