# Integration Service Kafka streams — status map

Quick-lookup table for every `company.*.events.v1.*` stream Integration Service publishes:
whether mivend consumes it, what it's blocked on, and which mivend entity it targets. Update this
table whenever a stream's status changes — don't leave it stale (a stale row here is worse than no
row, since it actively misleads the next session).

For the narrative history of _why_ the integration is shaped the way it is (Schema Registry
decision, protobuf-only rule, past audits), see `docs/ai/erp-integration-service-decision.md` —
that doc is the chronological log, this one is the current-state lookup. Don't duplicate content
between them; this file links back to the decision log where relevant instead of re-explaining.

Full resilience/wire-format/ownership rules for this boundary: `external-integration-rules` skill
(`.claude/skills/external-integration-rules/SKILL.md`) — includes the **protobuf-only, never
JSON-bridge** rule. For per-stream inbox _throughput_ baselines (rows/min, claim-query cost) —
a different concern from this file's contract-status tracking — see
`docs/ai/erp-inbox-throughput-baseline.md`.

Parent audit: mivend#74 (which topics are unconsumed at all — the origin of every research issue
below).

**Never trust a status/version in this table (or in an old issue comment) as still current
without checking `pnpm view @nlightn22/event-contracts version` (or `make check-event-contracts`; `npm view` reads the project `.npmrc` and returns a false 401)
first — this file is a snapshot from whenever it was last edited, the real package moves faster.**
Real incident, 2026-09-20: this table (and mivend#104's own comments) said `counterparty`'s
inn/erpGroupLabel/departmentId were still blocked, citing a stale package version — by the time it
was checked, upstream#92/#118/#129 had already shipped them (and a separate creditBalance
stream) several versions ago, on the currently-published `@nlightn22/event-contracts@0.38.0` (this
repo was still pinned to `^0.14.0`). Always re-verify against the actual current `.d.ts`/proto
before implementing or before trusting this table's status column.

---

## Status legend

- ✅ **consumed** — implemented, live in `erp-integration`'s `InboundStream`/handler map.
- 🚧 **needed now, blocked** — real target, real mivend feature, waiting on Integration Service to
  ship something (field, flag, or protobuf formalization).
- 🎨 **needed now, design in progress** — data is available or will be soon, but mivend's own
  entity/schema/business-logic design isn't finished yet (not an upstream blocker).
- 💤 **needed later, no target** — real data, no mivend feature/product decision yet; not asking
  Integration Service for anything until a target exists.
- ⛔ **not needed** — researched and closed; mivend gets the same information another way, or has
  no use for it.

---

## Catalog domain (`erp.<entity>.events.v1`, proto package `company.catalog.events.v1`)

| Stream               | Status                         | Target                                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `category`           | ✅                             | `Category`                                                                                                                                                  | #158. Consumed: `entity_id` (FacetValue code, Collection slug), `version` (inbox out-of-order guard), `name`, `parent_id` (Collection hierarchy: missing parent -> private placeholder Collection filled by the parent's own event, no retry; changed parent -> `CollectionService.move`; absent = top level, a tombstone never re-parents), `is_active`, `is_deleted`. Each category filter is `containsAny` over its whole subtree's FacetValues, refreshed by a periodic recompute (`categoryFiltersRecomputeIntervalMs`, default 1h). Deferred: `event_id`/`occurred_at`/`updated_at` (envelope-only). Contract has no `is_folder`. Children of a deleted/not-yet-synced parent are hidden with it (`feedHidden` custom field). Design record: `docs/category-hierarchy.md`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `product`            | ✅                             | `Product`/`ProductVariant`                                                                                                                                  | `defaultSalesUnitId` is a soft link to `unit` (see that row); VAT code without a default category stays a retry (config case). |
| `price`              | ✅                             | `ProductVariantPriceEntry`                                                                                                                                  | | #297: the entry is keyed by the product ERP id (`productId`) + price type code, so a price is stored before its product arrives and the variant resolves it at read time; rows for products the ERP never sends as products stay stored and unused. #259: a tombstone or `is_active` false/absent deletes the entry for productId + priceTypeId (all readers query the table live). A tombstone for an unknown price type is a noop; an upsert for a price type that has not arrived retries (missing dependency, #96); a later upsert restores a deleted entry. |
| `price-type`         | ✅                             | `PriceType`                                                                                                                                                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `stock`              | ✅                             | stock/reservation                                                                                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `storage-location`   | ✅                             | `ProductVariant.customFields.organizationId`; rows in `storage_location_assignment` also keep the ERP `warehouseId` (#237)                                                                                                                | | #259: row key is the envelope `entity_id` (field 3), not `storage_location_id`, which is empty on a tombstone. A tombstone deletes that row and re-elects the winner; an unknown one is a noop and creates nothing. |
| `warehouse`          | ✅                             | `Warehouse`                                                                                                                                                 |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `organization`       | ✅ (partial)                   | `OrganizationRequisites`                                                                                                                                    | Partial-create only (name+isActive). Full legal requisites (inn/legalAddress/bank/signatory) blocked on **upstream#114** — tracked separately, long-standing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `offer`              | 💤 deferred (deliberate no-op) | —                                                                                                                                                           | Issue #62 design point 5 — no Seller/Channel/StockLocation mapping decided.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `stock-organization` | ✅ | `StockOrganization` (ERP-owned, key productId + organizationErpId) | Quantity per product and organization in the product storage unit, no warehouse dimension, negatives kept. A tombstone deletes the row; absent `is_active` = active (optional bool). Soft ERP-id keys, so no dependency retry. Read via `StockOrganizationReadService.getOrganizationStock` (#237). |
| `unit`               | ✅                             | `UnitRecord` (local cache) → `ProductVariant.customFields` (`unitRatioToBase`/`unitWeightKg`/`unitVolumeM3`, plus `defaultSalesUnitId` as the join key back) | mivend#103. Order weight/volume display (client + manager) + branch-conditional packaging enforcement (`BranchSettings.packagesOnly`, `@mivend/plugin-moq`'s `MultiplicityOrderInterceptor`). Join key: `ProductChanged.defaultSalesUnitId` == `UnitChanged.entityId` (confirmed against the contract's own doc comment, not just `(ownerId, code)`), resolved via `UnitLookupService`. Field-by-field: `event_id`/`occurred_at`/`updated_at` envelope-only (no consumer); `entity_id` is the join key itself; `version` drives the inbox's own out-of-order guard, not read in-handler; `volume_l` carries cubic metres despite its name, stored as m³ unconverted; `owner_id` (optional) stored as-is, informational only (null = shared classifier unit, else = owning product's ERP id); `code`/`name` stored as-is; `ratio_to_base` (plain double, proto3 zero-value) read as `?? 0`, not skipped when absent; `weight_kg`/`volume_l` (optional double) consumed when present, real absence otherwise; `width_mm`/`height_mm`/`length_mm` NOT consumed (no feature reads dimensions yet); `is_deleted` stored as a flag only, never deletes the row (a deleted-but-still-referenced unit stays resolvable rather than dead-lettering its product). Out-of-order arrival: product-before-unit retries via `MissingDependencyError`; unit-after-product refreshes already-imported variants via `UnitStreamHandler`'s own `defaultSalesUnitId`-keyed lookup (mivend.audit.common finding, fixed). **Soft link from product**: a product whose `defaultSalesUnitId` has no `UnitRecord` yet is saved with the id and null unit fields (reasoned `noop` outcome, no retry); this handler refreshes every variant with that unit id when the unit arrives. Both handlers take the lock `unit:<id>` so a unit arriving mid-import is not missed (test: `unit-product-backfill.int.test.ts`). MoQ does not enforce packaging while the ratio is null. |
| `manufacturer`       | ✅                             | `Manufacturer` (+ `manufacturer` FacetValue)                                                                                                                | mivend#164. Authoritative name source for the catalog Manufacturer facet; ProductChanged still creates a nameless stub so references resolve first. `entity_id` == `ProductChanged.manufacturer_id`; `name` consumed (empty skipped); `is_deleted`/`is_active`/`parent_id` not consumed (a deleted manufacturer keeps its name). Unnamed manufacturers are hidden from the facet response.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `region` | ✅ | `RegionRecord` (reference cache) | event-contracts 0.50.1, `erp.region.events.v1`. `entity_id` = `CounterpartyChanged.region_id`. Consumed: name, code, optional region_code/address_code/parent_id (soft link, no FK), is_active, is_deleted (tombstone keeps the row). Optional fields omitted = null (full snapshot, latest wins via inbox version guard). Missing name/code skipped. |
| `legal-form` | ✅ | `LegalFormRecord` (reference cache) | event-contracts 0.50.1, `erp.legal-form.events.v1`. `entity_id` = `CounterpartyChanged.legal_form_id`. Consumed: name (abbreviation), code, optional full_name, is_active, is_deleted (tombstone keeps the row). |
| `bank` | ✅ | `BankRecord` (reference cache) | `erp.bank.events.v1` (in the contract since 0.47, consumed from #188). Consumed: name, bik, optional correspondent_account, is_active (absent = false, project convention), is_deleted (tombstone keeps the row). |
| `bank-account` | ✅ | `BankAccountRecord` (reference cache) | `erp.bank-account.events.v1`. `entity_id` = `CounterpartyChanged.main_bank_account_id`. Consumed: account_number, bank_id (soft link to bank), owner_id + owner_type (soft link to counterparty/organization, indexed), is_active, is_deleted. No FK, no resolution; arrival order undefined. |
| `counterparty` (new fields) | ✅ | `Counterparty` columns | 0.50.1: main_contract_id, full_name, main_bank_account_id, ogrnip, kpp, okpo, legal_type, region_id, legal_form_id stored as-is. Reference ids are soft links (no FK; target may arrive later or never; main_contract_id may point to a contract absent from the contract stream). Omitted = keep stored value, explicit null clears (same as inn/phone). Price type from the main contract is not resolved yet. |
| `product-photo` | ✅ | `ProductPhoto` (metadata) -> Vendure `Asset`s on the `Product` | mivend#181 (upstream#170). `ProductPhotoChanged`, event-contracts 0.46.0+. One event per file (`entity_id` = file id), `product_id` = `ProductChanged.entity_id`; dedupe by (entity_id, version). Consumed: product_id, content_hash (MD5 of the normalized file, verified after download), mime_type, position (plain int32, absent = 0 = main/featured), download_url (pre-signed, 7 days from publish), download_url_expires_at, is_deleted (tombstone: detach + drop row). Envelope event_id/occurred_at/updated_at not consumed (inbox records them). Product not imported yet -> retryable. Expired/refused link or hash mismatch -> row `failed`; fix by replaying the file id via `POST /api/resync/v1/replay` (`aggregateType: productPhoto`, `sourceSystem: <configured source system>`). Same hash stored once. Replay verified live on staging-integration (2026-10-06): `aggregateType: productPhoto` accepted, response `{aggregateType, results:[{entityId, status, outboxEntryId}]}`, status `replayed_from_business_db` or `not_found`. `sourceSystem` comes from `INTEGRATION_RESYNC_SOURCE_SYSTEM` (required, no default). ERP is the sole owner of product photos: the sync replaces the product's whole asset list; manually added assets are removed on the next sync. Syncs are serialized per product (advisory lock). Backfill on the source side is partial by design. |
| `vat-rate`           | ✅                             | `TaxRate`/`TaxCategory`/`Zone` (auto-create/upsert, replaces manual Vendure tax setup)                                                                      | mivend#141. Consumed: `code` (mapped via the same Cyrillic->Latin table `product.handler.ts` uses, find-or-creates `TaxCategory` if needed — code-keyed, not product-keyed, so this stream doesn't wait on `product`), `percent` (upserts `TaxRate.value` by `(erpVatCode, zone)`; genuinely absent means "auto-registered, not confirmed yet" — never coerced to 0). Deliberately deferred: `event_id`/`occurred_at`/`updated_at` (envelope-only), `zone` beyond confirming today's single "RU"/"Russia" assumption (no multi-zone support until a real second zone exists), `is_deleted` (logged as a warning only — never deletes/disables the `TaxRate`/`TaxCategory`, a human decides whether a VAT code is genuinely retired). See `vat-rate.handler.ts`'s own field-by-field comment.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Customers domain (`erp.<entity>.events.v1`, proto package `company.customers.events.v1`)

| Stream                        | Status                                              | Target                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | mivend issue                                                            | upstream issue                                                                                                                                                                                 |
| ----------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `department`                  | ✅ (fixed)                                          | `Department`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                       | —                                                                                                                                                                                                     |
| `counterparty`                | ✅ (partial)                                        | `Counterparty` — name/isActive/inn/erpGroupLabel/departmentId/managerId(s)/legalAddress/factualAddress/phone/officialEmail consumed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | #104, #109/#110/#127 (managerId resolution), #131 (address/phone/email) | #92/#118/#131 shipped/live (verified against `@nlightn22/event-contracts@0.39.0`) — `notificationPhone` deliberately deferred (see counterparty.handler.ts's own field accounting), no other gap open Manager (`managerId`/`managerIds[0]`) is a **soft link**: `managerErpId` is always stored; `assignedManagerId` is set when the ERP user is linked to an Administrator, otherwise it stays null, the counterparty is saved without retry (a missing ERP user gives a `noop` outcome with the reason) and `AdministratorLinkedListener` back-fills it when the user links. The manager id may reference a **user group** of the ERP users catalog (groups are never published on `user`), so a null assignment can be permanent, not a race. A missing manager never holds the counterparty or the contracts behind it. |
| `counterparty-credit-balance` | ✅                                                  | `Counterparty.creditBalance` (register-driven, separate from `counterparty` above)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | #104                                                                    | #129 shipped/live                                                                                                                                                                                     |
| `contract`                    | ✅                                                  | `Contract` (@mivend/plugin-counterparty) — every field consumed; #50's credit-gate service (`CreditLimitCheckService`) is standalone, not wired into checkout                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | #105, #50                                                               | #123/#124 shipped/live, verified against `@nlightn22/event-contracts@0.42.0`                                                                                                                          |
| `user` | ✅ (partial) | `Administrator` enrichment — email/departmentId/fullName/isActive/isDeleted (#109, #119); `positionId` → `erp_user.positionErpId`, linked or not (#251) | #109, #119, #251 | role still not consumed |
| `position` | ✅ | `ErpPosition` (`erp_position`, @mivend/plugin-access-control); referenced softly by `erp_user.positionErpId` | #117, #120, #251 | — |
| `point-of-sale`               | ✅ (partial)                                        | `TradingPoint` (@mivend/plugin-counterparty)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | #100                                                                    | #121 — shipped/live, verified against `@nlightn22/event-contracts@0.42.0`                                                                                                                             |
| `discount-setup` | consumed (#290) | `DiscountSetup` + recipient/product member tables (plugin-price-entry); one row per ERP setup document, see "Discount and retro-bonus setup documents" | #290, #289 | filter-mode products are evaluated lazily (#296); price groups, bonuses, fixed prices, weekday windows and unknown filter shapes are stored inactive |
| `granted-discount`            | ✅ consumed (#101)                                  | `GrantedDiscount` (plugin-price-entry), read-only shipment-time fact, never feeds price resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | #101                                                                    | #127/#128 resolved — `orderEntityId` shipped in contracts 0.38.0                                                                                                                                      |
| `retro-bonus-setup` | consumed (#290) | `RetroBonusRule` + counterparty/product member tables (plugin-retro-bonus, manager-portal-only, read-only) | #290, #289 | filter-mode lists are evaluated lazily (#296), the counterparty side narrows the display |
| `granted-retro-bonus`         | ✅ consumed (#106)                                  | new `GrantedRetroBonus` (manager-portal-only, pairs with `retro-bonus-setup`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | #106                                                                    | none open (`operation_kind` kept opaque display text, by design)                                                                                                                                      |
| `settlement-document` | consumed (#224) | `plugin-settlement`: `SettlementDocument` -> `SettlementDocumentEntry` -> `SettlementOrderLink` (ERP-owned, minor units) | #224 | storefront section and acts (#226) pending |
| `settlement-balance` | consumed (#224) | `plugin-settlement`: `SettlementBalance` per (organization, counterparty, contract); `closing_balance` authoritative | #224 | storefront section pending |
| `settlement-document-type` | consumed (#227) | `plugin-settlement`: `SettlementDocumentType` reference (category, `customer_visible`); drives the customer visibility of settlement documents | #227 | none |
| `order-status` | consumed (sp#200) | `plugin-erp-order`: `OrderStatusReference` (code, name, rank, terminal, customer_visible, description, warehouse_started, shipped, delivered, cancelled, customer_group, is_deleted) = the order status dictionary (event-contracts 0.70.0); every status decision reads these attributes, no status name in code. All 17 fields consumed (event_id/occurred_at/entity_id are transport keys; version guards ordering; updated_at redundant with version) | sp#200 | topic `erp.order-status.events.v1`; mivend-pipeline statuses stay local |
| `promo-rule`                  | ✅                                                  | existing `DiscountRule` (plugin-price-entry) — same table as the facet/price-type threshold rules, extended with `triggerProductErpId`/`triggerQuantity`/`giftProductErpId`/`giftQuantity`/`operationKind` (product decision: not a separate table). Consumed: `entity_id`, `trigger_product_id`, `trigger_quantity`, `gift_product_id`, `gift_quantity`, `percent`, `operation_kind` (mapped to a closed 4-value union), `effective_from`/`effective_to`, `is_active`, `is_deleted`. `effective_to` is an optional timestamp (#282): absent is stored as `validTo = NULL` (open-ended) but never applied, since the promo and order-preload queries keep `validTo >= now`; invalid payloads (missing/bad `effective_from`, bad timestamps, non-finite numbers, missing trigger/gift fields) fail visibly as `NonRetryableInboundError`. Deliberately deferred: `event_id`/`occurred_at`/`updated_at` (envelope-only, no current consumer), `source_document_id` (no current need to trace back to the source ERP document), `warehouse_id` (promo rules applied warehouse-agnostically — no per-warehouse promo concept yet), `min_positions_count` (no current basket-composition rule beyond trigger_quantity). Storefront `CartPromoBanner.vue` UI deliberately not built yet (own confirmation needed — cart banner vs. product page vs. both) | #107                                                                    | none open (`operation_kind` closed via #126)                                                                                                                                                          |

## Orders domain (one topic `erp.order.events.v1`, proto package `company.orders.events.v1`)

| Stream                      | Status | Target                                                                                                                                                                                                                                                                                                                     | mivend issue | upstream issue |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------- |
| `order-registration-result` | ✅     | `Order` reservation confirmation                                                                                                                                                                                                                                                                                           | —            | —                     |
| `order-changed`             | ✅     | `Order` live status/reservedQuantity/contractId, and the status facts hasOrder/hasRealization/markedForDeletion/inDelivery/delivered (event-contracts 0.69.0: `status_code` (field 38, optional) is the only status input into our `erpStatus` via the `order-status` reference, the five status facts stay on the contract but are deliberately NOT read (status_code supersedes them, sp#200); `status_code` CANCELLED cancels the local order; `documentNumber` deliberately unconsumed — already stored from order-registration-result) (appliedDiscountAmount/priceTypeId/comment deliberately unconsumed — no current need, see #101; header customerId/organizationId/warehouseId and per-line plain quantity also deliberately unconsumed — redundant with the already-known local Order, no current consumer) | #110, #194 (sp#189) | #123/#125 Line `unit_id` (event-contracts 0.57.0, #214): `reserved_quantity` is in that unit (absent = base), converted to base units via `UnitRecord.ratioToBase` before the reservation comparison; an unknown unit retries as a missing dependency. |
| `order-cancel-result` | ✅ | `Order` answer to `cancel-requested`: `cancelled` -> local cancel, `rejected` -> refusal recorded (`cancelRequestStatus`/`cancelRefusalReason`), staff notified | #194 | `order_uuid` correlation key; `status` drives the outcome; `business_rejection_reason.code/message` stored; `entity_id` inbox key; `event_id`/`occurred_at`/`version`/`updated_at` envelope; `order_entity_id` deferred (already stored from the registration result); `is_deleted` tombstone skipped |

---

## Cleared vs not sent (#259)

Decoding is `toJson(fromBinary(...))`: an unset `optional` field has no key, a set one is emitted even when `''`;
null never appears. So absent and `''` are both possible encodings of "cleared" and the handler cannot tell
them apart. The integration service re-publishes the whole entity, so on a **named** event (name present,
not a tombstone) one rule applies per stream; a tombstone (no name) never touches field values.
Confirmed by the integration service owner (2026-10-21, from its outbox): every event is full state, never partial;
a cleared field arrives as an absent key (one product has a literal `''`), so both mean cleared. A tombstone has an
empty body (price: no productId/priceTypeId; storage-location: no productId/storageLocationId); identity is only the
envelope `entity_id` = Kafka key (`productId:priceTypeId`, `productId:warehouseId:priority`), identical to the upsert's.

| Stream | Cleared fields (absent or empty = clear) | Kept as before (absent = keep) |
| --- | --- | --- |
| `counterparty` | legalAddress, factualAddress, phone, officialEmail | inn, group, department, manager, ERP reference ids |
| `point-of-sale` | address, latitude, longitude, contactPhone (the existing primary contact's phone) | name, counterparty, active flag |
| `organization` | phone | legal requisites (inn, kpp, ogrn, address, bank): proforma invoices need them, an empty one never wipes; signatory list (an empty list keeps it) |
| `product` | manufacturerPartNumber, fullName, `erpCreatedAt` (`source_fields["ДатаСоздания"]` date value only, other kinds ignored; absent clears it; defines "new" as `COALESCE(erpCreatedAt, createdAt)` for the New arrivals widget, #298); barcodes, characteristics, manufacturer codes were already full-replace | manufacturer reference |
| contact person | no consumer (`counterparty-contact` is ignored) | n/a |

## Non-trivial design decisions (so they don't need re-explaining next session)

### Per-contract credit limits — "facility + sublimits" model (issue #50)

World-practice research (SAP FSCM credit account hierarchy, Oracle Receivables party hierarchy,
banking facility/tranche practice) → **decided model, deliberately not a copy of ERP's own
mechanism** (ERP is a data source only):

- `Counterparty.creditLimit`/`creditBalance` stay the master/aggregate ceiling — unchanged,
  always checked, for every contract regardless of mode.
- A `Contract` gets an **individual cap** only when ERP's explicit `КонтролироватьПоДоговору`
  flag is true (not inferred from `credit_limit` merely being present — that was tried and
  explicitly retracted). When true: that contract's own current balance is checked against its
  own `creditLimit`, **usage-based** (not reserved/carved-out capacity — declared sub-limits can
  nominally sum to more than the master, only actual current usage is checked against it).
- Two independent checks per order: (1) the specific contract's own cap, if it has one; (2) the
  counterparty's aggregate cap, always.
- Order→contract attribution needs `contractId` on the order stream — shipped/live
  (upstream#123, carried on `order-changed`, consumed by mivend#110).
- Transition period: today, with zero per-contract data flowing, behavior is unchanged from
  today's flat single-limit model — the per-contract check only activates itself as real
  `controlledIndividually`/`creditLimit` data arrives per contract, no migration step needed.
- `CreditLimitCheckService` is standalone, not wired into checkout — no `OrderProcess`
  guard/`PaymentMethodEligibilityChecker`/other hook exists anywhere in the codebase, and the
  project owner hasn't decided which one to use. Its per-contract check always returns
  `'undetermined'` until per-contract current-balance tracking exists (no
  `ContractCreditBalanceChanged` stream). Both gaps need their own follow-up issue before #50 is
  closed as done — do not close #50 as complete while either is untracked.

### `contract` field accounting (issue #105)

Verified against `@nlightn22/event-contracts@0.42.0`. `counterpartyId`/`organizationId`/
`priceTypeId`/`contractKind`/`contractType` are always-present raw passthrough, consumed as-is.
`counterpartyId` is resolved to the local `Counterparty.id` before storage, never kept as a raw
erpId. `creditLimit`/`currency`/`paymentKind`/`brandManufacturerId` are plain strings — no
zero-value-omission ambiguity, `'x' in payload` correctly distinguishes "not sent" from "sent as
empty/null." `controlledIndividually` (bool) and `debtDaysLimit`/`paymentDelayDays` (int32) DO
have the same proto3 zero-value-omission ambiguity as `isActive` elsewhere in this plugin — absent
is read as false/null, never "leave unchanged," so a real `true→false`/`N→0` transition from ERP
actually applies instead of leaving a stale value forever (mivend.audit.common finding on the
first pass at this handler). `name` doubles as the deletion-tombstone signal: a tombstone
deactivates an existing row by erpId only (no counterparty lookup, no other field touched) — same
class of bug as the point-of-sale #100 tombstone fix, caught by mivend.audit.common before push.

**Resolved for `creditLimit` (2026-10-07, #188)**: `Counterparty.creditLimit` is now our computed general limit
(credit-limit job), where 0/unset means "deferred payment unavailable", never "unlimited". The
`debtDaysLimit`/`paymentDelayDays` ambiguity below still stands.

**Known residual ambiguity (mivend.audit.common, second pass, non-blocking)**: `debtDaysLimit`/
`paymentDelayDays` now read `null` for both "ERP never set this" and "ERP explicitly set 0" — the
zero-value fix above can't distinguish the two. `creditLimit` stays presence-based (`'x' in
payload`), so an ERP-side reset to `''` won't clear a previously-stored value. Neither matters
today (the credit gate isn't wired in, and the per-contract check is always `'undetermined'`
regardless of these fields — see #150/#151), but **whoever wires #150's gate must not treat a
`null`/stale `debtDaysLimit`/`paymentDelayDays`/`creditLimit` as "no limit" or "unrestricted"** —
resolve the real presence-vs-zero distinction for these fields as part of that work, not assume
the current storage shape is enforcement-ready as-is.

### Discount and retro-bonus setup documents (#290, #289)

The per-register-row streams `discount-rule` and `retro-bonus-rule` are gone (event-contracts 0.78.0 / 0.82.0, topics
deleted by the Integration Service). The ERP now sends **one event per setup document**: `discount-setup`
(`DiscountSetupChanged`, topic `erp.discount-setup.events.v1`) and `retro-bonus-setup` (`RetroBonusSetupChanged`,
topic `erp.retro-bonus-setup.events.v1`). Key = document uuid, `version` strictly grows, a newer version is a full
replace, a tombstone (`is_deleted`) comes from deletion mark, unposting, or posting of a "cancel discounts" document.
The old rows cannot convert into documents: the migration drops them and the ERP re-delivers the documents.

**Storage** (plugin-price-entry / plugin-retro-bonus): one header row per document (`discount_setup`, `retro_bonus_rule`,
`erpId` = document uuid) plus member tables replaced as a unit under the document's advisory lock
(`discount_setup_recipient`, `discount_setup_product`, `retro_bonus_rule_counterparty`, `retro_bonus_rule_product`).
No arrays, no foreign keys, arrival order does not matter. A newer version with **equal content** (sha-256 over the
header and the sorted lists) only bumps the stored version; lists are not rewritten. An older or equal version is a
noop; a tombstone or `is_active=false` deactivates and keeps the newest version seen, so only a strictly newer version
reactivates. The "all" flags win over the lists and no list rows are kept behind them.

**Discount semantics** (read path `DiscountSetupRulesService`, called from `PriceResolutionService.resolve`): the
counterparty (a `recipients` row, empty = any), the contract (order only) and the price type
(`price_type_id`, when set the customer's effective price type must match; a markup is relative to a price type) are
mandatory matches. Overlapping setups never stack: the highest percent wins, a negative percent (markup) competes by
max. `condition` is the ERP enum value name; what it measures comes from the `discount_condition_kind` table
(`erpName` -> `quantity` | `amount` | `unconditional`, seeded at boot with the three names that carry a threshold or no condition, an unknown name never
matches, an empty one is unconditional). A quantity threshold sums the order quantity over the products of the setup's
list (all lines for an "all products" setup); an amount threshold is the whole document amount (kopecks vs currency units).
Catalog prices (no order) include only unconditional or threshold-0 setups of the counterparty itself.

**Not applied, stored inactive with a reason** (`inactiveReason`; the inbox row settles as a noop naming it):
no header percent (price groups, bonus lines, fixed-price rules: the ERP's zero-percent plus price shape), a numeric
`price_number`, a reference condition (`condition_ref_id`: payment kind, discount card), weekday windows
(`by_weekdays`/`weekday_windows`), any non-default `markup_type_id`, `purpose_id`, `currency_id`, `common_time_*`,
`pseudo`, price groups, bonus lines, set components or product-line attributes, an unknown `condition` name (reason
`unknown condition <name>`), an `operation_kind` missing from `discount_operation_kind` (`unsupported operation <name>`), no recipients (`no-recipients`), and a dynamic product filter mivend cannot evaluate (`unknown-filter-field`, `unknown-comparison`, `unknown-value-type`, `invalid-values`, `empty-filter`; the evaluable set is in `docs/pricing.md` "Filter-mode documents"). `limit_percent` is stored, not enforced.

**Field accounting, `DiscountSetupChanged` (0.82.0).** Consumed: `entity_id`, `version`, `document_number`,
`effective_from`/`effective_to`, `is_active`, `is_deleted`, `condition`, `condition_number`, `percent`, `limit_percent`
(stored), `price_type_id`, `all_products`, `product_mode`, `product_filter` (normalised into term rows, evaluated lazily), `product_ids` and `product_lines`
(their product ids), `recipients` (counterparty and contract; warehouse rows skipped). Read only to reject the document
(stored inactive): `price_number`, `condition_ref_id`, `by_weekdays`, a missing `percent`, and the non-default attributes
listed above. Deferred, no mivend feature
reads them yet: `document_date`, 
`discount_kind` (not checked: the contract gives no meaning for it and no fixture sets it; open question for the Integration Service, together with whether an empty `recipients` list means everyone, stored inactive as `no-recipients` until then), `allow_exceeding_limit_price` (the rejected attributes above are read only to reject),
`responsible_id`, `comment`, `common_time_from`/`common_time_to`/`weekday_windows` (a weekday setup is not applied),
`price_groups`/`bonus_lines`/`set_components` (no header percent), `source_fields` (a copy of the header). Envelope only:
`event_id`, `occurred_at`, `updated_at`.

**Field accounting, `RetroBonusSetupChanged` (0.82.0).** Consumed: `entity_id`, `version`, `document_number`, `percent`,
`condition_amount`, `condition_quantity`, `is_instant`, `accrual_period`, `accrual_day_number`, `accrual_kind` (empty for
legacy documents), `price_type_id`, `organization_id`, `recipient_counterparty_id`, `recipient_contract_id`,
`effective_from`/`effective_to`, `is_active`, `is_deleted`, `all_counterparties`, `all_products`, `counterparty_mode`,
`product_mode`, `counterparty_filter` and `product_filter` (normalised into term rows; the product side is validated, the counterparty side narrows the display), `counterparty_ids`, `product_ids`.
Deferred, no mivend feature reads them: `document_date`, `department_id`, `purpose`, `responsible_id`, `comment`,
`source_fields`. Envelope only: `event_id`, `occurred_at`, `updated_at`.

Retro bonus is display only (manager portal, query
`retroBonusRules`): shown for a counterparty by list membership, recipient or the all flag, narrowed by contract.

**Fixed-price rules (known limitation, future work)**: a "price instead of a discount" document is stored inactive and
ignored. **Markup (#283)**: a negative `percent` is applied for real, `price * (1 - percent/100)`, competes by max, and
is never shown as a discount or markup. Orders: `OrderDiscountService` keeps a signed per-unit state and
`orderDiscountAction` returns a positive item adjustment. Sign of `percent` follows the old register semantics
(positive discount, negative markup); a non-default `markup_type_id` stores the document inactive.

**Open questions for the Integration Service / owner**: whether `markup_type_id` (ERP discount-or-markup type) can flip the
sign of a positive percent; the real enum value names of `condition` (assumed the ERP programmatic names); how many
documents use a dynamic filter in production (answered by #296: 514 of 518 discounts, all retro-bonuses). **Dead code left in place**: the batched-apply capability
(`BatchInboundStreamHandler`, `integration-inbox-batch.ts`, #284) has no consumer now that the two rule streams are
per-document; remove it with the next inbox refactor.

### Order-time discount confirmation — two lifecycle stages, not one (issues #101/#110)

`OrderChangedLine.appliedDiscountAmount` = live view from the **order document**, can change
while the order is still being edited. `GrantedDiscountChanged` = confirmed fact from the
**shipment document** (`РеализацияТоваровУслуг`), a separate, later stage — same two-stage
pattern already established for reservation confirmation (`order-registration-result`/
`order-changed`'s `reservedQuantity` vs. an eventual shipment-time fact). Both streams needed;
they can legitimately diverge if the order changes between placement and shipment.

**`granted-discount` field accounting (#101)**: `entity_id`→`erpId` (Recorder+LineNumber, per shipment
line); `source_document_id`/`source_counterparty_id`/`product_id`/`discount_rule_recipient_id`/
`discount_amount` (raw ERP currency units, not kopecks) consumed, a malformed required field skips the
event; `order_entity_id`/`discount_document_id`/`condition` (opaque ERP enum text) optional → nullable.
`order_entity_id` is a plain ERP id, NOT a hard Order link and never a missing-dependency retry — a
shipment line may reference an order mivend never had. Not consumed: `event_id`/`occurred_at`/
`updated_at` (envelope). No UI yet (#155 manager, #156 storefront).

**Known gap, confirmed upstream (upstream#147)**: unposting a shipment sends nothing (no upsert,
no tombstone — an emptied register set never enters the DTO arrays), so the `GrantedDiscount` row stays
stale. A repost re-upserts lines with the same `LineNumber`, but lines whose number disappeared are never
tombstoned. Upstream also leaks the exchange-plan registration for the unposted recorder (possibly the
same root cause as upstream#136). Fix and semantics are up to upstream; do not show these
facts in the UI (#155/#156) until a tombstone arrives, then add an `is_deleted` branch here.

### Contact information list `contact_infos` (#290, event-contracts 0.82.0)

Added on `counterparty`, `counterparty-contact` (stream ignored) and `point-of-sale`: `ContactInfo {type, kind_name,
is_primary, presentation, comment}`, all contact information as a list, data not cleaned (a phone field may hold an
e-mail). **Deferred** on every stream: the old `phone` / `official_email` / `contact_phone` fields stay and are derived
from the list by the Integration Service, and no mivend feature reads the full list yet. Consume it when a feature needs
more than the first phone and e-mail (for example several recipients for notifications).

### `point-of-sale` field accounting (issue #100)

Verified against `@nlightn22/event-contracts@0.42.0` (upstream#121, current at
implementation time — re-check before trusting this if it's been a while):

- `event_id`/`occurred_at`/`updated_at`: envelope-only, no current consumer (same as every stream).
- `entity_id`: this stream's erpId, read generically by the inbox.
- `name` (plain string): consumed. A deletion tombstone never carries one (same convention as
  organization/counterparty) — no existing row means nothing to create/update, not an error.
- `code` (plain string): NOT consumed — no matching `TradingPoint` field, no current mivend
  feature reads it.
- `counterparty_id` (plain string): consumed — resolved to the local `Counterparty` by erpId. A
  miss is an ordinary cross-stream race (retryable via `MissingDependencyError`), never silently
  skipped.
- `is_active`/`is_deleted` (optional bool): consumed via the same `=== true` explicit read as
  every sibling handler — confirmed empirically (issue #89) that this contract's JSON encoding
  still omits the false zero-value even on a field declared `optional`.
- `address`/`latitude`/`longitude` (optional): consumed when present. `TradingPoint.address` is a
  required column — a brand-new erpId with no address yet is deferred (not created), same rule as
  the null-name tombstone case; an existing row's address only updates when the event carries one.
- `contact_phone` (optional string): consumed, but only ever applied onto an already-existing
  `ContactPerson` — this stream never carries a contact name, and `ContactPerson.name` is
  non-nullable, so a bare `contactPhone` can never fabricate a new contact. REST/portal (which
  does carry a name) must create the contact first.
- `contactName`/`workingHours`: not fields on this message at all — stay REST/portal-only, same as
  before this stream existed.

### Granted-fact tombstones (`granted-discount`, `granted-retro-bonus`)

`is_deleted=true` soft-deletes the row (`isDeleted`, tombstone version kept); only a strictly newer
version revives it. Known narrow edge: a tombstone arriving before any row exists is a no-op, so a
same-version upsert arriving later still creates the row. Future read queries over `GrantedDiscount`
(no read path yet) must filter `isDeleted = false`.

### Retro bonuses — manager-portal only, decision deferred for storefront

Explicit project-owner decision: retro bonus terms/facts (`retro-bonus-setup`/
`granted-retro-bonus`) show on the manager portal for a specific client (read-only) — **not on
the storefront**, "not all retro bonuses should be customer-visible," that call is for later, do
not build a storefront surface for this without a fresh explicit decision.

### Wire format — protobuf only

Codified in `external-integration-rules` skill: mivend never builds a consumer against a
still-JSON-bridge stream (`jsonMapperOnTopic` on Integration Service's side), only real generated
protobuf. See that skill for the full reasoning; `order-changed` (#110) is the current example
blocked by this rule.

---

## Upstream issue index (this thread)

For quick reference — all filed as part of this research pass, roughly chronological:
#114 (organization legal fields, pre-existing) · #117 (counterparty missing fields) · #118
(counterparty/contract field investigation) · #119/#120 (user email + role/position) · #121
(point-of-sale address/geo) · #122 (contract product scope — wrong question, superseded) · #123
(order stream contractId) · #124 (contract controlledIndividually flag) · #125 (order-changed
protobuf formalization) · #126 (discount/promo/bonus classifier value sets) · #127
(granted-discount vs. appliedDiscountAmount relationship) · #128 (granted-discount orderEntityId).


## Hard vs soft references (classification)

| Kind | Rule | References |
| --- | --- | --- |
| Hard | retry via `MissingDependencyError` | contract -> counterparty; point-of-sale -> counterparty; price -> priceType, variant; stock -> warehouse, stockLocation, variant; product-photo -> product; storage-location -> variant, organization; order lines -> variant (whole message waits) |
| Soft | store the id, never block, resolve later | counterparty -> manager, department, region, legalForm, bankAccount, mainContract; product -> unit; user -> position; price type via main contract |
| Config | keep retry, surface it | product VAT code without a default tax category |

Details and rationale: the `external-integration-rules` skill, section "Cross-entity dependencies".
