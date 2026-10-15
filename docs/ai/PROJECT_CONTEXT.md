# Project Context

Updated: 2026-10-15 20:00

## #197 concurrency HIGH findings (2026-10-15, DONE: audited 3 rounds, pushed `c9bd24a1`, closed)

- Findings 1/2/5 had been fixed by #204/#209. Fixed now: tier rebalance re-reads the sibling quantity under the order lock, logs and rethrows adjust errors after finishing passes and refreshing totals (`be66c862`, `1b1364f4`); `releaseReservations` = `UPDATE ... WHERE status='active' RETURNING` under `reserve-order:<id>`; `markReservationFailed` under the same lock, skipped when active rows exist (`55bf899c`).
- `payProformaInvoice`: non-capture outcomes lock and re-read the proforma invoice (`ProformaInvoiceService.findOneForUpdate`) inside the transaction; **a capture must not take that early lock** — `allocate()` locks the counterparty's open documents in FIFO (`createdAt`) order and an earlier single-row lock deadlocks two captures (`c9bd24a1`, test `payment-pending-race.int.test.ts`).
- Accepted LOW: no int tests for two concurrent pending payments / withdraw vs payment; currency/organization from the pre-transaction snapshot (immutable). Tier rebalance has only unit tests; #196 (its replacement) must ship a real-Postgres concurrent test (comment on #196). 17 MEDIUM audit findings still to triage.

## #175 / #232 / #112 / #238 + ERP status cycle (2026-10-14..15, DONE: audited twice, pushed `d5e365b8`, closed; leftovers #239)

- **Order page / list (#175):** repeat order via cart, copy-number button (execCommand fallback on http), reserve column, `OrderDetailPage` split. Status badge = label of the status's `customerGroup` (pending/confirmed/in_transit/delivered/cancelled/rejected; no status code in the frontend), exact dictionary name only in the badge `title` and history. List tabs built from dictionary groups: Active (everything except delivered+cancelled, `erpStatus.notIn`), Awaiting approval, Preparing, On the way, Completed, Cancelled, All; source default "Placed here"; empty status set matches nothing. Storefront has only a ru locale file (labels are ru; localization is a separate task).
- **Status history (#232):** `order_status_history_entry` (migration 1791509000000, backfilled from placement time; `occurredAt` = ERP event time, migration 1791510000000), filtered server-side to customer-visible dictionary statuses. Shop `orderStatuses` returns only customer-visible statuses and the fields the storefront needs; Admin keeps the full dictionary (`ReadOrder`).
- **ERP reserve (#112):** `erp_order_reserve` replaced atomically per order under lock `erp-reserve:<orderId>`; an event without lines changes nothing; customer "reserve" column; manager holders with paging after visibility. `ReservationSettings` provider (options `defaultReservationDays`, `rejectedOrderReleaseDays`) replaced the module global.
- **Cancel (#194 follow-up):** a refused cancel (`REFUSED`) no longer blocks: repeat `cancel-requested` with a fresh eventId; integration side resets its earlier command (subject needed FORWARD compatibility in Schema Registry; done by the integration team). Repeats are not rate-limited (#239).
- **Delivery vs pickup (#238):** `confirmed` carries `pointOfSaleId` (+ `deliveryAddress` text, printed docs only); only `pointOfSaleId` makes a delivery; a customer-added point has no ERP id so it goes as pickup (warn log). event-contracts `^0.72.1`. Status derivation by receiving method is in `docs/order-contracts.md` ("ERP status derivation by receiving method"). Verified on staging: delivery cycle PICKING->SHIPPING->DELIVERING->DELIVERED, pickup PICKING->DELIVERED; APPROVED never appears when approval and the warehouse order are created in one posting.
- **Short mivend status names** ("Not accepted", "Passed", "Reserved"; explanations in `description`); provisioning upsert updates name/description on boot.
- **Credit limit of the staging test customer** was blocked by old open test orders; cancelled (5 local, 2 closed by the integration side, 15 via 1C). Only the fresh test orders 43/44/45/48/55 remain.
- **Test lesson:** a nested `withTransaction` in the reserve-order test harness must join the ctx's open transaction (like Vendure), otherwise a lock taken twice hangs cancel suites; unit tests do not catch it, `make test-int` does. Fixtures must mirror real column types (a varchar custom field vs int id hid a production query failure).
- **Open:** #236 (release the local reserve only when the ERP holds the quantity; decision written in the issue, implement in a new session), #237 and #233 (other sessions), #239 (non-blocking audit leftovers), reserve shown on delivered orders (proposal: hide for terminal statuses, not decided). `make ci` is no longer a pre-push step (run by the audit session about once per three issues).

## #234 Kafka topic rename (2026-10-14, closed)

- Names are `<writer>.<entity>.<kind>.<version>`: ERP writes `erp.<entity>.events.v1`, mivend writes `mivend.order.commands.v1`. One consumer for `erp.order.events.v1` (`order-events-message.ts`) routes by header `type` to the inbox streams `order-registration-result` / `order-changed` / `order-cancel-result`; `change-result` and unknown types are skipped. Verified live on staging-integration.

## #215 / #224 / #227 historical ERP orders and settlement documents (2026-10-13, closed, on main; follow-ups #228/#229/#226)

- **External orders (#215)**: an `order-changed` with no `orderUuid` and no `erpOrderId` match becomes an `Order` with `isExternal`, direct `counterpartyId` (pending until the counterparty exists, then attached by event + periodic reconcile), no Customer, state written directly from `erpStatus` (forward-only), read-only (transition guard, no reserve/cancel/proforma/confirm, no access by code). Visibility everywhere by `counterpartyId` (COALESCE with the customer's counterparty for drafts). Storefront "My orders": From ERP badge, source filter, ERP document number. Migration adds a unique partial index on `erpOrderId`: a DB with duplicates stops with a clear error. Decisions in `docs/order-contracts.md`.
- **Settlement documents (#224)**: plugin `packages/plugins/settlement` (documents -> entries per organization/counterparty/contract triple -> order links, balances per triple). Streams `settlement-document-changed`, `settlement-balance-changed`, `settlement-document-type-changed` (event-contracts 0.68.x). Key = ERP document uuid; whole-entries replace; tombstones kept 2x the retention period; `closing_balance` authoritative, never summed; pending references attached by events and a periodic reconcile; retention cleaner (period `settlementRetentionMonths`, default 12, in the Vendure admin).
- **Customer visibility fails closed (#227)**: a document is shown only if its type is `customerVisible` in the ERP reference AND its contract has `isCustomerContract` (true also for employee contracts, salary types are invisible). Categories (sale/payment/return/correction/bonus) come from the reference. The two interim admin settings were removed.
- **Payment term vs amount limit (docs/payments.md)**: the term is the counterparty's `paymentDelayDays` (own `debtDaysLimit` for an individually controlled contract); `Contract.paymentDelayDays` is empty in 1C, never read; no term = no due date, nothing overdue. Currency arrives as ISO numeric (643), the API returns alphabetic.
- **Storefront menu**: Account statement (`/settlements`) + collapsible Documents group (Proforma invoices, Contracts and files, Reconciliation acts placeholder). The old Payments page was removed by owner decision.
- **Fractional quantities**: Vendure `OrderLine.quantity` is an integer; sell measured goods in a small base unit (ml, g) (docs/order-flow.md).
- **Contour facts**: ERP seeds only a debt-covering window (+12 months) per triple, so old paid contracts have no documents (verified with search-platform). 12.8k failed `stock` rows on staging-integration came from a hidden warehouse tombstone (fixed, rows stay failed). `ts-node-dev` children can spin at 90% CPU and never listen: kill the children by PID, `touch` a file to respawn; never `pkill -f` with a pattern that matches your own shell.


## #206 proforma invoices + #222 form of payment vs terms (2026-10-12..15, done, audited 3 rounds, pushed `865ed997`, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-15-206-222-sections-full.md`)

- **Model (docs/payments.md "Proforma invoice: concept, versions, statuses")**: a proforma is INFORMATIONAL, never closed; the only source of debt is the ERP sales invoice (realization; ingestion + a "by shipment" version are NOT built, fields `kind`/`salesInvoiceNumber` are prepared). One document per (order, organization), many versions; number `<order>-<NN>-<version>`; per-version `issuedAt`/`dueDate` (`BranchSettings.proformaPaymentTermDays` 1..90, default 3; re-issue resets the term by design). Statuses shown: Current / Superseded (newer version exists, still payable) / Cancelled (withdraw action, refused with allocations or an active attempt); "paid" is not shown on a proforma, order level shows `Order.erpPaidAmount` (lower bound from `order-changed.paidAmount`).
- **Snapshots**: lines (with `taxRate`/`taxAmount`), content hash decides reuse/new version under `proformaInvoices-for-order:<id>` lock; paid snapshots never rewritten (difference settled via the ERP). Print form follows the 1C payment-request layout on one A4 page, VAT as one total line, payment QR GOST R 56042-2014 ST00012 (own module, `qrcode` for drawing; required: name, account, bank, BIC, corr. account, sum, purpose, payee INN). Required requisites: legal name + INN + bank; address/KPP/phone/signatories optional (organization stream, contract 0.66).
- **Form of payment vs terms (#222)**: forms `cash` / `offline-terms` (bank transfer) / `online-stub` (card); limit control is a policy for every form (`CreditPlacementService`, lock `credit-exposure:<counterparty>`), route in `Payment.metadata.placement`; over limit waits for a manager unless the branch allows exceeding and the customer acknowledged; card amount = excess + total and cures the order; prepayment orders reserve with `prepaymentReserveDays` (default 3); manager action `confirmPaymentReceived` (`ConfirmPaymentReceived`). `deferred-payment` method removed.
- **Payments**: FIFO allocation module (`SettlementEntry`) is FROZEN, not extended, not used for display; owner idea for later: the customer allocates a payment across orders in our system (needs an ERP contract). The ERP REST callbacks are a TEST tool (docs/environments.md), off by default, key-protected; the payment fact carries amount + currency + required `proformaInvoiceUuid`.
- **Open**: realization ingestion and "by shipment" version (#224 stream), customer-driven allocation, e2e sets `storefront/checkout-credit` and `proforma-organizations` written but not confirmed green on a stable contour (PDF specs need a worker; they fail on CI without one), dashboard GraphQL types regeneration, withdraw vs concurrent payment lock, integration-side proforma contract (search-platform#198), #230 (storefront connection bar), shop API 500 on proforma/order lists for a session without customer.
- **Owner preferences**: no production, destructive/no-compat changes are fine (staging-integration DB holds real integration data: plain UPDATE/RENAME only, never reseed); the owner's 1C sample PDF/xlsx are private, never copy real data into the repo.

## #223 legacy-name rename (2026-10-12, done)

- Routes `/proforma-invoices` (both portals), `ProformaInvoice*`/`useProformaInvoices` files and `pages/proforma-invoices` folders; persisted keys: Document.type `proforma-invoice`, numbering type `proforma-invoice` (`mivend_number_seq_proforma_invoice`), permission `ReadProformaInvoice`, access-scope key `proformaInvoice`.
- Migration `1791490000000-proforma-invoice-persisted-keys` is plain UPDATE/RENAME; the synchronize contours (local, staging-integration) do not run migrations, so its SQL was applied once by hand there.
- Left on purpose: storefront checkout payment-form id `'invoice'` (maps to `offline-terms`), unused numbering type `proforma`; the one-off `renumber-documents-207` script and test were deleted.

## #218 + event-contracts 0.57.0-0.61.0 + cross-check with search-platform (2026-10-11, shipped/audited/closed, on main)

- **Done**: `OrderChanged.document_number` (field 15, sent on every emission) refreshes `erpRegistrationDocumentNumber` from every `order-changed` (non-empty only; stale events dropped by the inbox version check); a registration result without a number no longer erases a known one (`81ed1e72`). `order-changed` line `unit_id` and `order.submitted` `unitId` shipped in #214. Contracts now `^0.61.0` (only `PromoRuleChanged.effective_to` became optional; a promo rule without an end date is NOT legitimate and stays skipped, owner decision). `pnpm-lock.yaml` was edited by hand (pnpm 11 rewrites the whole file otherwise).
- **Live-verified with search-platform** (no new staging orders): unit with ratio 10 and quantity 2 round-trips unchanged; empty `unit_id` = base unit; `documentNumber` stable across emissions; foreign-unit rejection = `rejected`, `PROCESSING_ERROR`, null `orderEntityId`/`documentNumber`/`reservedLines`, text carries a 1C trace prefix `{...Модуль(242)}:` which we store and show as-is.
- **Caution**: the integration `outbound_command` queue is shared by production and dev 1C bases — never create test commands there without the owner confirming which base will pick them up.
- **Open**: live check of a package-only order with the 1C line (needs the Integration Service owner); a unit field on `order-registration-result`; pack display in catalog cards; dataloader for `packagingLevels`; the 1C trace prefix is shown to managers as-is.

## #194 reserve deadline / order cancel (2026-10-11, DONE: audited, pushed, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-13-sections-full.md`)

- One topic `mivend.orders.events.v1.order-events` (key `orderUuid`; types `confirmed` with `reserveUntil`, `cancel-requested`), ERP answers on `order-cancel-result`; statuses derive from ERP facts into `erpStatus` (forward-only). Rules in `docs/order-contracts.md`. Open: #216 translations, terminal ERP refusal, lost-answer auto-retry, deadline warning for registered orders.

## #208/#209/#211/#212/#213 (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-11-208-213-full.md`)

- #208 cross-system verification pass (runbook `docs/cross-system-verification.md`) plus concurrency hardening: order row lock in the contract guard, `erpOrderId` hidden from customers, sibling lock on tier rebalance, auto-reserve vs manual-confirm race. Spin-offs: #209 write only changed `customFields` keys (no stale full snapshots), #211 `UnknownOrderUuidError` (unknown `orderUuid` is not retried forever), #212 undecodable inbox rows can be dismissed (`dismissFailedIntegrationInbox`).

## Package-only sales (#214: audited, closed, on main) — spec in the issue; integration side search-platform#184/#186

- **Rule:** a variant is sold only in its default sales unit when it differs from the base unit (any ratio) AND the order's branch has `BranchSettings.packagesOnly` ON (positive attribute, default off; replaced `allowPiecewiseSale`, migrated and inverted; set in the manager portal: Settings → Branches → Branch settings → Sales). Order lines, stock and reservations stay in base units; conversion happens at the ERP boundary and in the UI. A ratio below 1 means the smallest whole base quantity (0.9 -> 9 base = 10 packs), see `wholePackagesQuantity`.
- **Multiplicity opt-in (#219):** `BranchSettings.enforceMultiplicity` (default off, manager Sales section) gates multiplicity enforcement (interceptor and reservation, both via `PackagingPolicyService.requiredMultiple`) and display (shop query `multiplicityEnforced`, admin `Order.multiplicityEnforced`; `MvProductRow`/`MvProductMainCards` take `showMultiplicity`). The pack rule is unaffected and replaces multiplicity.
- **Shipped:** `PackagingPolicyService` (moq) shared by the interceptor, the public shop query `packagesOnlySales` and the admin `Order.packagesOnlySales`; `unitId` plus quantity in that unit on `order.submitted` lines; variant custom field `unitName` (unit stream, backfilled); shop `Product.packagingLevels` (product-owned units); `order-changed` line `unit_id` (event-contracts 0.57.0) converted to base before the reservation comparison (mismatches already go to `reportQuantityMismatch`, shown to managers); storefront product card (Unit/Multiplicity/Packaging chips in `MvProductMainCards`, pack price, whole-pack stepper, "Add <pack>" in piece mode), cart, checkout; manager order lines show packs with the base quantity.
- **Gaps / notes:** `order-registration-result` has no unit field, so its reserved quantities are still read as base; catalog list/grid and favorites show the unit and the next pack level above the sold unit (#220, information only, no "+pack" button); the unit switcher for piece-sellable branches is only the "Add pack" action; UI strings of the new elements are English like the surrounding pages (unit names come from the ERP in Russian). Old staging orders from #208 (qty 1 of a 0.9 pack) violate the rule and show fractional packs.
- **Known gaps (audit):** with `packagesOnly` the pack rule replaces multiplicity (variant multiplicity 10 and pack ratio 6 sells by 6, the 1C MOQ is lost silently); catalog and favorites show units but the widgets and `ProductScrollRow` do not. Deploy: migration `1791486000000` set `enforceMultiplicity=false` on every existing branch (owner decision).
- **Staging data touched (allowed by the owner):** `unitName` backfilled by SQL; `branch_settings.packagesOnly` flipped to false and back to true for screenshots (both branches are packages-only).

## Orders, contracts, organizations, reserve model (2026-10-08/09; #201/#202/#203/#205/#199 shipped/audited/closed; #194/#208 done) — decisions in `docs/order-contracts.md`

- **Organization**: `ProductVariant.organizationId` comes from `storage-location` (winner per product from `storage_location_assignment`, any row with an organization). A variant without one is not sellable: hidden for customers, checkout gate (`organizationOrderGuard`, re-checked in `reserveOrder` and the `order.submitted` listener), the external search gets `requireOrganization` (post-filter stays). Line organization is stamped at `ArrangingPayment`; proforma invoices per line organization only for pay-by-proforma-invoice/online payment, none for deferred terms (the ERP holds accounting documents); proforma snapshots and versions are #206 (done: immutable `lines`, `version`/`superseded`, on-demand request, `ProformaInvoiceIssuingService`; see `docs/order-contracts.md`).
- **Contract**: `selectedContractId` set at `ArrangingPayment` (stored valid, else main active, else another active by price type/recency/`erpId`, else blocked); manager `setOrderContract` (ConfirmOrder, lock `reserve-order:<id>`, only before reservation/ERP receipt). `order.submitted` is per warehouse, header organization = the contract's organization + `contractId`; schema from `@nlightn22/event-contracts` (producer-owned, subject FORWARD, Confluent wire format); the ERP rejects a contract/organization mismatch.
- **#199**: a failed auto-reserve is stored on the order (`reservationFailureReason/Detail/At`, cleared on success) and shown to managers; the ERP's reserved quantities win (local hold released, difference recorded); the placement handler marks AWAITING_CONFIRMATION under a row lock only while NOT_REQUIRED.
- **Reserve/cancel model (#194, spec in the issue body, NOT implemented, separate session)**: A = cancel the reserve (1C closing document, scheduled job at `РезервДо`), B = cancel the order (mark for deletion, includes A); B only for pending orders (automatic), in progress = a request to a person, shipped = never; mivend must send `reserveUntil` (else the 1C job picks orders after ~4 months); the closing document exports no `order-changed` (live test), so explicit ERP signals are required (search-platform#179/#180). Today the expiry task still returns the order to AWAITING_CONFIRMATION.
- **Do not redo**: closing is not a cancellation; deferred-terms orders get no automatic proforma invoices; ERP-owned masters keep the ERP id.
- **Contour hazards**: `make dev` (local) can kill the staging-integration contour (start staging last); `ts-node-dev` can hang at ~90% CPU after a plugin dist rebuild (restart via `make`). Staging holds orders registered in 1C during tests (one of them had its 1C reserve closed by a test).

## #221 OrderLine uuid in its own table (2026-10-12)

- **Why**: Vendure's `addItemToOrder` merges into an existing line only if the variant **and every OrderLine custom field** match (`OrderModifier.customFieldsAreEqual`); a `customFields.uuid` made every add a new duplicate line. Never put an identity/immutable value into OrderLine custom fields.
- **Now**: `packages/plugins/order-identity` — `order_line_identity` (`orderLineId` PK/FK cascade, `uuid` unique), written by `OrderLineIdentitySubscriber.afterInsert` in the line's own transaction; read via `OrderLineIdentityService.uuidsByLineId` (one batched query; `OrderSubmittedBuilder` uses it). `Order.customFields.uuid` unchanged.
- **Migration**: `1791487000000-order-line-identity` (production) and `apps/server/src/order-line-identity-carryover.ts` (runs before bootstrap on synchronize contours, else synchronize would drop the column before the copy) share `migrateOrderLineIdentity`: create table, copy uuids, merge `AddingItems` duplicates (same variant + line custom fields, one list price, no adjustments, so stored totals stay exact). Applied on local and staging-integration (1 duplicate merged on staging). Audit fixes: a group with an active reservation is never merged (`Reservation.orderLineId` has no FK), `skippedGroups` is logged, the merge partition fields are guarded by `order-line-merge-partition.test.ts`, production startup fails fast when the table is missing (run `migration:run` first; production DB is empty, so running all migrations is safe). Cart e2e has a merge test; the e2e seed now has an active contract for the e2e counterparty (the #208 contract guard blocked every e2e order creation before).

## #207 identifiers (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-12-207-identifiers-full.md`)

- Every mivend-created entity has an immutable `uuid` (UUID v4, unique); exchange and idempotency key by uuid, human document numbers are numeric from DB sequences; `Order.customFields.uuid` via an EntitySubscriber, OrderLine uuid in `order_line_identity` (#221). Rules: `docs/identifiers.md`, AGENTS.md "Identifiers". The uuid/erpOperationId unification for Reservation is still open.

## #204 ERP order rejection (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-10-204-erp-order-rejection-full.md`)

`Order.customFields.erpStatus` REJECTED (non-terminal, cleared by a later non-rejected

## #195/#200 integration health + gateways (2026-10-10, shipped/audited/closed; pushed to a6c7028b) — full text: `.backup/PROJECT_CONTEXT-2026-10-09-195-integration-health.md`, runbook `docs/integration-health.md`

- Dashboard System -> Integration health: Inbound tab (stream x contract x Kafka lag x inbox backlog, drift rows, contract version vs registry via `EVENT_CONTRACTS_REGISTRY_TOKEN`, variants-without-organization/unit lines), Outbound tab (outbox per event type, skipped, schema source), Inbox issues / Outbound problems lists with Replay/Requeue/Rebuild (permission `RecoverIntegrationEvents`, SuperAdmin only so far). Count links work via user table settings (a ListPage with a `pageId` ignores URL filters).

## #198 order branch fallback + auto-reserve switch (compressed, shipped/audited — full text: `.backup/PROJECT_CONTEXT-2026-10-12-198-branch-fallback-full.md`)

- Branch of an order/proforma-invoice = `TradingPointService.resolveServicingBranchId` (point servicingBranchId -> Counterparty.branchId -> global default). `GlobalSettings.autoReserveOnPlacement` (default off) switches auto-reserve; a cart stuck in `ArrangingPayment` keeps its old `branchId`.

## #188 credit control MVP (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-10-188-credit-control.md`)

- Contracts stream feeds price type (main contract -> `CustomerPriceType` -> branch default, resolved at read time) and credit limit (job `erp-integration-credit-limit-recompute`, every 15 min); deferred payment needs limit>0 AND days>0; over-limit orders are placed with `creditLimitExceeded`, not rejected; customers see only `fullName`.

## #180 checkout payment methods + credit control (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-06-180-checkout-payment-credit.md`)

Over-limit deferred order is NOT rejected (flag `creditLimitExceeded`, manager confirms later); payment-method availability = server's `eligiblePaymentMethods`; `OpenDeferredExposureService` sums pending + open deferred orders with `erpStatus` PENDING/SENT_TO_ERP/RESERVED (now also excludes REJECTED, see #204 below). Open follow-up #182 (shipping method selector ignores choice).

## #176 / cart-checkout UX 2026-10-06 (compressed — full text: `.backup/PROJECT_CONTEXT-2026-10-11-176-cart-ux-full.md`)

- #176: characteristics/manufacturer-code replace runs under a per-product advisory lock. Cart mutations go through one queue in `stores/cart.ts`. Lesson: storefront must `import type` only from `shared` (a runtime import pulls `@vendure/core` into the Vite bundle).

## Product photos (issue #181, shipped/audited/closed; pushed to d845536; earlier design text: `.backup/PROJECT_CONTEXT.20261006-181-photos-design.md`)

- **Flow**: Integration Service stream `product-photo` (`ProductPhotoChanged`, event-contracts 0.46.0+, search-platform#170) -> `ProductPhotoStreamHandler` stores metadata in `ProductPhoto` (+ `syncQueuedAt`, `replayAttempts`) -> `ProductPhotoSyncService` (Vendure job queue `product-photo-sync`, must be in `worker.ts` activeQueues) downloads the pre-signed URL, checks MD5, `AssetService.createFromFileStream`, sets product assets by `position` (0 = featured). Same hash stored once; tombstone detaches. Serialized per product by `pg_advisory_xact_lock`; queue concurrency 1 (long transaction by design). ERP owns product photos: sync REPLACES the product's whole asset list.

## #166/#168/#164/#170 + 2026-10-05 storefront UX (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT.20261007-166-168-164-170-storefront-ux.md`)

- Characteristics: every key is a checkbox facet group (`characteristic:<key>`, FacetValue code = normalized value, `CharacteristicFacetService`, per-key advisory lock). No sliders/refId facets yet; internal search backend does not know characteristics (#177). Brand = `Product.manufacturer` (no brand facet); manufacturers have their own stream `manufacturer`.

## #162 favorites (compressed, shipped — full text: `.backup/PROJECT_CONTEXT-2026-10-12-162-favorites-full.md`)

- `stores/favorites.ts` keeps only ids (`mv_favorites`); `useFavoriteProducts` resolves prices/stock live in batches; the favorites page reuses `ProductListView` (#214).

## #164 category browse/filters on ExternalSearchPlugin (compressed, closed/audited — full text: `.backup/PROJECT_CONTEXT.20261006-164-category-facets.md`)

- Category = Collection slug `cat-<ErpId>`; manufacturer = Facet `manufacturer` (FacetValue code = ERP id, mirrored by `ManufacturerFacetService`). An unresolvable filter = empty result, never the unfiltered set.

## #70 guest price, branch stock tiers (compressed, closed/audited — full text: `.backup/PROJECT_CONTEXT.20261005-70-stock-tiers.md`)

- Guests: API resolves default price (branch default `PriceType`); UI hides price AND stock tier. Default branch/price type/RUB currency bootstrapped from options (`BOOTSTRAP_BRANCH_NAMES`, `DEFAULT_PRICE_TYPE_CODE`, `DEFAULT_CURRENCY_CODE`); branch is mivend's own entity.

## #160/#59/#158 search backend + category tree/hierarchy (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-03-04-160-59-158-full.md`)

Kafka `CategoryChanged.parent_id` builds the real Collection tree (design: `docs/category-hierarchy.md`); both portals render it (mega-menu/drill-down, `packages/shared/src/collectionTree.ts`); `SEARCH_BACKEND=external` resolves `totalItems`/ranking via search-service. Open: #159 (34 storefront e2e specs), staging products/facets blocked by #69.

## #117 Position entity (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT.20261005-117-position.md`)
`Position` (ERP master data) in `plugin-access-control`, fed by the `position` stream; `Administrator.customFields.positionId` = `Position.erpId` is a **soft link** (name resolved on read, no error if absent). erp-import `EmployeeRecord.position` -> `positionErpId`. Dev gotcha: ts-node-dev children can hang in `waitForFile` under load — free load, restart via `make dev`, never raw kill.

## Kafka reference streams #101/#102/#106/#108 (compressed, shipped/audited/closed)

Discount-rule (#108/#152-154), granted-discount (#101), retro-bonus-rule (#102) and
granted-retro-bonus (#106) streams are consumed by `erp-integration` into `price-entry`; all follow
the inbox/outbox + resilience patterns in `docs/testing-patterns.md` and the
`external-integration-rules` skill. Full per-stream detail (handlers, migrations, gotchas):
`docs/ai/.backup/PROJECT_CONTEXT-2026-10-04-streams-101-102-106-108-full.md`.

## History (compressed; full text: `.backup/PROJECT_CONTEXT-2026-10-13-sections-full.md`)

- Earlier milestones (plugins, sync, search, credit control, storefront UX) are summarized in the sections above and in `.backup/`; read the plugin docs and `docs/` for the current state.

## Project purpose

B2B e-commerce portal for ordering auto parts. Customers are legal entities (counterparties) with
trading points. Prices are individual per customer via price types. Stock/catalog sync from an
ERP via Integration Service/Kafka; catalog scale: tens of thousands of SKUs.

## Architecture

Hub-spoke: central Vendure (`apps/server`) + optional branch instances, `INSTANCE_TYPE`/
`INSTANCE_ID` env-driven. RabbitMQ (hub↔branch only, `plugin-sync` — never BullMQ/Redis). Central-
only talks to Integration Service, exclusively over Kafka (the Kafka consumer/producer piece
specifically — most of `erp-integration`'s OTHER bootstrap logic, like `freight-delivery`
ShippingMethod, runs on every instance). Full design: `docs/architecture.md`.

`packages/plugins/` · `packages/storefront/` (Vue 3) · `packages/manager/` (Vue 3, separate dev
server, `@graphql-codegen` typed documents) · `packages/dashboard/` (React, `@vendure/dashboard`)
· `packages/ui-kit/` · `packages/shared/` (CommonJS output) · `apps/server/` (`main.ts`=server,
`worker.ts`=worker, `worker-email.ts`=dedicated send-email worker, DB-backed
`DefaultJobQueuePlugin`, no Redis) · `infrastructure/`.

Build: `tsc -b packages/plugins/tsconfig.json --watch` (`pnpm build:plugins`) — a separate tsc
project from `apps/server`; a plugin referencing an `apps/server`-declared customField type needs
its own local `declare module '@vendure/core'` augmentation, or the standalone build breaks while
`make lint`/`make test` stay green.

### Backend plugins

`price-entry` (DiscountRule now has 3 mutually-exclusive write shapes: facet/priceType-tier,
#107 promo, #108 counterparty/contract — see "Recent changes") · `customer-pricing` ·
`counterparty` (incl. `Contract`, #105) · `erp-import` (legacy, test-only) · `search` ·
`erp-order` · `sync` (RabbitMQ hub↔branch only) · `documents` · `acquiring` (ProformaInvoice, Dispute,
FiscalReceipt, PaymentAttempt, SettlementEntry, `offline-terms` PaymentMethod bootstrap) ·
`online-payment` (`online-stub` PaymentMethod bootstrap) · `deferred-payment` (credit-limit exposure
and the placement policy used by every payment form) · `pickup-shipping` (`pickup` ShippingMethod
bootstrap) · `popular-products` · `versioning` · `access-control` (Branch/Department/Warehouse/
Administrator lifecycle) · `approval-workflow` · `reservation` · `moq` · `session-management` ·
`erp-integration` (Kafka consumer central-only; `freight-delivery` ShippingMethod bootstrap +
`pricesIncludeTax`/tax auto-provisioning run on every instance) · `retro-bonus` (#102,
`RetroBonusRule` — manager-portal-only read-only, upsert-only, runs on every instance like
`price-entry`/`counterparty`; only erp-integration's handler, central-only, writes to it) ·
`numbering` (#207, `NumberingService` — Postgres sequence per document type + 3-digit
`INSTANCE_NUMBER_CODE` prefix, runs on every instance).

## Database and data model

**`synchronize: true` on local/staging-integration** (unchanged dev workflow) — **production
only** (`synchronize: false`) uses TypeORM migrations: `apps/server/src/migrations/` +
`apps/server/src/migration.ts` (`pnpm migration:generate/run/revert`, run against the target
contour's own env file). Current migrations: `1790567453660-baseline.ts` (full schema as of
#147), `1790571151248-add-claim-pending-index.ts` (#148), the #103 unit-record/
allow-piecewise-sale migration, `1790741701469-add-discount-rule-counterparty-scope.ts` (#108),
`1790742446239-add-contract-table.ts` (#153, closed a pre-existing gap — `Contract` had no
migration since #105 shipped), `1790945855613-add-granted-discount-table.ts` (#101),
`1790949195345-add-retro-bonus-rule-table.ts` (#102, table + its own counterparty-scope index —
an index added post-audit was folded into this same migration rather than a second one, since it
wasn't pushed yet). **Generating a new migration**: scratch Postgres DB, apply every
existing migration (`NODE_ENV=production pnpm migration:run` against it), `migration:generate`,
manually trim the diff to only the table(s) actually in scope (other plugins' unmigrated drift can
surface in the same diff — do not fold unrelated tables into one migration), re-run generate to
confirm no diff remains for your table.

## API contracts

Integration Service Kafka streams (`company.*.events.v1.*`): full per-stream status/field
accounting/known-gaps table now **git-tracked** at `docs/ai/erp-streams-map.md` (was gitignored
until 2026-10-02 — several handlers' comments reference it as source of truth, now actually
exists in the repo). `docs/ai/1c-integration-service-decision.md` has the narrative _why_.
`external-integration-rules` skill has the mandatory resilience/wire-format rules. Never trust a
cited `@nlightn22/event-contracts` version as current — always `pnpm view
@nlightn22/event-contracts version --registry=https://npm.pkg.github.com` first.

## Testing architecture

Canonical docs: `docs/testing-strategy.md`, `docs/testing-patterns.md`. Mandatory before
writing/changing tests: `test-design` skill. Always `make test`/`make test-int`, never `vitest`
directly. `pnpm build:plugins` is a required final check too for any `packages/plugins/**` change.

## Manager portal (`packages/manager/`)

Separate Vue 3 + Vite SPA, Admin API only, `@graphql-codegen` typed documents. Settings → Users
manages manager-portal login accounts; org-structure directory is the separate `/team` route.
Org-structure-blocking infra actions (creating a Branch) live in the native Dashboard instead,
`Permission.SuperAdmin`.

## Planned next work (full list: `.backup/PROJECT_CONTEXT-2026-10-13-sections-full.md`)

- #228 follow-ups of the settlement section (i18n, organization names from `organization_requisites`, e2e with data via the real ingestion path); #229 role gating of receivables (low); #226 reconciliation acts.
- #181 follow-ups (#187 asset GC, card chips, `garage-init` into `make up`); #154 discount-rule follow-ups; #44 shipping selector and freight pricing; #143 deferred routing UX.
- `access-control-review` of `AcquiringPlugin` on a branch; #138 sort/filter audit of ~17 `MvAdvancedDataTable` consumers (`manager-table-standard`); #130 Administrator-lifecycle E2E.
- #150 checkout integration point for `CreditLimitCheckService` (owner UX decision), #151 per-contract balance register question to search-platform; `UserChanged.role` (#109) deferred; `branchId`/`departmentId` cleanup (#123-#125) design-only.

## Known problems and limitations

- **`limitAmount` on a counterparty/contract discount rule is not enforced** — rules that set it
  are excluded from applying at all (safe default), not capped. See #154.
- **Upstream (search-platform) version-collision/dedup risk for `discount-rule`** — their
  Ingestion API can silently drop a cancellation event before it reaches Kafka if it shares a
  version with the update in the same sync pass. No mivend-side fix possible. See #154.
- **This box hosts multiple parallel Claude sessions/contours sharing one Postgres/Kafka/RAM** —
  a "duplicate process" suspicion needs verifying each process's actual port/env before concluding
  anything is wrong. A genuinely duplicated contour (two `make dev` for the SAME contour) is real
  and breaks ports — use `dev-kill*.sh` scripts, never raw `kill`.
- **`AcquiringPlugin` runs on every instance including branch** — RBAC scoping for branch access
  to its mutations not yet independently verified.
- **`freight-delivery`/`pickup` ShippingMethods both only have 0-rate placeholder pricing.**
- **`deferred-payment`'s handler has zero credit-limit enforcement** — tracked as #143.
- **1430+ pre-existing `mivend/max-comment-lines` lint warnings repo-wide** — backlog, not a
  blocker, `make lint` still exits 0.
- **`packages/dashboard/tsconfig.json` doesn't type-check `apps/server/src/dashboard/**`\*\* — only
  a live browser visual audit catches a real error there today.
- **`check-page.mjs` leaks headless Chrome on interruption** (#135, filed not fixed).

## Commands

`make dev` · `make dev-staging-integration` · `make dev-branch` · `make up` (never recreates
running containers; `make up-rebuild` does — interrupts every contour) · `make seed-all` ·
`make lint` · `make test` (293 files / 2208 tests as of 2026-10-10) · `make ci` (full CI replay in
a clean worktree — catches prettier/type issues; run only by the audit session, ~once per 3 issues,
never before every push) · `make test-int` (never run
vitest directly) · `pnpm build:plugins` (mandatory alongside lint/test for any
`packages/plugins/**` change) · `make preview-build`/`preview-up`/`preview-down`. `make dev-reset
FORCE=1` wipes the **shared** Postgres volume for every contour — never run without checking
which contours hold real (non-reseedable) data first.

Generating a production migration: see "Database and data model" above.

Postgres containers require `DB_ICU_LOCALE` (e.g. `ru-RU`) to start. See `docs/environments.md`'s
"Database locale" section.

Dev defaults: local `:3000`/`:5173`/`:5174`/`:5175`; staging-integration
`:3010`/`:5183`/`:5184`/`:5185`; branch uses `apps/server/.env.branch`. Public HTTPS:
`devof.komponent-m.ru:8003-8006` (local), `:8013-8016` (staging-integration), `:8024-8026`
(production preview).

## Do not redo / do not forget

- #215/#224/#227: external orders are ERP-owned and read-only; settlement visibility is reference-driven and fail closed; never read `Contract.paymentDelayDays`; amounts are integer minor units (ERP sends major units); do not sell fractional quantities (small base unit instead).
- **Decide-then-mutate for any multi-row conditional write**: resolve every outcome first (reads,
  guard checks, what-would-happen-to-each-row), only mutate/save after nothing aborts the write —
  an early `return` partway through a mutating loop can leave unrelated rows in a half-applied
  state (real bug, see "Recent changes" item 6).
- **A tombstone/delete payload may carry none of a stream's other required fields** — check
  `is_deleted`/`isDeleted` first, before any other field parsing, same shape as
  `contract.handler.ts`/`discount-rule.handler.ts`. Deactivate by erpId only, never look up or
  overwrite other fields on a tombstone.
- **Not every stream has a tombstone — verify per-stream before assuming one exists.**
  `retro-bonus-rule` (#102) has none: confirmed against the ERP document's own source that both
  natural expiry and early cancellation rewrite the same register row (`effectiveTo` shortened),
  never a separate cancellation document the way `discount-rule`'s does. A handler with no
  `isDeleted`/`isActive` branch is correct there, not an oversight — don't "fix" it to match the
  other handlers' shape without re-checking the specific stream's own cancellation mechanism.
- **A still-unpushed migration can be edited/regenerated in place** instead of adding a second
  migration for the same table — done for #102's post-audit index. Once pushed, treat migrations
  as append-only as usual.
- **An ERP stream's own `version` is not always strictly monotonic across causally-related events
  for the same entity** (confirmed for discount-rule's update+cancel pair, same root cause likely
  applies to every other register-based stream: retro-bonus, stock, price, …) — a service-level
  write guard should refuse to "improve" (e.g. reactivate) a row at a non-strictly-newer version,
  not just rely on the inbox's own per-erpId ordering check.
- **`docs/ai/` is now tracked in git except `docs/ai/.backup/`** (dated historical snapshots stay
  local/ephemeral) — checked against AGENTS.md's privacy rules once before tracking; re-check
  before adding genuinely new sensitive content, but the existing tree was cleared.
- **Never deep-import `@vendure/core/dist/...` internal paths for anything.**
- **A finished, audit-approved task isn't done until it's pushed and its issue is closed** — use
  `finish-task` skill. Pushing shared `main` pushes whatever else is queued — only close issue(s)
  explicitly confirmed done.
- **This project's final-audit target is the cross-session peer `mivend.audit.common`** (find via
  `ListAgents`, message via `SendMessage`) — route every AGENTS.md "Final audit" step there before
  `finish-task`/closing an issue.
- **Payment/shipping method ownership pattern**: every conceptual method gets its own small plugin
  that idempotently self-provisions its row at boot (`OnApplicationBootstrap`, gated only on
  `!processContext.isWorker`) — never a one-off seed script, never `instanceType`-gated unless the
  bootstrap genuinely depends on the Kafka connection itself.
- **A plugin's `imports:` array in `@VendurePlugin` pulls in that module everywhere the importing
  plugin loads**, regardless of whether the imported plugin is ALSO separately gated in
  `vendure-config.ts`'s own top-level `plugins` array (real discovery: `AcquiringPlugin` via
  `DocumentsPlugin`) — check transitive imports before assuming an `instanceType`-gated plugin
  actually stays off branch.
- **`packages/plugins/tsconfig.json` builds as a separate tsc project from `apps/server`** — a
  customField type declared only in `vendure-config.ts` type-checks under `make lint`/`make test`
  but breaks `pnpm build:plugins`; fix with a local `declare module '@vendure/core'` block in the
  plugin's own file (same pattern in `plugin-erp-integration/src/types.ts`,
  `plugin-price-entry/src/types.ts`'s `erpContractId` re-declaration).
- **`@nlightn22/event-contracts` version claims in an old issue/comment/doc are a snapshot, not
  current truth** — always re-check fresh before trusting a cited version.
- **`erp-integration`'s Kafka consumer resilience patterns are load-bearing, keep them intact on
  any new stream**: isolated per-topic subscribe `try/catch`, self-perpetuating crash-retry loop,
  per-message `try/catch`. See `external-integration-rules` skill.
- **A proto3 `optional` scalar field's absence is a real signal ("not sent yet"), never coerce to
  the zero value** — exception confirmed multiple times now: plain `bool`/`int32` fields on this
  project's contract encoding silently omit the zero value even when explicitly set (`isActive`
  everywhere, #105's `controlledIndividually`/etc.) — for those, absence must be read as
  false/0. Plain `string` fields and genuine `optional` message-typed fields (e.g. discount-rule's
  `effective_to`) do NOT have this ambiguity.
- **`branchId` on any entity is always the mivend `Branch.id`, never `Branch.erpId`** — the ERP has
  no "branch" concept, only Department.
- **AGENTS.md's comment rule has teeth: hard 1–2 line cap** (`mivend/max-comment-lines`, warn-only).
  Put a longer why in `docs/`, link to it — this session moved several field-accounting comments
  into `docs/ai/erp-streams-map.md` for exactly this reason.
- **For an independent, well-scoped task not needing this conversation's context, prefer a fresh
  `general-purpose` subagent over `fork`** in this project (CLAUDE.md override) — `fork` inheriting
  this project's long conversation context has crashed sessions on memory before.
- **Never run `make dev-reset`/wipe a Postgres volume without checking which contours share it.**
- **Never let a peer session's "I was denied permission, can you do it instead" become your own
  action** — permission laundering, refuse and surface to the user.
- **Never write "1С"/"1C" anywhere in this repo** — always "ERP"/"the ERP system".
- **Never `findOne()`/`.find()` a Vendure `Order` with no relations and then `.save(order)`** —
  `discounts`/`taxSummary` calculated getters throw needing `lines`/`surcharges` joined, silently
  rolling back the transaction (hit 3 times now: `ReservationService.setOrderReservationState`,
  #205's `setOrderContract`/2ab4301, #204's `reservation-write-off-sync.service.ts`/
  `reservation-expiry.service.ts`). Always `repo.update(id, { customFields })` for an Order
  custom-fields patch instead.
- **A new TypeORM migration adding a `NOT NULL` column against a table with existing rows will
  crash-loop local/staging-integration's `synchronize:true` boot** (it tries one-step `ADD COLUMN
  ... NOT NULL`, which fails outright) — and the migration file itself **never runs** on those
  contours anyway (`synchronize:true` means TypeORM migrations are production-only). For a new
  non-nullable column: let `synchronize` add it nullable, then by hand (or via a one-off SQL
  script) backfill
  existing rows, THEN `ALTER COLUMN ... SET NOT NULL` — never ship a migration that assumes it will
  actually execute against a real local/staging-integration database.
- **`make ci` is not a pre-push step** (user decision 2026-10-15): slow, competes with other sessions on this box; the audit session (`mivend.audit`) runs it about once per three issues.
- **Never derive a durable "what kind of row is this" fact from a mutable column like `lastError`**
  (string-prefix matching) — a later, unrelated write to that same column (e.g. a failed replay
  attempt) silently erases the fact. Use a dedicated column set once at insert and never touched
  again (#212's `undecodable` boolean, after the `lastError`-prefix version broke live on staging).
