# Project Context

Updated: 2026-11-09

## #278 sign-in protection + #335 session policy (2026-11-09, DONE: audited, prod 0.0.58, issues closed; throttle, CAPTCHA, breach check and daily reset still OFF on prod)
- #278 plugin `sign-in-protection`: per-login and per-login+address throttle (Postgres, DB clock, advisory try-lock per login+address: a parallel correct sign-in from one address can be refused while on), identical responses, adaptive vendor-neutral CAPTCHA (`CAPTCHA_*`, needs owner's keys), breached-password check (`PASSWORD_BREACH_*`), nginx limits, fail2ban examples. Docs: `docs/deployment.md` "Sign-in protection". Release owner enables `SIGN_IN_THROTTLE_ENABLED` after checking `SIGN_IN_TRUSTED_PROXY_HOPS` against the real proxy chain.
- #335 in `session-management`: daily reset task (`SESSION_DAILY_RESET_ENABLED/HOUR`, process zone `TZ`, compose passes `TZ`; data timestamps stay UTC via `apps/server/src/pg-utc.ts`; shared `lastDailyInstant`; `SESSION_DAILY_RESET_TIME_ZONE` removed and fails boot), caps 2 per customer / 3 per staff (`SESSION_MAX_ACTIVE_CUSTOMER/STAFF`; the old `SESSION_MAX_ACTIVE_PER_USER` fails boot), new-device e-mail with opt-out (cookie `mv_device`, table `known_device`). Docs: `docs/access-control.md` "Session policy".
- Lessons: cookie-session writes its cookie through the OutgoingMessage prototype (wrap `res.writeHead`, never `setHeader`); core re-saves a stale User after reset/session creation (clear flags last); e2e order effects (acting group last, shared e2e logins need caps 20 and throttle off); migrations 1791562000000, 1791565000000.
- Owner decisions open: business time zone for the daily reset, CAPTCHA keys, when to enable `TWO_FACTOR_REQUIRED`. Next: #332 contacts design, #333 ERP document pages, #334 Node 22 in Docker images.

## #323 change journal (implemented, awaiting audit; branch issue-323-change-journal)
- Plugin `packages/plugins/change-journal`: one TypeORM subscriber journals insert/update/soft-remove/recover/remove of every entity not in `EXCLUDED_ENTITIES` into `change_journal_entry` in the same transaction (migration 1791575000000). Actor via a global interceptor + `AsyncLocalStorage` (administrator / customer / acting / system); every scheduled task is labelled `scheduled-task:<id>`, other background writes `background`. Owner decision 2026-11-10: changes from the ERP integration are not journaled, decided by source (`erp-integration-*`/`sync-*` tasks, `/erp/` REST routes, sync RabbitMQ consumer via `runAsIntegration`), so staff edits of ERP-fed entities stay journaled. Secret columns (name tokens password/token/hash/secret/...) stored as `{redacted: true}`.
- Admin API `changeJournalForEntity` / `changeJournal`, permission `ReadChangeJournal` (same roles as `ReadEntityHistory`), scope via `EntityVersionScopeRegistry`; the cross-entity list only for scope `all`. Cleanup task `change-journal-cleanup`: 365 days, 5000-row batches.
- Coverage test `apps/server/src/__tests__/unit/change-journal-coverage.test.ts`: a new entity goes into `JOURNALED_ENTITIES` or `EXCLUDED_ENTITIES` (`change-journal-scope.ts`). Known gap: query-builder `update/delete` and raw SQL writes are not journaled; upserts show as `insert`. Docs: `docs/change-journal.md`. Follow-ups: manager-portal "History" tab; `Order`/`Customer` scope rules in the registry (today scope `all` only).

## #338 OIDC sign-in for staff (implemented, awaiting audit)
- Plugin `packages/plugins/oidc-sign-in`: authorization code + PKCE, link by e-mail then `sub` (`ExternalAuthenticationMethod`, strategy `oidc`), no auto-provisioning, superadmin always local. OIDC sign-in deliberately skips our TOTP (provider's factors; accepted risk in access-control.md); local password keeps it. Manager portal only. Env `OIDC_*` (all or none). Docs: `docs/access-control.md`, `docs/deployment.md`. E2E uses a mock provider started by the e2e stack (`packages/e2e/helpers/mock-oidc-provider.mjs`).
- Manager GraphQL documents were added to `generated/graphql.ts` by hand, regenerate with `pnpm --filter @mivend/manager codegen` on a running dev server.

## #279 two-factor authentication (2026-11-08, DONE: audited, on prod 0.0.55 with `TWO_FACTOR_REQUIRED=false`, issue closed)
- Plugin `packages/plugins/two-factor`: TOTP for every account type (storefront, manager portal, Vendure Dashboard via an overlay in `apps/server/src/dashboard/two-factor-sign-in`). Purpose is binding a person to a personal device, not hardening. Contract and release condition: `docs/two-factor.md`.
- Obligation is binary (`TWO_FACTOR_REQUIRED`), forced enrolment at next sign-in, no grace, no recovery codes, no trusted devices. Lost device: e-mail link to a reset page. Ops reset: `infrastructure/scripts/two-factor-reset.sh`.
- Before switching it on in prod: every admin incl. superadmin enrols from an open session first. Sign-in throttling (#278, plugin `sign-in-protection`, docs/deployment.md "Sign-in protection") covers the second step; switch `SIGN_IN_THROTTLE_ENABLED` on with it. API keys bypass 2FA (only superadmin holds those permissions). The Dashboard overlay depends on the login extension rendering inside the form: re-check on Dashboard upgrades.
- Migration `1791561000000-discount-limit` (order card) is numbered after `1791560000000-two-factor`, which shipped first in 0.0.55; the card ships after it, so the order is natural.
- Planned next: #335 session policy (daily reset 03:00 business time zone incl. staff, max 2 sessions per customer, new-device e-mail with opt-out, deactivation ends sessions); #332 contacts design; #333 ERP document pages; #334 Node 22 in Docker images.

## #309 chunked category-tree recompute (2026-11-07, DONE: audited, pushed to origin/main e429ca50, issue closed)
- `recomputeCategoryTree` plans the whole tree once unlocked, then takes the `category-tree` lock per top-level subtree that has writes; each chunk re-reads and re-plans under the lock. Idle tick takes no lock (~0.16 s for 8000 categories). Gap: a category created or moved mid-run waits for the next tick. Docs: `docs/category-hierarchy.md`.
- Process lesson: another session switched the shared tree to its branch, so #309 commits landed there; fixed by cherry-picking onto a worktree of origin/main. Check `git branch --show-current` before every commit. e2e from a worktree needs a ts-node shim in `apps/server/node_modules/.bin` and copies of `.env.local`, `apps/server/.env.central|.env.branch`; `make e2e-group` from a worktree recreates the shared postgres/garage containers.

## Manager portal redesign concept (2026-11-07, concept agreed, no code yet; issue #320 rewritten)
- Source of truth: `docs/manager-portal-ui-concept.md` (a concept, not a literal spec; owner refines pages one at a time, never implement mockups literally). Older per-page texts: `docs/ai/manager-portal-pages/` (local), `docs/ai/manager-portal-concept.md`.
- Rules: entity tables first (orders, proforma invoices, payments, discounts, customers, approvals); the same table is reused in the customer card with a preset filter; server checks scope per context; portal only shows ready data; same ui-kit components/tokens as the storefront; colors only from ui-kit roles; light and dark themes in the manager (a change from the earlier "separate decision").
- Menu: Dashboard, Customers, Documents (Orders, Proforma invoices, Payments, Discounts), Approvals, Team, Bulk operations, Analytics (placeholder), Settings. No Catalog (viewed via storefront: anonymous / as customer / as self), no order-creation screen, no "All documents".
- Not implemented yet: analytics (separate analytical store later), manager card, tasks, dashboard charts and redesign (dashboard postponed), quick article entry, change of assignment. Orders already carry `placedByAdministratorId`; no assignment history, not needed now.
- Next session: implement entity lists in the standard shape (start with orders, reference `CustomerOrdersTab`), customer card on top, then shell/menu, then colors/dark theme/lint, dashboard last.
- Owner preferences learned: everything goes straight to `main` (no side branches; for docs use a detached worktree and `git push origin HEAD:main`); do not ask permission for editing issues; do not treat concepts as specs.

## #316/#317/#318 e2e speed-up (2026-11-06..07, DONE: audited, in prod release 0.0.47, issues closed)
- `make e2e-groups G="a b"` runs several groups on one stack under the shared flock (`infrastructure/scripts/e2e-groups.sh`); `e2e-leak.sh` fails the run if a group leaves more placed orders or active reservations (carts not counted). `make e2e-group` unchanged.
- Every `make e2e-*` runs two passes (`e2e-playwright.sh`): specs tagged `@read-only` on `E2E_PARALLEL_WORKERS` (default 3), the rest on 1 worker. A `describe` whose `beforeAll` creates data is a writer, never `@read-only`. Rules: `docs/testing-strategy.md` "E2E parallelism".
- Manager role projects: tag `@on:<project>` in the test/describe title (`helpers/role-projects.ts` builds each project's grep); untagged = all four roles. No project-name `test.skip` (skip guard fails on any skip). Per-spec decisions: table in `docs/e2e-testing.md`.
- Open: no quiet-box stability series for #317 (do not raise the worker count without measuring load); `orders-list` "row click" flakes under heavy load (follow-up #324 area).

## #322 manager order creation as the customer (acting mode) (2026-11-06, DONE: audited, prod 0.0.47, polished in prod 0.0.49; follow-ups #323 change journal, #327 token security review)
- Flow: manager portal NewOrderPage (customer picker + trading point) -> Admin `startActingSession` (CreateOrder) gives a one-time hashed ticket (~60s) -> opens storefront `/acting#ticket=` -> Shop `exchangeActingTicket` returns a session token in the body (no cookie). Storefront keeps it in `sessionStorage`, sends `Authorization: Bearer` + `x-acting-session: 1`, `credentials: 'omit'`. `finishActingSession` ends it. Plugin: `packages/plugins/acting-session/` (migration 1791550000000).
- Isolation: middleware drops the Cookie header and swaps `req.session` for a detached object (`detachCookieSession`) so Set-Cookie never leaves; liveness = 4h from createdAt, parent manager session alive, CreateOrder/SuperAdmin. Acting cart is linked to the customer at creation and marked `actingSessionId`; `ActingActiveOrderStrategy` self-heals real sessions; cleanup task `acting-session-cleanup` (24h carts). Acting sessions are excluded from session cap, mySessions, login history. Attribution: `placedByAdministratorId` + private order note.
- Core untouched; divergences (logout/endAllSessions override, password change ends acting sessions) in `docs/vendure-core-divergences.md`, tripwire test `vendure-core-assumptions.test.ts`. Env `STOREFRONT_PUBLIC_URL`, storefront `MANAGER_PUBLIC_URL`.
- UI (0.0.49, owner-decided): no banner and no Finish button; the storefront header line is `{manager full name} → {customer} · {point}` (the word 'Manager' dropped so long point names fit; fallback 'Manager →' when the name is empty). Sign-out in an acting tab (`useLogout`) ends the acting session, closes the tab and goes to the manager portal; a customer's sign-out is unchanged. Favourites persist per customer under a manager (liked); the acting cart resets on re-entry (accepted, not critical) and never duplicates the customer's real cart. `exchangeActingTicket` returns `administratorName`, read through the Administrator repository because `AdministratorService.findOne` returned nothing in that request on the integration contour (cause unknown, add a line to #322 if found). `getLinkedCustomerId` filters `deletedAt IS NULL ORDER BY id`.
- Open: prod smoke needs the owner's word (writes data; customer and depth not chosen); token security review #327; mutation journal #323; `trading-point.service.ts` is 648 lines (split debt); matrix scenarios 1,3,4,8 are e2e-only (group `manager-acting`).

## Product card photo corners (2026-11-06, DONE: audited, commit 7b74d48e on main, NOT on origin/main, not in 0.0.45)
- `MvProductCard.vue`: photo has `border-radius: var(--app-radius-md)` and `height: 100%` so small photos scale up; the `.mv-product-card__img` container is a `grid-template: minmax(0, 1fr) / minmax(0, 1fr)` grid with 6px padding (a percent max-height did not clamp inside an auto track and big photos overflowed).
- Known limit: photos wider than about 2:1 are letterboxed and keep square corners at the frame edge; follow-up if it shows on real photos: wrapper with the radius and `overflow: hidden`. Checked on synthetic images in both themes (staging products have no photos), real photos not seen.
- `mivend.issue.313` (release owner) takes the sha into the next release; push by sha onto origin/main, not the branch. First `make test` once had 2 unexplained failed files (second run 569/569); if it returns, record the file names.

## #313 storefront dark theme + color system (2026-11-06, DONE: audited, released in 0.0.45 and deployed to prod, issue closed; follow-ups #320 manager color migration, #321 per-service image tags)
- All color lives in `packages/ui-kit/src/styles/`: `palette.css` (oklch primitives, one hue variable per family `--hue-brand/-ink/-night`), `theme-light.css` and `theme-dark.css` (the same role names `--app-*`/`--el-*` pointing at palette steps; dark scoped to `html[data-theme='dark']`, declared after Element Plus `html.dark`). `tokens.css` keeps radii, fonts, z-index and imports the three. Retune a hue = change one variable.
- Roles by meaning; text roles (`--app-nav-accent*`, `--app-price`) are never fills, fills under light text use `--app-brand-fill*` / `--app-primary-btn*`. stylelint (`stylelint.config.mjs`, in `make lint` and lint-staged) rejects hex/rgb()/oklch()/named colors/`--palette-*`/text-roles-as-fills in storefront + ui-kit outside `styles/`. Any exception: ask the user twice (rule in `frontend-rules`), list in `docs/ui-standards.md` "Exceptions". Test `ui-kit/.../theme-tokens.test.ts`: light and dark define the same roles.
- Mechanism: pre-paint inline script in `storefront/index.html` (key `mivend.theme`: system|light|dark), `src/theme/index.ts` (live follows OS while `system`), `useThemeSwitcher`, three-button switch in `MvAccountMenu` under the language item (desktop + mobile sheet). Manager portal does not set `data-theme`, so it stays light (its colors moved onto the same palette: shades of some greys/greens shifted by a few percent, not eyeballed).
- Checked by screenshot (dark, desktop): home, catalog (hover/selected/search), cart, checkout, orders, account, documents, statement, requests, product, balance, trading points, proformas, login + error, modals, date picker, catalogue/search/notification panels, mobile home/cart/more sheet. Not seen: toasts, native select popups, favorites, reconciliation acts, terms, employees, notifications page, mobile catalog/orders/account (shots taken, not reviewed). Light seen on home, catalog, cart, account, balance, requests only.
- Tests: `unit/theme.test.ts` (4, passed), e2e `storefront/theme/theme.spec.ts` group `storefront-theme` (written, not run), Storybook theme toolbar. Not done: rename `--app-nav-*` (touches both portals), manager portal color migration (#320; ~359 literal lines, outside stylelint until then) and dark, sync preference to profile. Product page has no add-to-cart button in either theme (pre-existing, unrelated).
- Release 0.0.50 (2026-11-07, full deploy, one version for all services): #321 per-frontend image tags + `server`/`server-admin` split with a bootstrap lock, LISTEN/NOTIFY notifications and retention; #315 trading point map location; #320 manager redesign (orders list, customers, saved table views, migration 1791551000000). Images built from 2b2b60eb (build fixes 26d4009c, 2b2b60eb). Prod backups: /opt/mv/backups/pre-0.0.50-*.sql.gz, .env.bak-0.0.49, docker-compose.yml.bak-0.0.49; GEO_* appended to /opt/mv/.env. `migrate` prints a DROP INDEX schema-diff warning for hand-written-migration indexes: known noise, never run schema:sync. Open: #330 manager tests type check, #331 CORS/CSRF, first manager-login check on prod (orders list, tableViews, acting, bell) by the owner.
- #328 (branch issue-328-trading-point-split, audited, waiting for the owner's test freeze to end, then 321 runs the suites): the ERP stream writes only `trading_point_erp` (mirror) and moves only `isActive`/counterparty on mivend's `trading_point` (which now has a `uuid`); a customer edit of an ERP-confirmed point is a `trading_point_change` (one pending per point) that a manager accepts/rejects (admin mutations, point row locked first); acceptance publishes `TradingPointChangeAcceptedEvent` (point uuid + per-point version) but the outbound ERP message is NOT wired (needs contracts + ERP side). Drift queries `tradingPointsDifferingFromErp`/`tradingPointsNotConfirmedByErp`. Migration 1791553000000; synchronize contours get the uuid via `trading-point-uuid-backfill.ts`. Details in docs/sync.md.
- Release 0.0.49 (2026-11-07, server + workers + storefront, no migration): acting-as-customer polish (#322) - the header line reads `{manager} → {customer} · {point}`, no banner and no Finish button, sign-out in an acting tab ends the acting session and closes the tab; `getLinkedCustomerId` skips soft-deleted customers (a deleted customer linked first blocked acting sessions); the exchange returns `administratorName`. Manager stays on v0.0.48, dashboard on v0.0.44. Prod backup: .env.bak-0.0.48 (no DB dump, no migration). Open: why `AdministratorService.findOne` returned nothing in the exchange request on the integration contour (the name is read through the repository meanwhile).
- Release 0.0.48 (2026-11-07, server + workers + manager, no migration): #324 orders page summary loads apart from the table in one `ordersAttention` request. Storefront stays on v0.0.47, dashboard on v0.0.44. Prod backups: /opt/mv/backups/pre-0.0.48-*.sql.gz, .env.bak-0.0.47. Open: CI `lint:css` fails on the runner (stylelint 18 needs a newer Node), same as on 0.0.47.
- Release 0.0.47 (2026-11-06, full deploy): #322 acting-as-customer sessions (migration 1791550000000), e2e speed-up #316-#318, carousel photos and guest theme switch from the unreleased 0.0.46 images (0.0.46 tag was built but never deployed). Prod backups: /opt/mv/backups/pre-0.0.47-*.sql.gz, .env.bak-0.0.45, docker-compose.yml.bak-0.0.45.
- Release 0.0.45 (storefront + manager only, server/workers/dashboard stay on v0.0.44, so `.env` IMAGE_TAG=v0.0.45 would move them on the next full `up -d`; same backend code, safe). Prod .env backup: /opt/mv/.env.bak-v0.0.44. Toasts and dark/light checked on prod; native select popups still not seen.

## Storefront phone UI and releases 0.0.37-0.0.43 (2026-11-05..06, DONE, prod v0.0.43)
- Header menu redesign: no burger, account dropdown, bottom tab bar (`MvBottomTabBar`, shown <=1180px = `COMPACT_NAV_BREAKPOINT`), More sheet, full-screen catalogue drill-down; header and tab bar are glass (`backdrop-filter` only on a `::before` of the header, never on the header itself: it would trap fixed descendants).
- Catalog on phones: `MvFilterSheet` (full-screen modal <960px, inline above; one slot instance via Teleport `disabled`; `useFocusTrap` composable), filters button with active count, grid/list switch is icons, search button is a lens (<=600px), short placeholder. Carousels (`ProductScrollRow`) are native horizontal scroll with snap, arrows only on pointer devices.
- Trading-point form: international phone input (libphonenumber-js, ui-kit `phoneFormat.ts` + server `contactValidation.ts`), name format, fail-open address suggestions (`suggestAddress`, env `ADDRESS_SUGGEST_URL`/`_API_KEY` on prod `/opt/mv/.env`), stale-chunk auto reload. Category icons are Phosphor/MDI assets on Vendure `Collection.featuredAsset` (staging and prod loaded).
- Phone width rule (`.claude/skills/frontend-rules`, "Phone width"): no page scrolls horizontally at 360px. Grid tracks are `minmax(0, 1fr)`, every `display:grid` declares its columns (unit test `ui-kit/.../gridTracks.test.ts`); e2e group `storefront-layout` sweeps all routes at 360px. Scoped style files shared by several components do not reach the page's own elements (balance page mobile rules had to move).
- Releases: 0.0.38 tab labels, 0.0.39 carousels, 0.0.40 filters/search/glass, 0.0.41 width fixes + category lock (backend restart), 0.0.42 cart price stack + switch active colour + overflow guard, 0.0.43 grid columns (checkout overflow with real data). Release recipe: worktree on `origin/main`, take the exact audited file list, bump, push by sha, `gh workflow run "Publish app images"`, then pull ONLY app services on prod (a bare `pull` also pulls `postgres:16-alpine` and recreates the database container once). Never `git add`/`commit` a directory in the shared tree: other sessions' staged files get swept in (use `commit --only <paths>` or a worktree).
- Open: #311 manager portal (Settings tabs), MvColumnFilterSelect search (unaudited), `MvAccountSheet` still has its own focus trap (move to `useFocusTrap`).
- Release handoff (owner decision 2026-11-06): session mivend.issue.311 is the release owner from now on (collects all audited commits, coordinates with other sessions, asks the owner for per-release permission). Local-only commits at handoff: this docs commit and 5d6aec12 are not pushed; push by sha in the next release. Recipe above (worktree from origin/main, explicit shas, package.json-only bump, pull only app services).

## #314 search-service end-user id and limits (2026-11-06, DONE: audited, on prod 0.0.44; frontend follow-up on origin/main after 0.0.44, issue closed)
- `X-End-User-Id` = HMAC-SHA256 of `user:`/`session:`/`ip:` (IP counted from the right of `X-Forwarded-For` by `SEARCH_TRUSTED_PROXY_HOPS`, default 2; a spoofed left hop cannot change the id); prod has `SEARCH_END_USER_ID_SECRET`. Errors `SEARCH_RATE_LIMITED` (one retry, wait <= 2 s) / `SEARCH_END_USER_BLOCKED` / `SEARCH_REFINE_QUERY`; `SEARCH_MAX_OFFSET` (1900) caps skip on both backends. Docs: `docs/environments.md`. Storefront shows them via `ShopApiError` + `describeLoadError` (keys under `loadError`); manager order item search shows the server message.
- Open: re-check search-service logs (read-only via sp.auditor) once real traffic exists: first look had 8 events, 3 with an id, limits still shadow (`limit.enforce=0`: 600/min per key, 120/min per user); id scheme was sent to the service owners through sp.auditor (no confirmation). Gotcha: applying a partial index patch with `--unidiff-zero` put keys in the wrong i18n block; use `git add -p` or a worktree.

## #312 manager customer picker + capped-list anti-pattern (2026-11-06, DONE: audited, on prod 0.0.44, issue closed)
- New-order picker uses server search (`counterparties(search, take:20)`, `useDebouncedSearch` + `useLatestRequest.cancel`); any active counterparty is listed, an order only for one with an activated portal customer ("Portal access not activated", not selectable; `docs/order-flow.md`). Server side: `erpIds` filter (cap 200), `visibleOrdersAmount`, `lastOrderDates` follow the ORDER scope, not the counterparty scope (`docs/access-control.md`).
- Guard `noBulkTake.test.ts`: no `take >= 100` in manager/storefront `.graphql` or gql strings without `# bounded: <reason>` (not covered: `take: $take` variables). Rules added to the frontend-rules and backend-plugin-rules skills.
- e2e: spec `manager/orders/order-create-picker.spec.ts`; the seed adds 510 `Zza Picker Filler` counterparties in chunks of 100 (+~32 s per run) and two `Zzz Picker` ones assigned to the manager account (`docs/e2e-testing.md`). Anything that lists counterparties must not assume the first page is everything.
- Spec fix for `visibility/manager/categories.spec.ts:195` (ignore the settings section menu's mobile select) is in main (`dfab3b0c`). Picker checked by screenshots (found / no portal, desktop and phone); the "refine your search" hint (>20 matches) is covered only by a unit test, not seen on screen (needs a role that sees the filler counterparties).
- Shared tree gotcha: it was left on `feat/313-dark-theme` (uncommitted dark-theme storefront work of another session); commits made there do not reach main. Check `git branch --show-current` before committing, prefer a worktree from `origin/main`.

## Products of hidden categories (2026-11-05, DONE: audited, on prod since 0.0.33; lock follow-ups in 0.0.41)
- A product in a hidden category (`collection.isPrivate`, incl. inherited) is invisible to customers in shop search/suggestions/facets, `products`, `product`, `Collection.productVariants`, widgets, cart add. Staff Admin API unchanged. Query-time rule, no index field, no migration, no reindex. Design and limits: `docs/category-hierarchy.md`. Audit follow-up: tree writers share advisory lock `category-tree`; hidden lines in a cart block raise/checkout (not removal); excluded ids memoised per request.
- Tree lock (`category-tree`, `withAggregateLock` opts `{lockTimeoutMs, idleTimeoutMs, slowHoldWarnMs}`): waiters wait 60 s, holder idle cutoff, warn on >60 s hold; full recompute of ~8000 categories measured ~9-17 min (real `updateCollection` ~70 ms each); override listener retries on 55P03 up to 30 min. Recompute is chunked per top-level subtree (#309). Docs: `docs/category-hierarchy.md`, `docs/concurrency.md`.
- Release flow: `.claude/skills/release` (checks, audit BEFORE release, push by sha, bump, build, `deploy-prod`); gate in AGENTS.md. Releases are owned by `mivend.bugs.1`; 0.0.41 (backend restart, no migration) carries my commits (origin/main d57420a3) plus its storefront batch.
- Code: `shared/hiddenCategoryProducts.ts`, access-control `HiddenCategoryProductsService` + `shop-visible-products.resolver.ts` + order interceptor, search `internal-shop-search.resolver.ts` (internal) and `ProductLookupService` (external).
- External: `excludeCategoryIds` on /resolve-query (search-service `sha-dc51122`, deploy it first). A hidden ancestor always hides its subtree (a `visible` override under it has no effect, `resolveCategoryIsPrivate`), so internal and external agree. `make test-int` not run by the agent.

## #307/#308 search code matches + N+1 round (2026-11-04..06, DONE, prod 0.0.27-0.0.33, issues closed)
- Per-request batching: `CtxLoader` (packages/shared, ctx must not outlive one operation), `CatalogPricingService`/`LookupMemo`/`OrderLineContextService`, `AccessScopeService` per-ctx memo; a failing key returns an Error in its slot (never fails the batch). `activeDiscountCounts` refuses >200 ids. Measured: home 152->7 queries, cart fields 165->11, repricing 152->8.
- Header shows "counterparty full name · trading point name (else address)"; order status `confirmed` is "Ждёт отгрузки" (filter "Ждут отгрузки").
- Gotcha: `RoleProvisioningService` rewrites default roles' permissions on EVERY start, hand-granted rights vanish on deploy; category visibility needs `UpdateCatalog`, now in `default-roles.ts` (general-director, portal-admin). See docs/access-control.md.
- Flaky `collection-filters-recompute.scheduled-task.test.ts` fixed by freezing Date (`5d6aec12`, local only, handed to mivend.bugs.1 to ship). Open, not investigated: prod hang 2026-11-05 05:46 UTC (pool exhaustion after a manager /orders 499; owner said to drop it).

## #297 prices keyed by product ERP id (DONE, prod 0.0.12; full text: `.backup/PROJECT_CONTEXT-2026-10-31-297-298-full.md`)
- `product_variant_price_entry` is keyed by `productExternalId` + `priceTypeCode` (a price may arrive before its product); `PriceEntryService` keeps the variant-based API. Docs: `docs/pricing.md`, `make bench-pricing`.
- Inbox retry: backoff 30 s to 30 min, 24 h budget, then `failed`; streams depending on a parent (contracts, photos, `order-changed`) can still fail this way (no issue, owner: not critical). Locally requeueing failed price events by SQL needs the owner's approval.
- Customer price type: counterparty main contract -> `contract.priceTypeId` -> `PriceType.externalId`, then `BranchSettings.defaultPriceTypeId` (manager portal Settings -> Branches). Only 3 of 29 warehouses have a branch, on purpose. Not run: e2e group `visibility-storefront`.

## #137 / #280 production email, site identity, mail languages (DONE, release 0.0.4, accepted on prod; full text: `.backup/PROJECT_CONTEXT-2026-10-31-137-280-290-full.md`)
- `EMAIL_TRANSPORT=file|smtp`; with smtp in production `MANAGER_PUBLIC_URL`, `STOREFRONT_PUBLIC_URL`, `SITE_NAME` are mandatory (never taken from Host/Origin). Every mail ships in ru and en (guard test, skill `email-templates`); language: request `languageCode` -> `SITE_DEFAULT_LANGUAGE` -> en. Site identity env `SITE_NAME`, `SITE_FAVICON_URL`, `EMAIL_FOOTER_TEXT`. Docs: `docs/deployment.md`.
- Gaps (no issue): frontends do not send `languageCode`; storefront "forgot password" link is `#`; address-change mail has no confirmation page.

## #303 data-drift consumer + reconciliation/widgets/settlement statement (2026-11-02..04, DONE, prod since 0.0.27; full text: `.backup/PROJECT_CONTEXT-2026-11-06-303-reconciliation-full.md`)
- Dashboard "Data drift reports" (per-source card, tabs Entity counts / Stock defects / Not checked); #303 stays open until the owner says "закрывай". Home widgets hide private-category and organization-less products; settlement statement hides internal document categories, balances unfiltered; contacts have no consumer by design. Prod checks are read-only and I run them myself.

## Production state (as of 2026-10-31, v0.0.16; now v0.0.50: all services), release recipe in `docs/deployment.md`
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
