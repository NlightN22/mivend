# Project Context

Updated: 2026-10-21 21:00

## #196 one-pass order-dependent discounts (2026-10-22, implemented, awaiting audit)
- Tier ladders, promo rules and counterparty rules are ONE automatic Vendure promotion (`order-discount.promotion.ts`, provisioned at boot by `OrderDiscountPromotionBootstrapService`, re-enabled if disabled); `OrderDiscountService.stateFor` evaluates the whole order once per snapshot with `PriceResolutionService.resolve`; the strategy keeps only the flat discount in `listPrice` (`{ orderRules: false }`). `TierRebalanceService`/`ActiveOrderSettleInterceptor` are gone. Never add a second promotion for these rules (Vendure would stack them). Details: `docs/pricing.md` "Order-dependent discounts".
- Consumers read the price after discounts from `discountedUnitPriceWithTax`/`discountedLinePriceWithTax` (storefront cart/orders, manager order pages, e2e); `unitPrice`/`linePrice` are before the promotion. Floor-price check uses the prorated price. Counterparty amount rules compare the pre-promotion line total (`documentAmount`).
- Perf: `LookupMemo` caches facets/weights/prices/rules per evaluation (and per request for `compareAtPrice`/`tierProgress`). 23-line cart: adjust 37 s -> ~1.9 s; 41 lines: add ~2.5 s, adjust ~2.4 s, read ~1.9 s (about 60 ms per line, linear). A 200-line cart is not measured (expect ~12 s): optimize further if real carts get that big.
- Checks: cart e2e (15, incl. `concurrent-mutations.spec.ts`) + 4 discount specs pass; `make lint/test/test-int` pass. No real-Postgres two-connection test: there is no own read-compute-write left (the discount is derived inside the mutation transaction); parallel mutations of one cart are covered by the e2e spec and #258's active-order lock.
- Follow-ups not done: progress bar in the catalog (owner wish; needs a Shop query returning tier progress for the active order per product), more speed for very large carts, staging contour got the promotion at boot (restart-safe).

## #192 price type gaps list (2026-10-21, DONE: audited, local commits `f4bfe9b3` + follow-up)
- Admin `priceTypeGapCounterparties` (`price-type-gap.service.ts`, scoped by `visibleFilteredQb`, `ReadCustomer`/`ReadCounterparty`) lists active portal counterparties whose main contract chain gives no active PriceType; reasons `no-main-contract`/`contract-not-found`/`contract-inactive`/`price-type-not-synced`. Manager page Settings > "Price type gaps". The SQL predicate is tied to `mainContractPriceTypeIdSql` by an int test; a manual per-customer `CustomerPriceType` is ignored (stated on the page). Local contour logins: `superadmin`/`superadmin`, seeded managers in `packages/e2e/manual-driver.mjs`.

## #260 storefront demo data (2026-10-20..21, DONE: audited 2 rounds, pushed, closed)
- `useDemoMode()` = `!import.meta.env.PROD`: dev keeps demo pages/widgets, production shows `MvNotImplemented` or hides links (`demoOnlyLinks.ts`). Stubbed in prod: reconciliation acts, requests, employees, frequent products, notification prefs. Real now: account dashboard/orders, settings (profile, password), payment result, Balance page.
- Balance: Shop `myContracts`, `settlementDocuments(filter.unpaidOnly)` + `openAmount`; demo seed `infrastructure/scripts/seed-balance-demo.mjs` (balance-demo@test.example, not used by e2e).
- Contract proformas: `ProformaInvoice.kind` `debt-repayment`/`advance`, orderId null, per contract, unlimited, idempotency key (mismatch rejected), excluded from FIFO/payment; default VAT from the default TaxCategory (local 22%, staging НДС20 left as is); amount Int cap 2147483647 kopecks validated front+back; worker task `contract-proforma-cleanup` deletes them after 6 months (1 Jan/1 Jul).
- Security: Customer customFields `counterpartyId/portalRole/preferredTradingPointId` readonly; `setPreferredTradingPoint` ownership check; rest is #266 (done). Online payment stub refused under NODE_ENV=production.
- Cart bug found: storefront compared gross compareAtPrice with net `unitPrice`; now `unitPriceWithTax`; e2e `cart-totals/vat-rate.spec.ts` switches the default rate and restores it.
- Checkout card-payment terms sentence (dead link) hidden in production; the terms page itself is #268 (open). All #260 commits audited (3 rounds), last nits accepted.

## #259 ERP deletion/clearing events (2026-10-21, DONE: pushed to main, closed; follow-up #254 deferred)
- Price tombstone removes the `ProductVariantPriceEntry` (`PriceEntryService.remove`); storage-location tombstone deletes by `entityId`. REAL tombstones have an EMPTY body (no productId/priceTypeId/storageLocationId/value): identity is only the envelope `entityId` (price `productId:priceTypeId`, storage-location `productId:warehouseId:priority`), equal to the upsert's. Handlers read the key from `entityId`; test payloads must use the real empty shape.
- Cleared fields: a NAMED event is full state (never partial); an absent key (rarely `''`) clears. Rule per stream in `docs/ai/erp-streams-map.md` "Cleared vs not sent (#259)": counterparty phone/email/addresses, point-of-sale address/coords/contact phone, organization phone, product part number/full name are cleared; legal requisites and signatories stay sticky; a tombstone never touches values. Point `contactPhone` is stored only on an existing contact person.
- Verified live on staging-integration with test objects (clear/restore done via the 1C console sessions): point "тест 2" phone, counterparty "Тестовый Контрагент 2" phone, a throwaway price document (upsert -> unpost -> tombstone). All restored. mivend does not index prices (search-service prices by price type itself).
- Gotcha: the staging contour server can stay alive but stop answering :3010/consuming Kafka (no new inbox rows for hours, like #186); `make dev-staging-integration` restart fixed it. Check `curl :3010/health` and the newest `integration_inbox_event.created_at` first.
- #254 DEFERRED (owner, 2026-10-21, lower priority): `customer-claim`, `order-correction`, `sales-correction`, `setting` stay in `ignored-contract-streams.ts`. Recommendation kept for later: consume `setting` (global switch `ignoreOrganizationStockCheckForAll`), `OrganizationChanged.controlsStock` and `ProductChanged.storageUnitId` together (they close the "Known gaps" of the organization-stock check in `docs/order-contracts.md`; today `storageUnitRatioToBase` is hard-coded 1 in `order-check-subject-loader.service.ts`). Settlement documents (incl. the "Корректировка реализации/долга" types) are ALREADY consumed via `settlement-document` (#224); the full correction documents with goods lines are not.

## Next
- #266 DONE (audited, pushed, closed 2026-10-21; commits `90a20114`..`57113d97`, `f2127de8`, `a8b9bd6a`): `CustomFieldWritePolicyPlugin` (last in `plugins`) makes every custom field readonly except `CLIENT_WRITABLE_CUSTOM_FIELDS` (Collection 2, GlobalSettings 7); startup refuses an unlisted writable field; `OrderLineCustomFieldsInterceptor` rejects OrderLine custom fields in Admin draft-order/`modifyOrder` (re-check the mutation list on Vendure upgrade); guard test; introspection off when `NODE_ENV=production` (not verified in prod mode: no contour runs it). Reads: `OrderLine.manualPriceReason` and `Order.placedByAdministratorId` are `public: false` (hidden from Shop API; live-verified). Staff can no longer edit ERP/service-owned custom fields in Dashboard. Rules in `docs/access-control.md`. Shop id-mutation audit found no IDOR; optional low: `markNotificationRead`/`resolveNotification` services unscoped (resolver guards them). #269 DONE (audited, pushed, closed 2026-10-21; `c3073427`, `e1b918cb`): `make verify-branch-scope` rewritten for the #65 model (seeded olga/nikolai + `setCounterpartyBranchOverride`, no admin creation; leaves the imported `cnt-dept-purchasing-verify` counterparty). Open question: no custom field uses `requiresPermission`; `Order.branchId` is public (low). `make test-int` not run for this work.
- Then #263/#264/#265 (e2e-integration, need a second branch and logins), #267, #260 stages, #261.
- Open test debt: `acquiring` int tests broke on #260 `ProformaInvoice` stub tables (fixed in `8c61cf86`; rerun `make test-int`). No final audit was run for #259 (session `mivend.audit`).

## #65 / #123 / #262 branch scope + visibility grants (2026-10-20, DONE: audited, pushed `e531f973`, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-20-65-123-262-216-full.md`)
- #65: staff-edited `department_branch_mapping` (subtree inheritance, unmapped = deny) + `Counterparty.branchOverrideId`; `BranchAssignmentService` is the only writer of `Administrator.customFields.branchId` (readonly in GraphQL) and `Counterparty.branchId`: advisory lock `branch-assignment`, rows `SKIP LOCKED` + retry event for skipped rows, 15-min backstop, central only. Counterparty rule: override > manager's department > own `departmentId` > null. `createAdministratorFromErpUser` refuses an unmapped department. Manager Settings "Departments to branch"; staging mapping set through the product API (two branch roots).
- #123: `VisibilityGrant` (administrator -> manager, optional period, reason, audited, never deleted) widens scope additively (own + granted managers + primary branch; `all` unchanged); permission `ManageVisibilityGrants` (no escalation beyond the granter's team; `ManageAccessControl` unrestricted); unsorted list (only all-scope administrators sort). Manager Settings "Visibility grants", "Unsorted". Grants are central-only: #267.
- Security found by #262 and fixed in the backend: shop/admin `tradingPoint(id)` (a guest could read any point), staff comment edit, `orderReservations`/`availableStock`, `entityVersions*` (`EntityVersionScopeRegistry`), `reservationExtensionLimit`; see `docs/access-control.md` "Scope guards". `trading-point.service.ts` is 607 lines: split it after #260.
- #262 suite: `make e2e-integration` groups 08-12 (API, portal pages, write denials + branch move, storefront, grants), role-keyed actors. Fixture ERP ids and logins live ONLY in the staging env file (`STAGING_FIXTURE_*_ERPIDS`, `STAGING_TEST_{HEAD_A,OPERATOR_A,HEAD_B,MANAGER_B,DIRECTOR}_*`, `STAGING_TEST_CUSTOMER_B_*`): never commit names, cities or ERP ids (privacy rule, issues too). Permanent fixtures; temporary changes are restored in `finally`.
- Nuances: portal activation uses the counterparty's own ERP email+phone (contact-person events are not consumed); only `ReassignCounterpartyManager` roles test scope refusals; administrator `branchId` only via the mapping (never SQL); parallel agents editing plugins restart the staging contour (`fetch failed`), run contour e2e when quiet; shared git index: stage and commit in ONE command with explicit paths; leaked Puppeteer chrome fills RAM (record the parent before killing).

## #216 storefront i18n (2026-10-19..20, DONE, closed; follow-ups #260, #261; full text in the archive above)
- en default / ru lazy catalogues `packages/storefront/src/i18n/`, one formatter `i18n/format.ts`, ui-kit takes texts via props (never imports vue-i18n), no-raw-text lint, shop errors shown by `errorCode`.

## #235 price type visibility + #256 below-floor check (2026-10-19, DONE: audited 3 rounds, pushed, both closed)
- #235: `PriceType.visibility` (customer/confidential); `PriceTypeAccessService` is deny-by-default on every admin path, with a per-ctx memo (a mid-request visibility change is not seen). Access = branch allow-list (`BranchSettings.visiblePriceTypeIds`, customer types only, plus the branch default) union role permissions; confidential types are never granted by a branch rule or customer context. Discount grants, approval requests (`payload-price-type-gate.ts`, `pg_input_is_valid`, Postgres 16+) and the decide path are gated by type. Purchase-flag changes serialize under advisory lock `price-type-purchase-flag`.
- Data step: `infrastructure/scripts/price-type-visibility.sql` (fails for branches with admins but no `branch_settings`); seed-erp.mjs creates PURCHASE first, bump the `run` version when fixtures change. Staging: 6 customer + 3 confidential types classified; the test manager is assigned to a branch; staging UI not verified.
- #256 first slice only: check `order.below-floor-price` (pre-reserve, on-edit, confirm; warn; facts sku+reason), per-line icon/tooltip + header count in manager; visible to every manager (owner decision). Closed on purpose: no recheck on floor change, no pre-send-to-erp, no hold/approval. Blocking + approval routing comes with the future approval-system architecture (new issue then).
- Staging e2e for #235 (`make e2e-integration`, groups 05/06/07 in `packages/e2e/integration/`, skill `e2e-integration`): price type visibility read, denials, discount grants; the staging contour has a hand-registered `discountGrantApproval` workflow definition (kept). The suite may create tracked entities through the product and must release them; no retries or reloads to pass a flake. Found and fixed: `floorPrice` was always null, `floorPricesForVariants` broke on fractional floors.
- `approval-request.service.ts` split: reads/lists live in `approval-request-query.service.ts`. Price-adjustment requests are not type-gated by design (per order, payload has no `priceTypeCode`; the order's own visibility governs). Reservation extension is DST-safe (fixed 24h units).

## #255 / #257 / #258 (2026-10-19, DONE: audited, pushed `37afb44e`, closed)
- #255 `make e2e-integration`: manual Playwright suite (`packages/e2e/integration/`, script `test:erp-exchange`, NOT in `make test-int`) driving the real storefront and manager portal UI on staging-integration (:3010/:5183). It covers placement → ERP registration, a repeat placement, reservedQuantity, cancel from both portals, cancel-before-publish (restarts the contour with a broken schema registry) and cleanup. It fails when the ERP gives no answer within 20 min (the 1C cycle is 6-10 min). 9/9 pass. It restarts the shared contour, so announce a run first. The manager login is `STAGING_TEST_MANAGER_*` in the staging env file. The storefront shows "Отмена запрошена" (cancel requested); `isOrderCancellable` refuses `already-requested`.
- #257: every DB call goes through the RequestContext (`getRepository(ctx)`, `ctxQuery` in `packages/shared`). Lint `db/no-raw-connection` at error level, with no exceptions (rawConnection, DataSource/InjectDataSource, getRepository without ctx on `*connection`). Pool: `DB_POOL_SIZE`, `DB_POOL_ACQUIRE_TIMEOUT_MS`. Inbox handler and the processed mark share one transaction; product review flags are written under a SAVEPOINT; the photo job is enqueued after commit. `CheckStaleRequestService` uses a lease claim: rule (i) in `docs/concurrency.md` (SKIP LOCKED claim, heartbeat, token+version fenced delete). The global audit skill now flags rawConnection in changed code.
- #258: `SerializedActiveOrderStrategy` (order-identity) wraps the configured strategy. Lock order: advisory `active-order:<channel>:<user>` → `withOrderCancelLocks` → order row FOR UPDATE, so cart mutations of one order run one at a time and concurrent first adds create one active order. Placement fields (branchId, counterparty, tradingPoint, deliveryAddress) are written inside the transition (`placementDenormalizeProcess`), not by an after-commit subscriber. There are no guest carts (login is required).
- The load repro script (concurrent add/removeAll) now gives 0 deadlocks; the `order_line_identity` FK violation never reproduced.

## #247 / #248 / #231 (2026-10-17..18, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-21-247-248-231-full.md`)
- #247: repeat payment delivery resolves a `pending` attempt with the same (channel, externalReference) by status transition; late capture after failed/canceled -> reconciliation issue. #248: core Admin API order operations go through one central order-scope guard (+ #251/#252, dev kill scripts). #231: session leak fix and order cancel/e2e cleanup.

## #242-#244 / #239-#240 / #230 / #233 / #237 / 2026-10-18 session (closed; full text: `.backup/PROJECT_CONTEXT-2026-10-19-242-239-230-1018-full.md`)
- Manager actions go through the checks framework (`packages/plugins/checks`, `docs/checks-and-policies.md`); a check never refuses checkout; findings hold the automatic reserve/send. Z-index only via `--mv-z-*` tokens. Manager line edits before confirmation: `docs/order-contracts.md`.
- Storefront has ONE add-to-cart path (`useCartActions.addToCart`, `productQuantity.ts`) and one product card (`ConnectedProductCard.vue`). Point-confirmation expiry cancels on the reservation deadline. event-contracts 0.77.1; new streams are ignored pending #254. `pnpm-lock.yaml` is in `.prettierignore`.
- Open: #27 partial allocation over-allocates a proforma; overpayment after a line edit is not credited; owner confirmations pending (credit.limit default `hold`, `ManageCheckPolicies` global); AccountFrequentProducts is a mock.

## #236 / #197 / #175 / #232 / #112 / #238 (2026-10-14..15, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-17-236-197-175-full.md`)
- #236: local reserve released only for what the ERP holds (per-variant split, `erpHandedOverAt` of current generation; rules in `docs/order-flow.md`). #197: capture must not take an early proforma row lock (`allocate()` locks FIFO; deadlock otherwise); remaining findings in #240.
- #175/#232/#112/#238: order page/list by dictionary `customerGroup`, status history table, atomic `erp_order_reserve`, delivery vs pickup by `pointOfSaleId` (`docs/order-contracts.md`). Nested `withTransaction` in test harnesses must join the open transaction or lock tests hang.

## #234 Kafka topic rename (2026-10-14, closed)

- Names are `<writer>.<entity>.<kind>.<version>`: ERP writes `erp.<entity>.events.v1`, mivend writes `mivend.order.commands.v1`. One consumer for `erp.order.events.v1` (`order-events-message.ts`) routes by header `type` to the inbox streams `order-registration-result` / `order-changed` / `order-cancel-result`; `change-result` and unknown types are skipped. Verified live on staging-integration.

## #215 / #224 / #227 ERP orders + settlement documents (closed; full text: `.backup/PROJECT_CONTEXT-2026-10-18-215-224-227-full.md`)
- External ERP orders are read-only `isExternal` orders seen by `counterpartyId`; settlement plugin keeps ERP documents/balances per organization/counterparty/contract (`closing_balance` authoritative); customer visibility fails closed (`customerVisible` type AND `isCustomerContract`). Payment term = counterparty `paymentDelayDays` (docs/payments.md). Measured goods sell in a small base unit (integer quantity).

## #206 proforma invoices + #222 form of payment vs terms (2026-10-12..15, done, audited 3 rounds, pushed `865ed997`, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-15-206-222-sections-full.md`)

- **Model (docs/payments.md "Proforma invoice: concept, versions, statuses")**: a proforma is INFORMATIONAL, never closed; the only source of debt is the ERP sales invoice (realization; ingestion + a "by shipment" version are NOT built, fields `kind`/`salesInvoiceNumber` are prepared). One document per (order, organization), many versions; number `<order>-<NN>-<version>`; per-version `issuedAt`/`dueDate` (`BranchSettings.proformaPaymentTermDays` 1..90, default 3; re-issue resets the term by design). Statuses shown: Current / Superseded (newer version exists, still payable) / Cancelled (withdraw action, refused with allocations or an active attempt); "paid" is not shown on a proforma, order level shows `Order.erpPaidAmount` (lower bound from `order-changed.paidAmount`).
- **Snapshots**: lines (with `taxRate`/`taxAmount`), content hash decides reuse/new version under `proformaInvoices-for-order:<id>` lock; paid snapshots never rewritten (difference settled via the ERP). Print form follows the 1C payment-request layout on one A4 page, VAT as one total line, payment QR GOST R 56042-2014 ST00012 (own module, `qrcode` for drawing; required: name, account, bank, BIC, corr. account, sum, purpose, payee INN). Required requisites: legal name + INN + bank; address/KPP/phone/signatories optional (organization stream, contract 0.66).
- **Form of payment vs terms (#222)**: forms `cash` / `offline-terms` (bank transfer) / `online-stub` (card); limit control is a policy for every form (`CreditPlacementService`, lock `credit-exposure:<counterparty>`), route in `Payment.metadata.placement`; over limit waits for a manager unless the branch allows exceeding and the customer acknowledged; card amount = excess + total and cures the order; prepayment orders reserve with `prepaymentReserveDays` (default 3); manager action `confirmPaymentReceived` (`ConfirmPaymentReceived`). `deferred-payment` method removed.
- **Payments**: FIFO allocation module (`SettlementEntry`) is FROZEN, not extended, not used for display; owner idea for later: the customer allocates a payment across orders in our system (needs an ERP contract). The ERP REST callbacks are a TEST tool (docs/environments.md), off by default, key-protected; the payment fact carries amount + currency + required `proformaInvoiceUuid`.
- **Open**: realization ingestion and "by shipment" version (#224 stream), customer-driven allocation, e2e sets `storefront/checkout-credit` and `proforma-organizations` written but not confirmed green on a stable contour (PDF specs need a worker; they fail on CI without one), dashboard GraphQL types regeneration, withdraw vs concurrent payment lock, integration-side proforma contract (search-platform#198), shop API 500 on proforma/order lists for a session without customer.
- **Owner preferences**: no production, destructive/no-compat changes are fine (staging-integration DB holds real integration data: plain UPDATE/RENAME only, never reseed); the owner's 1C sample PDF/xlsx are private, never copy real data into the repo.

## #223 legacy-name rename + #218 event-contracts 0.57-0.61 (2026-10-11..12, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-16-223-218-full.md`)

- Persisted keys renamed to `proforma-invoice` by plain UPDATE/RENAME (synchronize contours got the SQL by hand). `OrderChanged.document_number` refreshes `erpRegistrationDocumentNumber`; never create test commands in the shared integration `outbound_command` queue without the owner.

## #194 reserve deadline / order cancel (2026-10-11, DONE: audited, pushed, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-13-sections-full.md`)

- One topic `mivend.orders.events.v1.order-events` (key `orderUuid`; types `confirmed` with `reserveUntil`, `cancel-requested`), ERP answers on `order-cancel-result`; statuses derive from ERP facts into `erpStatus` (forward-only). Rules in `docs/order-contracts.md`. Open: terminal ERP refusal, lost-answer auto-retry, deadline warning for registered orders.

## #208/#209/#211/#212/#213 (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-11-208-213-full.md`)

- #208 cross-system verification pass (runbook `docs/cross-system-verification.md`) plus concurrency hardening: order row lock in the contract guard, `erpOrderId` hidden from customers, sibling lock on tier rebalance, auto-reserve vs manual-confirm race. Spin-offs: #209 write only changed `customFields` keys (no stale full snapshots), #211 `UnknownOrderUuidError` (unknown `orderUuid` is not retried forever), #212 undecodable inbox rows can be dismissed (`dismissFailedIntegrationInbox`).

## Package-only sales #214/#219/#220 + orders/contracts/organizations #199/#201-#205 (closed; full text: `.backup/PROJECT_CONTEXT-2026-10-16-214-orders-contracts-full.md`, decisions in `docs/order-contracts.md`)

- Packs: only with `BranchSettings.packagesOnly` (replaces multiplicity, 1C MOQ lost silently); `enforceMultiplicity` opt-in; lines/stock/reserve stay in base units, conversion at the ERP boundary and UI (`PackagingPolicyService`, `wholePackagesQuantity`); `order-registration-result` has no unit field.
- A variant without `organizationId` (from `storage-location`) is not sellable; contract chosen at `ArrangingPayment` (`setOrderContract` before reservation); failed auto-reserve stored on the order; ERP reserved quantities win. Do not redo: closing is not a cancellation; deferred-terms orders get no automatic proforma; ERP masters keep the ERP id.

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

- Price type visibility (#235): deny by default via `PriceType.visibility` + `PriceTypeAccessService` (branch allow-list union `ReadAllCustomerPriceTypes`/`ReadConfidentialPriceTypes`); floor is derived (`FloorPriceService`, purchase type x multiplier from the price-type stream), no `FLOOR` code. Classify customer types with `infrastructure/scripts/price-type-visibility.sql` (data step; unclassified stay confidential).
- Guests: API resolves default price (branch default `PriceType`); UI hides price AND stock tier. Default branch/price type/RUB currency bootstrapped from options (`BOOTSTRAP_BRANCH_NAMES`, `DEFAULT_PRICE_TYPE_CODE`, `DEFAULT_CURRENCY_CODE`); branch is mivend's own entity.

## #160/#59/#158 search backend + category tree/hierarchy (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-03-04-160-59-158-full.md`)

Kafka `CategoryChanged.parent_id` builds the real Collection tree (design: `docs/category-hierarchy.md`); both portals render it (mega-menu/drill-down, `packages/shared/src/collectionTree.ts`); `SEARCH_BACKEND=external` resolves `totalItems`/ranking via search-service. Open: #159 (34 storefront e2e specs), staging products/facets blocked by #69.

## #117 Position entity (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT.20261005-117-position.md`)
`Position` (ERP master data) in `plugin-access-control`, fed by the `position` stream; #251: renamed `ErpPosition` (`erp_position`); the position lives on `erp_user.positionErpId` (soft link, always written by `UserChanged`, linked or not); `Administrator.customFields.positionId` dropped, Administrator position read via its `erp_user`; `positions` query + pending-list position filter. erp-import `EmployeeRecord.position` -> `positionErpId`. Dev gotcha: ts-node-dev children can hang in `waitForFile` under load — free load, restart via `make dev`, never raw kill.

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

- #252: ERP-provisioned Administrators now get firstName = name + patronymic, lastName = surname (`parseErpFullName`); ones created before #252 keep swapped names, and `UserChanged` never rewrites firstName/lastName.

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

- Never use `rawConnection`/`DataSource`; never hold a transaction or lock across long background work (lease claim, `docs/concurrency.md` (i)). Never source `apps/server/.env.central.staging-integration` in a shell command that also runs `make e2e-integration`: `dev-kill-staging-integration.sh` pgreps that path and kills the whole tree.

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
