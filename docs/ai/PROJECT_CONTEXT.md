# Project Context

Updated: 2026-11-10

## Releases 0.0.60-0.0.66 (2026-11-09..10, all on prod, each audited and read-only checked)
- 0.0.60: orders list hang fixed (`take: 0` means "no limit" in TypeORM): shared `getPageAndCount` plus ESLint rule `pagination/no-unguarded-page-count`. 0.0.61-0.0.64: manager redesign branches (#320), bulk operations, OIDC, 2FA required for all accounts, sign-in throttle (2 proxy hops), daily session reset (follows process `TZ`, data stays UTC).
- 0.0.65: #332 contacts (contact points and roles with per-channel storage, migrations 1791573000000 and 1791574000000; the second builds an index CONCURRENTLY and needs the workers stopped), TOTP auto-submit, OIDC state binding per browser. Contact path throughput on the local stand is 18-30 rows/s, floor in the test is 10 rows/s (the dev database port proxy adds about 2 ms per statement; SQL is ~10% of the time, the rest is round trips and query building).
- 0.0.66: orders list on the shared list engine (`visibleOrders(list: OrderListInput)`, take capped at 200, escaped search, migration 1791578000000), filter chips and typeahead suggestions (settlements pilot, migration 1791576000000), change journal #323 (1791575000000; changes coming from the ERP are not journaled; query-builder and raw SQL writes are not journaled), contact reapply task removed (1791577000000), chosen contacts for activation and readiness (ERP channel first, manual only when no usable ERP channel).
- Lessons: regenerate `packages/manager/src/api/generated/graphql.ts` whenever a `.graphql` document changes (a stale file sent the old orders query and broke the list; run codegen against the candidate's own e2e stack with a temporary config on port 3020, then prettier). `counterparties` lookups in tests use `erpIds`, not a large `take`. Fixtures that hand-build schemas must add the contact tables (`contact-tables.fixture.ts`). Heavy int tests time out above load ~10: rerun the file alone before calling it a regression.
- Prod-copy migrate check: restore the latest `backups/pre-*.sql.gz` into a throwaway container from the postgres image (its entrypoint exits unless a `postgres` role exists: create role and database afterwards), then `pnpm migration:run` in `apps/server` with DB_*, `INSTANCE_NUMBER_CODE`, `EMAIL_TRANSPORT=file`, a 64-hex `TWO_FACTOR_ENCRYPTION_KEY`; check `pg_index.indisvalid`. Prod deploy order: backup, `.env` tag bump, pull, stop workers, `run --rm migrate`, server, server-admin, workers, frontends.
- Open: journal UI (#339/#340, signed) for 0.0.67; #336 e2e speed (the Vite dev server serialises page loads, ~450 module requests per page; worker count does not help; round 2 targets stack boot overlap, a combined read-only pass and event waits); #326 stuck-process scanner needs the owner's yes before the host install; owner items: 2FA enrolment of admins, ERP re-export, search-platform decision.

## #278 sign-in protection + #335 session policy (2026-11-09, DONE: audited, prod 0.0.58, issues closed; throttle, CAPTCHA, breach check and daily reset still OFF on prod)
- #278 plugin `sign-in-protection`: per-login and per-login+address throttle (Postgres, DB clock, advisory try-lock per login+address: a parallel correct sign-in from one address can be refused while on), identical responses, adaptive vendor-neutral CAPTCHA (`CAPTCHA_*`, needs owner's keys), breached-password check (`PASSWORD_BREACH_*`), nginx limits, fail2ban examples. Docs: `docs/deployment.md` "Sign-in protection". Release owner enables `SIGN_IN_THROTTLE_ENABLED` after checking `SIGN_IN_TRUSTED_PROXY_HOPS` against the real proxy chain.
- #335 in `session-management`: daily reset task (`SESSION_DAILY_RESET_ENABLED/HOUR`, process zone `TZ`, compose passes `TZ`; data timestamps stay UTC via `apps/server/src/pg-utc.ts`; shared `lastDailyInstant`; `SESSION_DAILY_RESET_TIME_ZONE` removed and fails boot), caps 2 per customer / 3 per staff (`SESSION_MAX_ACTIVE_CUSTOMER/STAFF`; the old `SESSION_MAX_ACTIVE_PER_USER` fails boot), new-device e-mail with opt-out (cookie `mv_device`, table `known_device`). Docs: `docs/access-control.md` "Session policy".
- Lessons: cookie-session writes its cookie through the OutgoingMessage prototype (wrap `res.writeHead`, never `setHeader`); core re-saves a stale User after reset/session creation (clear flags last); e2e order effects (acting group last, shared e2e logins need caps 20 and throttle off); migrations 1791562000000, 1791565000000.
- Owner decisions open: business time zone for the daily reset, CAPTCHA keys, when to enable `TWO_FACTOR_REQUIRED`. Next: #332 contacts design, #333 ERP document pages, #334 Node 22 in Docker images.

## #323 change journal (2026-11-10, DONE: audited, prod 0.0.66; journal UI #339/#340 signed, goes into 0.0.67)
- Plugin `packages/plugins/change-journal`: one TypeORM subscriber journals insert/update/soft-remove/recover/remove of every entity not in `EXCLUDED_ENTITIES` into `change_journal_entry` in the same transaction (migration 1791575000000). Actor via a global interceptor + `AsyncLocalStorage` (administrator / customer / acting / system); every scheduled task is labelled `scheduled-task:<id>`, other background writes `background`. Owner decision 2026-11-10: changes from the ERP integration are not journaled, decided by source (`erp-integration-*`/`sync-*` tasks, `/erp/` REST routes, sync RabbitMQ consumer via `runAsIntegration`), so staff edits of ERP-fed entities stay journaled. Secret columns (name tokens password/token/hash/secret/...) stored as `{redacted: true}`.
- Admin API `changeJournalForEntity` / `changeJournal`, permission `ReadChangeJournal` (same roles as `ReadEntityHistory`), scope via `EntityVersionScopeRegistry`; the cross-entity list only for scope `all`; an out-of-scope or missing entity and a non-`all` list call get one `ForbiddenError` (#340). Cleanup task `change-journal-cleanup`: 365 days, 5000-row batches.
- Coverage test `apps/server/src/__tests__/unit/change-journal-coverage.test.ts`: a new entity goes into `JOURNALED_ENTITIES` or `EXCLUDED_ENTITIES` (`change-journal-scope.ts`). Known gap: query-builder `update/delete` and raw SQL writes are not journaled; upserts show as `insert`. Docs: `docs/change-journal.md`. Manager UI (#339, branch issue-339-journal-ui): "Журнал изменений" tab on the counterparty page, buttons per trading point and portal user, `/settings/change-journal`; generated types hand-edited, codegen pending on a stand. Follow-ups: `Order`/`Customer` scope rules in the registry (today scope `all` only).

## #338 OIDC sign-in for staff (DONE: audited, prod 0.0.64; state binding per browser in 0.0.65; provider-side email_verified must be true)
- Plugin `packages/plugins/oidc-sign-in`: authorization code + PKCE, link by e-mail then `sub` (`ExternalAuthenticationMethod`, strategy `oidc`), no auto-provisioning, superadmin always local. OIDC sign-in deliberately skips our TOTP (provider's factors; accepted risk in access-control.md); local password keeps it. Manager portal only. Env `OIDC_*` (all or none). Docs: `docs/access-control.md`, `docs/deployment.md`. E2E uses a mock provider started by the e2e stack (`packages/e2e/helpers/mock-oidc-provider.mjs`).
- Optional `OIDC_ISSUER_URL/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI`; values live in a gitignored env file, never in the repo.

## #279 two-factor authentication (2026-11-08, DONE: audited, on prod 0.0.55 with `TWO_FACTOR_REQUIRED=false`, issue closed)
- Plugin `packages/plugins/two-factor`: TOTP for every account type (storefront, manager portal, Vendure Dashboard via an overlay in `apps/server/src/dashboard/two-factor-sign-in`). Purpose is binding a person to a personal device, not hardening. Contract and release condition: `docs/two-factor.md`.
- Obligation is binary (`TWO_FACTOR_REQUIRED`), forced enrolment at next sign-in, no grace, no recovery codes, no trusted devices. Lost device: e-mail link to a reset page. Ops reset: `infrastructure/scripts/two-factor-reset.sh`.
- Before switching it on in prod: every admin incl. superadmin enrols from an open session first. Sign-in throttling (#278, plugin `sign-in-protection`, docs/deployment.md "Sign-in protection") covers the second step; switch `SIGN_IN_THROTTLE_ENABLED` on with it. API keys bypass 2FA (only superadmin holds those permissions). The Dashboard overlay depends on the login extension rendering inside the form: re-check on Dashboard upgrades.
- Migration `1791561000000-discount-limit` (order card) is numbered after `1791560000000-two-factor`, which shipped first in 0.0.55; the card ships after it, so the order is natural.
- Planned next: #335 session policy (daily reset 03:00 business time zone incl. staff, max 2 sessions per customer, new-device e-mail with opt-out, deactivation ends sessions); #332 contacts design; #333 ERP document pages; #334 Node 22 in Docker images.

## #309 chunked category-tree recompute (2026-11-07, DONE: audited, pushed to origin/main e429ca50, issue closed) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## Manager portal redesign concept (2026-11-07, concept agreed, no code yet; issue #320 rewritten) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #316/#317/#318 e2e speed-up (2026-11-06..07, DONE: audited, in prod release 0.0.47, issues closed) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #322 manager order creation as the customer (acting mode) (2026-11-06, DONE: audited, prod 0.0.47, polished in prod 0.0.49; follow-ups #323 change journal, #327 token security review) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## Product card photo corners (2026-11-06, DONE: audited, commit 7b74d48e on main, NOT on origin/main, not in 0.0.45) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #313 storefront dark theme + color system (2026-11-06, DONE: audited, released in 0.0.45 and deployed to prod, issue closed; follow-ups #320 manager color migration, #321 per-service image tags) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## Storefront phone UI and releases 0.0.37-0.0.43 (2026-11-05..06, DONE, prod v0.0.43) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #314 search-service end-user id and limits (2026-11-06, DONE: audited, on prod 0.0.44; frontend follow-up on origin/main after 0.0.44, issue closed) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #312 manager customer picker + capped-list anti-pattern (2026-11-06, DONE: audited, on prod 0.0.44, issue closed) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## Products of hidden categories (2026-11-05, DONE: audited, on prod since 0.0.33; lock follow-ups in 0.0.41) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)
## #307/#308 search code matches + N+1 round (2026-11-04..06, DONE, prod 0.0.27-0.0.33, issues closed) (full text: `.backup/PROJECT_CONTEXT-2026-11-10-309-to-307-full.md`)

## #297 prices keyed by product ERP id (DONE, prod 0.0.12; full text: `.backup/PROJECT_CONTEXT-2026-10-31-297-298-full.md`)
- `product_variant_price_entry` is keyed by `productExternalId` + `priceTypeCode` (a price may arrive before its product); `PriceEntryService` keeps the variant-based API. Docs: `docs/pricing.md`, `make bench-pricing`.
- Inbox retry: backoff 30 s to 30 min, 24 h budget, then `failed`; streams depending on a parent (contracts, photos, `order-changed`) can still fail this way (no issue, owner: not critical). Locally requeueing failed price events by SQL needs the owner's approval.
- Customer price type: counterparty main contract -> `contract.priceTypeId` -> `PriceType.externalId`, then `BranchSettings.defaultPriceTypeId` (manager portal Settings -> Branches). Only 3 of 29 warehouses have a branch, on purpose. Not run: e2e group `visibility-storefront`.

## #137 / #280 production email, site identity, mail languages (DONE, release 0.0.4, accepted on prod; full text: `.backup/PROJECT_CONTEXT-2026-10-31-137-280-290-full.md`)
- `EMAIL_TRANSPORT=file|smtp`; with smtp in production `MANAGER_PUBLIC_URL`, `STOREFRONT_PUBLIC_URL`, `SITE_NAME` are mandatory (never taken from Host/Origin). Every mail ships in ru and en (guard test, skill `email-templates`); language: request `languageCode` -> `SITE_DEFAULT_LANGUAGE` -> en. Site identity env `SITE_NAME`, `SITE_FAVICON_URL`, `EMAIL_FOOTER_TEXT`. Docs: `docs/deployment.md`.
- Gaps (no issue): frontends do not send `languageCode`; storefront "forgot password" link is `#`; address-change mail has no confirmation page.

## #303 data-drift consumer + reconciliation/widgets/settlement statement (2026-11-02..04, DONE, prod since 0.0.27; full text: `.backup/PROJECT_CONTEXT-2026-11-06-303-reconciliation-full.md`)
- Dashboard "Data drift reports" (per-source card, tabs Entity counts / Stock defects / Not checked); #303 stays open until the owner says "закрывай". Home widgets hide private-category and organization-less products; settlement statement hides internal document categories, balances unfiltered; contacts have no consumer by design. Prod checks are read-only and I run them myself.

## Production state (as of 2026-10-31, v0.0.16; now v0.0.66: all services), release recipe in `docs/deployment.md`
- Releases this week: 0.0.11 #296 filters, 0.0.12 #297 prices by product ERP id, 0.0.13 #298/#299/#300 + quality ignored, 0.0.14 purpose ignored, 0.0.15 currency ignored + per-line percent, 0.0.16 #302 schema drift realign. Prod `.env` carries the Integration Service URL/key and `INTEGRATION_RESYNC_SOURCE_SYSTEM=onec-main` (needed for replay); local copies live in gitignored `apps/server/.env.production-integration-service` and `.env.production-customer` (real prod customer for price checks).
- Setup documents: all 587 prod discount documents are active (replayed through the IS replay API in batches of 200). Only the fields mivend evaluates matter: recipients, price type, validity, header percent, product list/filter, condition (unconditional/quantity/amount) and a per-line percent (`discount_setup_product.percent`). Quality, purpose and currency are ignored by design; fixed price, price groups, bonus lines, set components, weekday/time windows, reference condition, markup type, pseudo documents, line characteristic/price type/negative line percent store the document inactive. A row stored under a reason that was later dropped needs `sourceVersion='0', contentHash=''` plus a replay (`docs/deployment.md`).
- Verified on prod under a real customer: catalog and cart show the 10% (group filter) and 5% (manufacturer filter) discounts exactly. Cart of that customer must be restored after a check.
- #296 and #302 closed; #293 narrowed to counterparty hierarchy comparisons (0 prod documents blocked, close if it stays 0), #292 (limit_percent) closed 2026-10-31 as won't-do (docs only; column comment fixed): ERP semantics is a per-unit amount cap, prod has only 0/null, owner does not use limits. #302 added a migrations-vs-entities guard in `make test-int`.

## #298 header logo + stock-scoped home widgets (DONE, 0.0.13; full text in the archive above)
- Logo from `link[rel=icon]` via `readSiteIconUrl()`; site name hidden on phones. Home widgets (`newArrivalProductIds`, `saleProductIds`, `popularProductIds`) are stock-scoped by `StockScopedIdsService`; "new" = `COALESCE(erpCreatedAt, createdAt)`; popular ranking cached 60 s per channel; widgets also hide products without an organization and products in private categories (see `docs/frontend.md`). Tests: `home-widgets.int.test.ts`, e2e `storefront/home/*`. e2e `global-setup.ts` warms `/` and `/catalog` (`warmStorefront`) so cold starts do not leave widgets on "Loading" (root cause not found). Open: `ДатаСоздания` distribution on prod unchecked (new = by `createdAt` until then); popular top-500 limit is only in a code comment; `MvLogo` tested via `resolveLogoMark`, not rendered.

## #299 manufacturer discounts + #300 pack stock tiers (2026-10-30, DONE: audited, pushed, closed, on prod in 0.0.13)
- #299: discount rules can target a manufacturer; `toFacetsAndWeight` (price-entry `order-preload.ts`) adds a synthetic `manufacturer` facet from `Product.customFields.manufacturer`, the single matching point for tiers, price resolution, tier progress and `order-aggregates.ts`. Docs: `docs/pricing.md` "Brand / manufacturer".
- #300: `stockTierFor(atp, thresholds, packRatio?)` (reservation `stock-tier.ts`) counts whole packs where `BranchSettings.packagesOnly` is true (odd ratios step by `wholePackQuantity`); `StockLevelService.getTiers` is the only producer of `stockLevel`; cart refusal message names the pack unit. Cost: one pack-ratio query plus up to two branch-settings reads per request (not measured). Docs: `docs/order-flow.md` "Packs (#300)".
- #301 closed as not planned: the in-stock filter counts base units on purpose, items under one pack stay listed so accounting gaps stay visible (owner).

## #290 / #289 setup documents (DONE, on prod; full text in the archive above)
- `discount-setup` / `retro-bonus-setup` streams carry one event per ERP setup document; unevaluable documents are stored inactive with a reason. Read path `DiscountSetupRulesService`. Design and field accounting: `docs/ai/erp-streams-map.md`, `docs/pricing.md`. Left: the #284 batched-apply inbox capability has no consumer; contact_infos are not consumed.

## Archived (full text: `.backup/PROJECT_CONTEXT-2026-10-25-271-270-196-192-263-full.md`)
- #271 batched order-discount evaluation (preload memo, 200-line cart 13 s -> 0.7 s), #270 catalog tier progress, #196 one-pass order-dependent discounts, #192/#260/#259, #263 child-entity visibility + #274 e2e stack: all done, audited, pushed, closed.

## Next (full text: `.backup/PROJECT_CONTEXT-2026-10-31-next-full.md`)
- #266 and #269 done (custom-field write policy, `make verify-branch-scope`); rules in `docs/access-control.md`. Remaining: #264/#265, #267, #261, #268.
- Dev gotcha: `ts-node-dev` children can spin at 95% CPU and never bind :3000; use `infrastructure/scripts/dev-kill.sh`, rerun `make dev`. `make e2e-*` uses its own throwaway stack (#274), never `make dev`'s.

## Closed 2026-10-12..20 (full text: `.backup/PROJECT_CONTEXT-2026-11-04-1020-sections-full.md`)
- #65/#123/#262 branch scope + visibility grants, #216 storefront i18n, #235/#256/#255/#257/#258, #247/#248/#231, #242-#244/#239/#240/#230/#233/#237, #234 Kafka topic rename: done, audited, pushed, closed. Follow-ups: #260/#261/#266/#268 (see Next).

## #206 proforma invoices + #222 form of payment vs terms (2026-10-12..15, done, audited, closed; full text: `.backup/PROJECT_CONTEXT-2026-11-06-206-222-full.md`)
- A proforma is informational, never closed: one document per (order, organization), many versions, number `<order>-<NN>-<version>`; the only source of debt is the ERP sales invoice. Forms of payment `cash` / `offline-terms` / `online-stub`; limit control is a policy for every form (`CreditPlacementService`). Docs: `docs/payments.md`. Open: realization ingestion, customer-driven allocation, withdraw vs concurrent payment lock. Owner: ERP sample PDFs are private, never copy real data into the repo.

## #223 legacy-name rename + #218 event-contracts 0.57-0.61 (2026-10-11..12, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-16-223-218-full.md`)

- Persisted keys renamed to `proforma-invoice` by plain UPDATE/RENAME (synchronize contours got the SQL by hand). `OrderChanged.document_number` refreshes `erpRegistrationDocumentNumber`; never create test commands in the shared integration `outbound_command` queue without the owner.

## #194 reserve deadline / order cancel (2026-10-11, DONE: audited, pushed, closed; full text: `.backup/PROJECT_CONTEXT-2026-10-13-sections-full.md`)

- One topic `mivend.orders.events.v1.order-events` (key `orderUuid`; types `confirmed` with `reserveUntil`, `cancel-requested`), ERP answers on `order-cancel-result`; statuses derive from ERP facts into `erpStatus` (forward-only). Rules in `docs/order-contracts.md`. Open: terminal ERP refusal, lost-answer auto-retry, deadline warning for registered orders.

## #208/#209/#211/#212/#213 (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-11-208-213-full.md`)

- #208 cross-system verification pass (runbook `docs/cross-system-verification.md`) plus concurrency hardening: order row lock in the contract guard, `erpOrderId` hidden from customers, sibling lock on tier rebalance, auto-reserve vs manual-confirm race. Spin-offs: #209 write only changed `customFields` keys (no stale full snapshots), #211 `UnknownOrderUuidError` (unknown `orderUuid` is not retried forever), #212 undecodable inbox rows can be dismissed (`dismissFailedIntegrationInbox`).

## Package-only sales #214/#219/#220 + orders/contracts/organizations #199/#201-#205 (closed; full text: `.backup/PROJECT_CONTEXT-2026-10-16-214-orders-contracts-full.md`, decisions in `docs/order-contracts.md`)

- Packs: only with `BranchSettings.packagesOnly` (replaces multiplicity, ERP MOQ lost silently); `enforceMultiplicity` opt-in; lines/stock/reserve stay in base units, conversion at the ERP boundary and UI (`PackagingPolicyService`, `wholePackagesQuantity`); `order-registration-result` has no unit field.
- A variant without `organizationId` (from `storage-location`) is not sellable; contract chosen at `ArrangingPayment` (`setOrderContract` before reservation); failed auto-reserve stored on the order; ERP reserved quantities win. Do not redo: closing is not a cancellation; deferred-terms orders get no automatic proforma; ERP masters keep the ERP id.

## #221 OrderLine uuid in its own table (2026-10-12, done; full text: `.backup/PROJECT_CONTEXT-2026-11-06-221-full.md`)
- Never put an identity/immutable value in an OrderLine custom field: Vendure merges lines only when every custom field matches, so a `uuid` field made each add a new line. The uuid lives in `packages/plugins/order-identity` (`order_line_identity`, written by `OrderLineIdentitySubscriber.afterInsert`, read via `OrderLineIdentityService.uuidsByLineId`).

## #207 identifiers (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-12-207-identifiers-full.md`)

- Every mivend-created entity has an immutable `uuid` (UUID v4, unique); exchange and idempotency key by uuid, human document numbers are numeric from DB sequences; `Order.customFields.uuid` via an EntitySubscriber, OrderLine uuid in `order_line_identity` (#221). Rules: `docs/identifiers.md`, AGENTS.md "Identifiers". The uuid/erpOperationId unification for Reservation is still open.

## #204 ERP order rejection (compressed, shipped/audited/closed — full text: `.backup/PROJECT_CONTEXT-2026-10-10-204-erp-order-rejection-full.md`)

`Order.customFields.erpStatus` REJECTED (non-terminal, cleared by a later non-rejected

## Older shipped work #195/#200, #198, #188, #180, #176, #181, #166/#168/#164/#170, #162, #164, #70, #160/#59/#158, #117 (closed, audited)
- Full text: `.backup/PROJECT_CONTEXT-2026-11-06-195-to-117-compressed-full.md` (integration health, branch fallback, credit control, checkout payments, cart UX, photos, favorites, category facets, stock tiers, search backend, Position). Decisions live in `docs/` (integration-health, order-flow, payments, frontend).

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
exists in the repo). `docs/ai/erp-integration-service-decision.md` has the narrative _why_.
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
- Open issues from the 2026-11-07 session: #325 CI `lint:css` fails (workflow pins Node 20, stylelint 18 needs 22; CI on main is red since 0.0.47), #326 detect a dev-contour child stuck at high CPU without listening and restart only it, #327 acting-token security review, #323 acting change journal, #320 manager color migration, #321 per-service image tags.

- #228 follow-ups of the settlement section (i18n, organization names from `organization_requisites`, e2e with data via the real ingestion path); #229 role gating of receivables (low); #226 reconciliation acts.
- #181 follow-ups (#187 asset GC, card chips, `garage-init` into `make up`); #154 discount-rule follow-ups; #44 shipping selector and freight pricing; #143 deferred routing UX.
- `access-control-review` of `AcquiringPlugin` on a branch; #138 sort/filter audit of ~17 `MvAdvancedDataTable` consumers (`manager-table-standard`); #130 Administrator-lifecycle E2E.
- #150 checkout integration point for `CreditLimitCheckService` (owner UX decision), #151 per-contract balance register question to the integration service team; `UserChanged.role` (#109) deferred; `branchId`/`departmentId` cleanup (#123-#125) design-only.

## Known problems and limitations

- #252: ERP-provisioned Administrators now get firstName = name + patronymic, lastName = surname (`parseErpFullName`); ones created before #252 keep swapped names, and `UserChanged` never rewrites firstName/lastName.

- **Fixed-price discount rules are not supported (known limitation, planned later)** — the ERP can
  express "a price instead of a discount" as a zero-percent register row with a price or price type
  set. mivend ignores such rules until a later mivend-side feature; the Integration Service
  currently sends a tombstone for those keys, so they never arrive.
- **`limitAmount` on a counterparty/contract discount rule is not enforced** — rules that set it
  are excluded from applying at all (safe default), not capped. See #154.
- **Upstream (integration service) version-collision/dedup risk for `discount-rule`** — their
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
`devhost.example.com:8003-8006` (local), `:8013-8016` (staging-integration), `:8024-8026`
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
- **Never name the ERP vendor or product anywhere in this repo** — always "ERP"/"the ERP system".
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
- Branches: the owner wants no leftover branches or worktrees; push by sha onto `origin/main` (fast-forward, rebase first), delete local and remote branches once their content is on `origin/main` (rebased copies show as unmerged by sha, compare by subject/patch-id), keep local `main` equal to `origin/main` with `git branch -f main origin/main` when it is not checked out.
- The working tree `/opt/mivend` is shared with other sessions: never `git reset --hard` or `git add` anything but explicit paths, and check `git status --short` before every commit (a chained `git switch` that failed once let a commit take another session's uncommitted `PROJECT_CONTEXT.md` lines).
