# ERP integration: decided direction (search-platform / Integration Service)

**Status (updated 2026-08-12): decision recorded 2026-07-24, discussed in `search-platform`
repo. The `search-platform` side is now real, not hypothetical — `apps/integration-service`
exists, and the Kafka transport between `integration-service` and `search-service` is deployed
and verified (SASL_SSL, cross-host, real produce→broker→consume round trip). The MiVend side is
still **not started**: `erp-import`/`sync` are unchanged, still assume a direct ERP REST push,
and are not yet the target contract. This remains a heads-up for whoever picks up real ERP
integration work here — it changes the target shape of `erp-import`/`sync`, it does not describe
current MiVend code.**

## Context

`search-platform` (separate repo, catalog/CMS/ERP-agnostic search service for auto parts/fluids)
is independently building an ERP ingestion contract (issue #5 there,
`docs/design/ingestion-api-dto.md`). During that work it became clear MiVend is a real,
concurrent consumer of the same ERP data — not a hypothetical future integration — so the two
projects agreed on a shared direction instead of two independent ERP integrations.

**Confirmed with the user**: MiVend's current `erp-import`/`sync` plugins were built from memory
as scaffolding to unblock backend/frontend development, without real ERP data behind them yet
(`ProductRecord.organizationId`'s own comment already says "not yet sourced from a real ERP
export" — seeded/synthetic). They are not a target contract to preserve as-is; expect them to
change shape once this decision is implemented.

## Decided direction

```
ERP
  → Integration Service (new app, lives in the search-platform monorepo)
      → Kafka (entity-level events: Category / Organization / Warehouse / PriceType /
                Product / Offer / Price / Stock)
          ├→ search-service (search-platform's own consumer)
          └→ MiVend / Vendure (this repo — new consumer plugin, replacing erp-import's
                                direct-from-ERP REST batch model)
```

- **One landing point for ERP data, not two parallel contracts.** the ERP's exchange plan targets
  Integration Service only; MiVend no longer talks to the ERP directly (no more `POST
/erp/import/batch` fed straight from an ERP export job).
- **Organization/Warehouse as full entities, not a flat `organizationId` field.** Modeled after
  the ERP's real `AccumulationRegister_ТоварыОрганизаций` (stock keyed by both `Организация_Key` and
  `Склад_Key` independently — not one-organization-per-product, confirmed against real ERP
  `$metadata`).
- **Recommendation for the MiVend-side consumer** (researched against Vendure's own docs, not
  just this project's habits): map `Organization` → Vendure `Seller`/`Channel`, `Warehouse` →
  Vendure `StockLocation`, `Stock` → native `StockLevel`, using
  `MultiChannelStockLocationStrategy` — instead of the current
  `ProductVariant.customFields.organizationId` shortcut. This is a bigger lift than the current
  customField, but replaces ad-hoc plumbing with Vendure's built-in multi-seller/multi-warehouse
  primitives, which is what the organization-based invoice-splitting behavior
  (`plugin-acquiring`'s `Invoice` per organization) actually needs long-term.
- **Pricing**: `PriceType`/`Price` events carry no per-customer resolution — Integration Service
  and search-service never model `Counterparty`/`Contract`. MiVend's own
  `customer-pricing`/`price-entry` plugins (assigning a `PriceType` to a customer, resolving
  price at order/catalog time) stay exactly as they are — that logic is genuinely
  MiVend-specific business logic, not something the shared ERP contract should absorb.
- **Delivery mechanism: Kafka in both directions, no synchronous RPC channel.** An earlier pass
  at this decision (2026-08-12, before this correction) assumed Integration Service's own
  internal tRPC stack (used for its own synchronous internal queries/commands) would also be the
  transport between Vendure and Integration Service. That was wrong — Integration Service's own
  architecture already routes outbound business commands through Kafka too (see below); tRPC
  there is reserved only for rare, genuinely real-time exceptions (e.g. a credit-limit check that
  can't tolerate the regulated-job cycle's latency), not the default. MiVend adopts the same
  default: one transport, Kafka, both directions. RabbitMQ stays scoped to MiVend's own hub↔branch
  topology (`docs/sync.md`) and is not reused for the ERP/Integration-Service boundary.
- **Outbound direction (Vendure → the ERP: orders, reservations, payments)** is also decided on the
  search-platform side: Vendure publishes a business event (e.g. `OrderSubmitted`) to Kafka, which
  Integration Service's own consumer turns into a row in its own durable `outbound_commands`
  table (`pending` → `delivered` → `acknowledged`/`rejected`), handed to the ERP via the same
  regulated-job PUSH/PULL/ACK cycle the ERP already uses for catalog export, on a separate, more
  frequent schedule (target defaults: order/reservation PULL+result every 1 minute, invoice/
  payment PUSH every 5 minutes — starting point, subject to revision after load testing, not
  blocking). The API contract for this (PULL/ACK endpoints, DTOs, a `business_rejection_reason`
  lookup table per this project's "business data lives in the database" rule) is implemented on
  the Integration Service side; **the Kafka consumer that turns MiVend's own `OrderSubmitted` (or
  equivalent) event into an `outbound_command` row does not exist yet** — it waits on MiVend's
  own event contract for these business events, which this repo has not designed yet. This
  replaces `plugin-sync`'s current `ErpAdapter.pushOrder`/`pushInventoryDelta` direct-HTTP model.
- This means `plugin-sync`'s `ErpAdapter` interface (`fetchChanges`/`pushOrder`/
  `pushInventoryDelta`, direct HTTP to the legacy ERP) is superseded end-to-end, in both
  directions — not just the inbound catalog/price/stock side.

## MiVend-side schema strategy: Schema Registry, not a shared npm package

**Correction (checked against actual code, not just their design doc):** Integration Service's
production publishing mechanism for `@search-platform/event-contracts` is not actually an open
question — `docs/monorepo-split-decision.md` §6 still says "решается на этапе реализации"
("decided at implementation time"), but that's a stale line nobody went back to close out after
the real implementation landed. What's actually running: a **self-hosted Verdaccio container per
production host** (`infrastructure/compose/verdaccio.yml`, wired into both
`search-service.yml` and `integration-service.yml`), resolved at **Docker build time** over host
networking — both `search-platform/apps/search-service` and
`integration-service/apps/integration-service` depend on
`"@search-platform/event-contracts": "^0.3.0"` exactly this way. So the mechanism is real, working
production infrastructure, just undocumented as a closed decision in their own design doc.

This changes _why_ Option A is rejected for MiVend, not _whether_: it's not "an unresolved
production story," it's a **build-time package-resolution scheme designed for their own two
trees on their own hosts** — each of their production hosts already runs its own Verdaccio
mirror as part of their deploy pipeline. For a third, independent repo/team (this one) to depend
on it, MiVend would need either its own Verdaccio instance kept in sync with theirs (an ongoing
operational coupling with no existing sync mechanism between three independent registries), or
network reachability from MiVend's build host into one of their existing, presumably
firewall-scoped Verdaccio instances (the same kind of strict per-consumer IP scoping they already
apply to Kafka access — not something granted by default, and still a build-time dependency on
infrastructure another project operates). Either way: real coupling to another team's release
cadence and infrastructure uptime, for a contract that's naturally a runtime message-decoding
concern, not a compile-time one.

Integration Service already runs a real **Confluent-compatible Schema Registry** alongside Kafka
(deployed, not hypothetical) — that is the actual standard Kafka mechanism for exactly this
problem: cross-service schema distribution without a shared code package. **Original decided
direction for MiVend was: use the Schema Registry as the contract distribution point, not a
generated npm package** — retracted below, this was wrong.

**Retraction 2026-08-14 (checked against the real producer/consumer code, not just the design
doc's description of it):** the Schema Registry is not actually part of the wire format for any
of the 8 `company.catalog.events.v1.*-changed` topics at all. Verified directly:
`outbox-event-mapper.ts` encodes every message with plain `toBinary(<Schema>, message)` from
`@bufbuild/protobuf` — no Confluent wire-format header (no magic byte, no embedded schema id).
`search-service`'s own `kafka-consumer.service.ts` decodes with `fromBinary(SCHEMA_BY_STREAM[stream],
...)` — a static, compile-time-known schema selected by topic name, never a Registry HTTP call.
What the earlier pass in this doc called "an inconsistency in their own implementation, not a
pattern to copy" was wrong on both counts: it isn't an inconsistency (there is no Registry-based
code path anywhere in this pipeline to be inconsistent with), and it **is** the pattern MiVend's
own consumer must copy — a Registry-dynamic-resolution consumer would fail to decode every single
message from these topics, since they were never encoded that way to begin with. The Registry is
real infrastructure and MiVend's own outbound `OrderSubmitted` producer legitimately uses it (that
direction is producer-authoritative and MiVend's own choice) — it just isn't how any of _these_ 8
inbound streams are actually encoded, so it cannot be the decode mechanism MiVend's consumer relies
on for them.

**Corrected direction: depend on `@search-platform/event-contracts`' generated protobuf types
directly**, the same way `search-service`'s own consumer does. The earlier rejection of this
package wasn't wrong about the package/contract itself — a producer-owned, versioned, generated
contract is the normal and correct pattern here, not something to avoid. It was specifically about
the **distribution mechanism**: today the package resolves only through a self-hosted Verdaccio
container per production host (`infrastructure/compose/verdaccio.yml`), reachable only over
host-scoped Docker networking at build time — real coupling to another team's deploy
infrastructure and IP-scoping model (the same kind already applied to Kafka access), not just to
their release cadence. That specific objection still stands and doesn't need relitigating. The
fix isn't to avoid the contract — it's to ask Integration Service to publish
`@search-platform/event-contracts` somewhere a third-party consumer can actually reach without
VPN/firewall provisioning per consumer (e.g. GitHub Packages under their own org, token-auth,
no network/IP allowlisting needed) — tracked as a real ask to Integration Service, not yet
answered (see issue #63 there). Until that lands, MiVend's inbound consumer is blocked on either
that publishing change or a manual, hand-synced local copy of the relevant `.proto` files (same
"keep the DTO in sync by hand" pattern the backend-plugin-rules skill already uses for REST DTOs) as a fallback.

**Update 2026-08-13: access granted, provisioned, and verified live** — this was tracked as a
blocking prerequisite below; it no longer blocks. On `is.komponent-m.ru`: a dedicated Kafka SCRAM
principal (`mivend-hub`, Write+Describe-scoped to `mivend.orders.events.v1.order-submitted` only,
same least-privilege ACL model as `integration-service`/`search-service`'s own principals),
`ufw` + `DOCKER-USER` iptables rules scoping the SASL_SSL listener (9094) to MiVend central hub's
IP alongside `search-service`'s existing rule (persisted via `kafka-sasl-firewall.service`,
survives reboot), and an nginx-proxied, source-IP-restricted path
(`https://is.komponent-m.ru/schema-registry/`) for Schema Registry, which stays loopback-only on
the host itself otherwise. Verified live: a real producer connected over SASL_SSL and published a
message to the topic; a real schema was registered against the proxied Registry endpoint and
returned a schema id. Broker CA cert lives at
`infrastructure/kafka-tls/is-komponent-m-ca.crt` in this repo; real credentials are in
`apps/server/.env.central` (gitignored, not committed).

## Audit 2026-09-04: current MiVend inbound/outbound code checked against real proto + real

Integration Service code (`NlightN22/search-platform`, `master`, docs updated same day)

Checked out `contracts/event-contracts/proto/company/catalog/events/v1/*.proto` and
`integration-service/apps/integration-service/src/ingestion/outbound/*` directly on GitHub (not
just their docs). Four critical mismatches against the in-progress MiVend-side code
(`packages/plugins/erp-integration`, issue #62 Milestone 1, uncommitted at audit time):

1. **`@nlightn22/event-contracts` pinned at `0.5.0` in `package.json`; real upstream is at
   `0.13.0`.** `0.5.0`'s `StockChanged` still has `organizationId` (field 7) live; `0.13.0`
   reserves/removes it (stock is warehouse-level only now, see `StockOrganizationChanged` for the
   org-level stream) and adds `isActive`. Whole new stream/domain groups exist in `0.13.0`
   (`stock_organization_changed`, `storage_location_changed`, `unit_changed`,
   `company.customers.events.v1.*`, `company.orders.events.v1.*`) that `0.5.0` doesn't have at
   all. Decoding real messages against `0.5.0` is not viable — upgrade first.
2. **`PriceStreamHandler`/`StockStreamHandler` read fields that don't exist in the real schema**
   (confirmed independently of the earlier mock-based finding, against the real `.proto`):
   `PriceChanged` has `productId`/`priceTypeId`/`value` (string), not `sku`/`priceTypeCode`/
   `price`; `StockChanged` has `productId`/`warehouseId`/`quantity`/`reservedQuantity`/
   `availableQuantity`, not `sku`/`stockOnHand`. Every real price/stock event is silently skipped
   as-is.
3. **MiVend's outbound `OrderSubmitted` Kafka producer has no consumer on the other end.**
   Integration Service's real outbound path is ERP-facing REST pull/ack
   (`OutboundController`/`order-registration-requests/batch`+`/ack`) fed from its own
   `outbound_command` table; there is no Kafka consumer anywhere in `integration-service` that
   reads a MiVend-published event and turns it into an `outbound_command` row. Confirmed by their
   own design doc (updated today): _"Не реализован ... Kafka-consumer, кладущий строки в
   outbound_command из бизнес-событий вроде OrderSubmitted; до его появления outbound_command
   наполняется вручную/тестово."_ — i.e. the outbound slice below ("landed", "live-verified") is
   live-verified as publishing to Kafka, not as actually reaching the ERP; nothing consumes it yet.
4. **No MiVend consumer for `company.orders.events.v1.OrderRegistrationResult`** (status,
   document number, business rejection reason, `orderEntityId`) — the only channel that reports
   whether an order MiVend submitted was actually accepted by the ERP. Not in issue #62's stream list,
   not planned in Milestone 1. Without it, even a working outbound path is fire-and-forget.

None of this is a design-direction problem (Kafka-both-ways is still correct) — it's the current
code being stale against a real, evolving upstream contract. Before resuming Milestone 1: bump
`@nlightn22/event-contracts` to `0.13.0`, rewrite `PriceStreamHandler`/`StockStreamHandler`
against the real field names, and raise the outbound-consumer gap (#3) with Integration Service's
owner before treating the outbound slice as "done".

## Not yet done (either side)

- **Outbound slice landed** (`packages/plugins/erp-integration`, issue #62): central-hub-only
  outbox → Kafka producer, `OrderSubmitted` event, dynamic Schema Registry resolution, wired into
  `apps/server/src/vendure-config.ts`'s `plugins` array. Real access provisioned and verified live
  (see the update above) — this is not just code against mocks. **Caveat (2026-09-04 audit,
  above): live-verified means "publishes successfully to Kafka," not "reaches the ERP" — no consumer
  exists yet on Integration Service's side.**
- **Inbound consumer + inbox + worker + handlers for the 8 catalog/price/stock streams (Milestone
  1 in issue #62) is still not started.** This was the issue's own stated priority slice
  (Milestone 1, before the outbound slice) — implementation instead started with the outbound
  side, a deliberate scope call made mid-session (nothing to actually consume from Integration
  Service's side yet at the time — no producer exists there for MiVend's streams — versus the
  outbound side being fully within MiVend's own control to build and verify end-to-end). Still the
  larger, currently-missing half of this issue's scope; re-check #62 before resuming.
- No decision yet on Seller/Channel/StockLocation migration timeline/scope for this repo (see
  `docs/architecture.md`'s already-tracked issue #47 — "full Vendure Seller/Channel marketplace
  machinery... deferred" — this decision makes that migration concrete rather than speculative,
  but does not schedule it).
- No decision yet on this repo's own `plugin-sync`/`erp-import` restructuring (rename, merge, or
  replace) to reflect the new boundary — tracked as follow-up work, not started.

See `search-platform`'s `docs/design/ingestion-api-dto.md` and
`docs/design/1c-integration-architecture.md` for the full DTO shapes and reasoning. (Those paths
are internal to the `search-platform` repo, not published here — this document restates only
what MiVend needs to know, generically, per this repo's confidentiality rules.)
