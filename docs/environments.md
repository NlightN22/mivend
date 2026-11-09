# Environments

There are **two independent axes** here — this document exists because conflating them is exactly
what caused the incident in issue #68 (a plain `make dev` connected `KafkaConsumerService` to
Integration Service's real staging Kafka broker, `integration.example.com`, and wrote real inbound
events into the same Postgres that `make seed-all`'s synthetic `erp-import` data lives in).

## Axis 1: `INSTANCE_TYPE` — identity (central hub vs. branch)

Pre-existing, unrelated to issue #68. `INSTANCE_TYPE=central|branch` answers "who am I in the
hub↔branch topology" (see `docs/sync.md`). A branch instance syncs to/from the central hub over
RabbitMQ; the central hub is also the only instance type allowed to talk to the ERP / Integration
Service at all (the external-integration-rules skill). This axis does **not** say anything about which data
source a given run is actually pointed at — that's axis 2.

Testing the hub↔branch RabbitMQ sync itself (`plugin-sync`) is a separate, not-yet-implemented
concern from what this document covers — it could in principle run against a local Kafka/RabbitMQ
within the local-dev contour below, but that is out of scope for issue #68 and untested so far.

`INSTANCE_NUMBER_CODE` (issue #207) is a related but separate axis: a fixed 3-digit code per
deployment (one for the hub, one per branch) used only as the document-number prefix in
`NumberingService` — it does not affect `INSTANCE_TYPE`/`INSTANCE_ID` routing.

## Axis 2: contour — where does the data come from

Three contours, always for a **central** instance (branches never touch Integration Service):

| Contour                                  | Env file                                       | Makefile target                | Database                                 | Real Integration Service Kafka?                                                                            |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **local** (isolated dev)                 | `apps/server/.env.central`                     | `make dev`                     | `mivend_central`                         | Never — `INTEGRATION_KAFKA_ENABLED=false`. Only synthetic data via `make seed-all` (`erp-import`).         |
| **e2e** (throwaway, #274)                | `apps/server/.env.central` + overrides         | `make e2e-dev`/`e2e-cart`/`e2e-smoke` | `mivend_e2e_<timestamp>`, dropped after the run | Never — same settings as local, own database, vhost and search index prefix. |
| **staging-integration** (external Kafka) | `apps/server/.env.central.staging-integration` | `make dev-staging-integration` | `mivend_central_staging_integration`     | Yes, deliberately — validates the real Kafka contract against Integration Service's actual staging broker. |
| **production**                           | `infrastructure/docker/.env.production`        | `make prod-up`                 | `postgres` service, `docker-compose.yml` | Yes, real prod Integration Service.                                                                        |

Production Postgres is **not** an externally-managed database — it's a container this same repo
provisions (`infrastructure/docker/docker-compose.yml`'s `postgres` service, built from
`infrastructure/docker/postgres/` — the same image the local/staging-integration contours above
use, see `.env.production.example` in that directory).

**Minimum PostgreSQL: 16** (`infrastructure/docker/postgres/Dockerfile`, `postgres:16-alpine`): queries use `pg_input_is_valid` (approval payload gates). Every contour and the test database run this image.

### Migrations (issue #147)

Local and staging-integration both run with `synchronize: true` (`dbConnectionOptions.synchronize`
in `apps/server/src/vendure-config.ts`, gated on `NODE_ENV !== 'production'`) — no migration is
ever needed or run there. **Production sets `synchronize: false` and is the only contour that uses
TypeORM migrations**, via `dbConnectionOptions.migrations` (`apps/server/src/migrations/*.ts`) and
`apps/server/src/migration.ts` (`pnpm migration:generate <name>` / `migration:run` /
`migration:revert`, run against the target contour's own env file — see that file's own comment).

Since no production contour has ever existed, `1790567453660-baseline.ts` is a single **baseline**
migration capturing the entire schema as of this issue (generated via Vendure's own
`generateMigration`, diffed against a genuinely empty database — never against a `synchronize`-
created one, which would show no diff at all) — not an incremental step on top of an older,
never-written migration. Any schema change from here on (a new column, a new entity, a new index)
needs its own incremental migration generated the same way, kept in `apps/server/src/migrations/`.

**Non-blocking index builds (#250).** `migration.ts` runs migrations through Vendure's `runMigrations`, which uses
transaction mode `each`, so a migration with `transaction = false` may use `CREATE INDEX CONCURRENTLY` (as the
`integration_outbox` order index does) and does not lock writes on a large table. A failed concurrent build leaves an
invalid index; the migration drops any existing one first, so re-running it recovers.

**Renames (#223).** There is no production, so a rename is one plain migration (`RENAME`); a synchronize
contour that sees the new name first drops and recreates the table, which is accepted for dev data. Do not add
carry-over code for renames.

`migrationsRun` is deliberately not set on `dbConnectionOptions` — nothing runs migrations
automatically at `main.ts`/`worker.ts`/`worker-email.ts` boot. Instead `make prod-up` runs
`infrastructure/docker/docker-compose.yml`'s `migrate` service (`node dist/migration.js run`,
built from the same server image, no `restart`/depends_on beyond Postgres being healthy) to
completion (`docker compose run --rm migrate`) after Postgres is up but before `up -d` starts
`server`/`worker`/`worker-email` — the compiled `dist/migration.js` + `dist/migrations/*.js` are
what the runner image actually has (`apps/server/Dockerfile`'s runner stage copies `dist/`, not
`src/`), so `ts-node src/migration.ts` (the local `pnpm migration:*` scripts, used for
generate/revert during development) is not what runs there. Local/staging-integration never need
any of this — `synchronize: true`.

**First boot / superadmin (#285).** Every process bootstraps Vendure's non-atomic superadmin check-then-create, so `main.ts`, `worker.ts` and `worker-email.ts` wrap bootstrap in `withBootstrapLock` (advisory lock held until bootstrap finishes; processes take turns, a waiter logs once and fails after `BOOTSTRAP_LOCK_TIMEOUT_MS`, default 10 minutes). Production also has the `administrator."emailAddress"` partial unique index (migration `1791535000000`); synchronize contours drop it at boot, so only the lock protects them. Manual cleanup of an existing duplicate: `docs/deployment.md` "First boot and duplicate superadmin".

Migration-seeded data is absent there too. The credit-term check policy recipient (`department-head`) comes from `make seed-all` (`seed-approvals`); until it runs, the recipient is empty and every credit-term request escalates (fail-closed).

**One-time backfill done on 2026-09-28 (mivend.audit.common's #147 review, MEDIUM)**: `synchronize`
added `eligible_at` with `DEFAULT now()`, so every pre-existing row got the `ALTER TABLE` time, not
`COALESCE(next_retry_at, created_at)` — since `claimBatch` no longer reads `next_retry_at`
directly, an in-flight backoff row would have become claimable immediately (bypassing its backoff)
and FIFO order among already-queued rows would have been lost. Fixed with a batched
`UPDATE ... SET eligible_at = COALESCE(next_retry_at, created_at) WHERE status IN
('pending','processing')` against `mivend_central_staging_integration` (196,408 rows, 5000/batch —
staging's resync was actively writing to this table at the time; local's `mivend_central` had zero
rows in this table, nothing to backfill). The baseline migration's own fresh-empty-DB `INSERT`
path is unaffected — this was purely an already-`synchronize`d dev/staging-data correction, not a
migration-content issue.

**Issue #148 fixed (2026-09-28)**: `claimBatch`'s multi-stream `pending` claim still seq-scanned
under a large resync backlog even with the indexed `eligible_at` column (#147) — an IN-list across
many streams can't use a `(stream, ...)` index for a single global `ORDER BY eligible_at`.
`findClaimCandidateIds` (`integration-inbox.service.ts`) now splits into one query branch per
stream for the `pending` half, each a plain equality lookup against a new partial index
`integration_inbox_event_claim_pending (stream, eligible_at) WHERE status = 'pending'`, merged in
SQL — confirmed live on staging (`EXPLAIN ANALYZE`, ~330k-row backlog): ~3.4s → ~7ms. Migration:
`1790571151248-add-claim-pending-index.ts`. Staging's own copy of the index was already created by
`synchronize` before the migration was generated (see the entity's own `@Index` addition) — no
manual staging DDL was needed for this one, unlike the eligible_at backfill above.

**#148 audit HIGH, fixed same day**: splitting `claimBatch` into two phases (a fast candidate-id
lookup via `findClaimCandidateIds`, then a locked `SELECT ... WHERE id IN (...) FOR UPDATE
SKIP LOCKED`) lost a correctness guarantee the original single-query design got for free —
Postgres's lock-time row recheck (EvalPlanQual) re-evaluates the whole `WHERE` clause against the
latest committed row version once a lock is acquired, but only for conditions actually present in
that query. `SKIP LOCKED` only skips a row locked by a still-open transaction; if a competing
sweep already claimed _and committed_ one of phase 1's candidate ids before phase 2 ran, an
`id IN (...)`-only phase 2 would still lock and return that (already-processing/processed) row —
double-processing it. Fix: phase 2 repeats the full eligibility condition
(`(status='pending' OR (status='processing' AND updated_at < stale threshold)) AND
eligible_at <= now()`) alongside `id IN (...)`, so the recheck now has something to actually drop
the stale row against. Regression test: `integration-inbox.int.test.ts`'s "does not re-claim a row
a competing sweep already claimed and committed between the two phases" — spies on
`findClaimCandidateIds`, lets it run for real, then commits a competing status change to one of
its returned ids before phase 2 executes, and asserts that row never comes back from `claimBatch`.

### Database locale (issue #140)

Postgres collation is fixed at `CREATE DATABASE` time and cannot be changed for an existing data
directory — the wrong locale silently sorts Cyrillic text by raw code point instead of alphabet
(this is what happened before #140: `en_US.utf8`, the glibc default, produced a nonsensical
company-name sort order), with no error until someone notices broken UI ordering.

- All three contours' Postgres containers build from `infrastructure/docker/postgres/`, whose
  `entrypoint.sh` **requires** `DB_ICU_LOCALE` (e.g. `ru-RU`) to be set and refuses to start
  without it — see that file's own comment.
- `make up` uses `--no-recreate`: existing dev containers keep their old compose config and env, so a changed `docker-compose.dev.yml` needs `make up-rebuild` (or a manual recreate) to take effect.
- `docker-compose.dev.yml` sets `DB_ICU_LOCALE=ru-RU` for `postgres-central`/`postgres-branch`
  (covers local and staging-integration, which share the same dev stack per this doc's own model).
- `docker-compose.yml` (production) requires `DB_ICU_LOCALE` with no default — `make prod-up`
  fails immediately with a clear error if it's unset, rather than silently provisioning a
  wrong-locale database. See `infrastructure/docker/.env.production.example`.
- Independently, `apps/server/src/db-locale-check.ts` runs on every `main.ts`/`worker.ts`/
  `worker-email.ts` boot **when `NODE_ENV=production`** and refuses to start unless the actual
  database's ICU locale (`pg_database.daticulocale`) matches `DB_EXPECTED_LOCALE`. This is
  defense in depth against a wrongly-provisioned production DB regardless of how it got that way
  (restored from an old dump, manually created, etc.) — it doesn't depend on this repo's own
  entrypoint having provisioned it.
- CI's plain `postgres:16` service is **not** ICU-provisioned — `db-locale-check.ts` only enforces
  the locale when `NODE_ENV=production`, since a throwaway CI database sorting Cyrillic wrong is a
  known limitation, not an incident. Local/staging-integration/branch dev databases **are** ICU
  `ru-RU` (via `docker-compose.dev.yml` above), just not boot-checked.
- Changing an **existing** non-empty database's locale requires a dump/recreate/restore (locale
  is fixed at creation time) plus a full `REINDEX` afterwards — not a rolling/in-place change. For
  local dev this just means `make dev-reset` (synthetic seed data, cheap to regenerate); for
  staging-integration/production with real data this needs a maintenance window. Status as of
  2026-09-23: every dev-stack database (`mivend_central`, `mivend_central_staging_integration`,
  `mivend_test`, `mivend_branch`) is already ICU `ru-RU`; no production contour exists yet, so no
  real-data migration is pending.

**Storefront search backend per contour (issue #69)**: `local` uses `internal` (`ElasticsearchPlugin`
against local Elasticsearch, `SEARCH_BACKEND=internal` or unset); `staging-integration` and
`production` use `external` (search-service's `POST /resolve-query`, `SEARCH_BACKEND=external` +
required `SEARCH_SERVICE_URL` and `SEARCH_SERVICE_API_KEY`, sent as `X-Api-Key`). `SearchBackend` (`SEARCH_BACKEND_DEFAULT` in
`packages/plugins/search/src/types.ts`) is decided once at bootstrap in `search.plugin.ts` — a
per-contour deployment choice, never an admin-configurable runtime toggle, and the two backends
are never registered together.

**Search-service contract (#314)**: every `/resolve-query` call carries `X-End-User-Id`, an HMAC-SHA256 hex digest (keyed by `SEARCH_END_USER_ID_SECRET`) of `user:<customer user id>` or, for a guest, `session:<anonymous session token>`, or, before any session exists, `ip:<client hop of X-Forwarded-For>`: stable and pseudonymised (the raw id or IP never leaves). The IP hop is counted from the right by `SEARCH_TRUSTED_PROXY_HOPS` (default 2: host proxy + storefront proxy, both append to `X-Forwarded-For`), so client-supplied values on the left cannot change the id; set it to the real number of proxies in front of the server. Without `SEARCH_END_USER_ID_SECRET` nothing is sent, the server logs a warning at start and limits count against the whole key. A `429` is retried once after `Retry-After` (waits at most 2 s, default 1 s), then surfaces as GraphQL code `SEARCH_RATE_LIMITED` with `retryAfterSeconds`; `403 END_USER_BLOCKED` becomes `SEARCH_END_USER_BLOCKED` (no retry); `skip` above `SEARCH_MAX_OFFSET` (default 1900, service ceiling 2000) and `400 OFFSET_TOO_LARGE` become `SEARCH_REFINE_QUERY`. The cap applies to both backends. Worst case for one search under a 429 is about 12 s (5 s timeout, up to 2 s wait, 5 s timeout); `Retry-After` as an HTTP date is read as the default 1 s. The depth cap also applies to the external admin search but not to the internal Elasticsearch admin search. Storefront localisation of these codes is not done yet. The internal index gained code-match fields (#307/#308, `docs/frontend.md` "Code matches"):
run the admin `reindex` once on every existing `internal` contour (`make dev-reset` does it implicitly), otherwise code groups stay empty.

**Address suggestions** (storefront trading-point form): `ADDRESS_SUGGEST_URL` and `ADDRESS_SUGGEST_API_KEY` (key sent as `Authorization: Token`), unset = off. Served by the `suggestAddress` shop query to logged-in customers. Fail-open: a timeout or error pauses suggestions for 30 s and the field stays plain text.

**Geo provider (issue #315)**: server-side place search and reverse lookup behind the `searchAddress`, `reverseGeocode` and `geoConfig` shop queries (any logged-in shop user, checked by an active session; `geoConfig` returns an empty config without one; fail-open, cache, 30 s pause after a failure and call spacing, all per provider). The deployment enables a list of providers and a default; the picker lets the user switch among them. `searchAddress`/`reverseGeocode` take an optional `provider` key (default = deployment default) and reject a key that is not enabled with a user-input error. `geoConfig` returns the enabled providers with their public browser keys, the default and the start view, never a server key. Empty `GEO_PROVIDERS` = off. The legacy `suggestAddress` query is unchanged. The admin API has the same three queries for the manager portal, gated by `ReadCustomer` plus `ReadCounterparty` (the pair that gates `updateTradingPointDetails` and `setTradingPointActive`, so anyone who can edit a point can pick its location). `tradingPointsWithoutLocation` (admin API, `ManageErpIntegration`) lists active points whose coordinates are missing, `(0, 0)` or out of range; the ERP drift check reports the same count.

**Location is required on every edit of a point (#315, owner-confirmed)**: `customerAddTradingPoint`, `customerEditTradingPoint` and the staff `updateTradingPointDetails` all run `resolveTradingPointLocation`, which falls back to the stored coordinates when the input has none and rejects the edit when neither yields a usable location. So an edit that does not touch the location (servicing branch, contacts, name) is also refused for a point stored without coordinates until a location is picked; this is intended ("without coordinates the point cannot be changed"). Staff find such points with `tradingPointsWithoutLocation`. The ERP stream only fills a missing location and never overwrites one a person set.

**Geo provider limits (accepted)**: shop `searchAddress`/`reverseGeocode` accept any logged-in customer and have no rate limiter (owner decision: not now). The provider quota, cache and 30 s failure pause are process-wide per server process, so one account can exhaust the open provider's 1.1 s slot queue for everyone on that process; browser-native providers do not use it. After the planned split of the shop and admin servers each process keeps its own quota against the same public open instance, so that provider's 1 req/s policy applies per process, not per deployment.

| Variable | Default | Meaning |
| --- | --- | --- |
| `GEO_PROVIDERS` | unset (off) | Comma-separated registry keys to enable: `provider-a`, `provider-b`, `open` (key-to-vendor mapping lives only in the adapter files under `packages/plugins/counterparty/src/geo/` and `packages/ui-kit/src/components/MvLocationPicker/adapters/`). An unknown key fails on first use. `provider-a` and `provider-b` are browser-only: they need no server key, and their `searchAddress`/`reverseGeocode` calls are rejected with a user-input error because place search and reverse lookup run inside the map script in the browser. |
| `GEO_DEFAULT_PROVIDER` | first enabled | Provider used when the query names none; ignored if not enabled. |
| `GEO_PROVIDER_A_BROWSER_KEY`, `GEO_PROVIDER_B_BROWSER_KEY` | unset | Per-provider origin-restricted key for the map script; returned by `geoConfig`. The `provider-b` browser key must be restricted by origin and to exactly three APIs: Maps JavaScript API, Places API (New) and Geocoding API (keys themselves never go in the repo). |
| `GEO_PROVIDER_A_BROWSER_SUGGEST_KEY`, `GEO_PROVIDER_A_BROWSER_SEARCH_KEY` | unset | Separate origin-restricted keys for the `provider-a` type-ahead (Suggest API) and for resolving a pick to coordinates plus the marker address (Search API); without the suggest key the search box is off, without the search key a pick has no coordinates and the address stays empty. Any env var `GEO_<PROVIDER>_BROWSER_<NAME>` other than `_KEY` is returned by `geoConfig` as `params.<name>`. |
| `GEO_PROVIDER_A_BROWSER_HOST` | adapter default (international domain) | Domain suffix of the `provider-a` map script host (`api-maps.<host>`); the international default works inside and outside the country of the provider, set the vendor regional domain to switch. The UI language of the script follows the storefront locale. |
| `GEO_OPEN_URL` | adapter default | Override the `open` endpoint, e.g. an own instance of the open geocoder. |
| `GEO_DEFAULT_CENTER_LAT`, `GEO_DEFAULT_CENTER_LNG`, `GEO_DEFAULT_ZOOM` | unset | Map start view when no coordinates are known; returned by `geoConfig`. |
| `GEO_PROVIDER_USER_AGENT` | `mivend-geo` | Identifying User-Agent for `open`; the public open instance requires a real one with a contact. |

Suggestions carry coordinates when the provider returns them (`open` does for search; an item without a point has no coordinates). `provider-a` search runs in the browser (JS API 3.0 `suggest` for type-ahead, `search` by uri for the point and by coordinates for the marker address). `provider-b` search runs in the browser (Places `AutocompleteSuggestion` type-ahead, coordinates fetched when a suggestion is picked; marker address via the Geocoder). `open` is spaced to at most one call per 1.1 s and, per its public-instance policy, is never driven by per-keystroke autocomplete: its search runs on Enter or after a pause of at least 1.5 s, while `provider-a` and `provider-b` search natively in the browser with a 350 ms debounce. A provider with no available search (`provider-a` without a suggest key) hides the search box. Provider terms are accepted.

**Data-drift report sources (issue #303)**: disabled by default; polled only on the central hub. See `docs/consistency-reports.md`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `CONSISTENCY_SEARCH_SERVICE_ENABLED` | unset (off) | `true` turns the search-service source on |
| `CONSISTENCY_SEARCH_SERVICE_URL` | `SEARCH_SERVICE_URL` | base URL of the provider |
| `CONSISTENCY_SEARCH_SERVICE_API_KEY` | none, required | separate read-only key with scope `consistency:read`; never committed |
| `CONSISTENCY_SEARCH_SERVICE_CHECK_INTERVAL_MS` | `21600000` | must equal the provider's full-pass schedule (6 h); a check older than 3x that is reported stale |
| `CONSISTENCY_RETENTION_DAYS` | `90` | resolved reports older than this are deleted daily |

**`packages/plugins/search/package.json` pins `@vendure/elasticsearch-plugin` to `^3.5.7`**, not
`^3.7.3` like every other `@vendure/*` dependency after #77's core upgrade — confirmed via `pnpm
view @vendure/elasticsearch-plugin versions` that `3.5.7` is the newest stable release this package
has ever published (no `3.6.x`/`3.7.x` stable exists upstream, only unpublished
`3.6.0-minor-*`/nightly tags). This is a deliberate, currently-unfixable upstream lag, not an
overlooked version-unification gap — do not "fix" it to match `^3.7.3` without first checking
whether Vendure has published a newer `@vendure/elasticsearch-plugin` release.

`ErpIntegrationPluginOptions.kafkaEnabled` (`INTEGRATION_KAFKA_ENABLED` env var, default `false`
when unset — `KAFKA_ENABLED_DEFAULT` in `packages/plugins/erp-integration/src/types.ts`) is what
actually encodes this axis in code. It gates, in addition to the existing `instanceType ===
'central'` check:

- `KafkaConsumerBootstrapService` (inbound consumer — also worker-process-only, see issue #67)
- `IntegrationOutboxWorker` (outbound producer path)

The consumer recovers on its own (#295): a non-retriable crash retries with capped backoff, and a runner that
stops silently (no reconnect within 2 minutes of a disconnect/stop) is rebuilt. Status persistence failures are logged
and retried, never fatal. The prod `worker` healthcheck is active only in a process that started the consumer (it creates
`/tmp/kafka-consumer-expected` at start and clears stale marker files) and is unhealthy while
`/tmp/kafka-consumer-connected` is absent. The state is visible in `docker compose ps` / `docker ps`; nothing restarts the container.

A config site that forgets to set `kafkaEnabled` fails safe (no Kafka connection) rather than
silently defaulting to on.

## Kafka `clientId`/`groupId` naming

Format: `mivend-central-hub-<contour>` — `central-hub` names the axis-1 identity (this is always
the central instance; branches never set these at all), `<contour>` names axis 2: `local`,
`staging-integration`, or production's own suffix. Never the bare `mivend-central-hub` — a
per-contour suffix means even a misconfiguration (e.g. a stray broker override) cannot silently
merge two contours' consumer offsets or producer identity, which is standard practice for
multi-environment Kafka setups (see
[Confluent's topic/client naming guidance](https://www.confluent.io/learn/kafka-topic-naming-convention/)).
Defaults live in `apps/server/src/vendure-config.ts`; each `.env.central*` file may override them
explicitly (`.env.central.staging-integration` sets `mivend-central-hub-staging-integration`).

## Database isolation

Nothing in code enforces that the local and staging-integration contours use different
databases — it's enforced by convention (`DB_NAME` in each `.env.central*` file) plus the
Makefile targets each creating/expecting their own database (`mivend_central` vs.
`mivend_central_staging_integration`). Do not point `.env.central.staging-integration` at the
same `DB_NAME` as `.env.central` — doing so would let real Integration Service data intermix with
`make seed-all`'s synthetic data, which is the exact bug this document exists to prevent.

The e2e targets never use `mivend_central` (#274): each run creates `mivend_e2e_<timestamp>`, a RabbitMQ
vhost of the same name and an Elasticsearch index prefix `<name>-` (`ELASTICSEARCH_INDEX_PREFIX`), seeds it with
`seed-erp.mjs` plus the e2e fixtures, and drops all three at the end. The code is in
`apps/server/src/__tests__/e2e-stack/` (it reuses the `make test-access` harness); logs go to
`apps/server/.e2e-stack/`. Runs are serialised on `/tmp/mivend-e2e.lock`, and the next run removes the
leftovers of a killed one.

Postgres has its own container/port per instance type (`mivend_central`/`mivend_central_staging_integration`
both live in `docker-postgres-central-1`, distinguished by `DB_NAME`; the branch instance's own
`docker-postgres-branch-1` is separate again). Since issue #128 (job queue migrated off
BullMQ/Redis to Vendure's DB-backed `DefaultJobQueuePlugin`), job records live in each contour's
own Postgres database and are isolated by `DB_NAME` the same way everything else is — the
`REDIS_DB` index scheme this section used to describe for per-contour BullMQ queue isolation no
longer applies. Redis itself (the `redis` container/env vars) has been removed from this project
entirely as a follow-up to #128 — nothing in the codebase depends on it anymore.

## Asset storage (S3, issue #181)

Vendure stores assets in an S3-compatible bucket when `S3_ENDPOINT` is set (dev: Garage from
`docker-compose.dev.yml`, port 3900); unset keeps the local `static/assets` directory. One bucket
and key per contour. Garage does not create them itself, so after the first `make up` run
`infrastructure/scripts/garage-init.sh <bucket> <GK + 24 hex key id> <64 hex secret>` once per
contour (idempotent), then put `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
`S3_SECRET_ACCESS_KEY` into that contour's `.env`. Moving to a managed S3 changes only these values.

## Testing must stay within the local contour

**`make test`/`make test-int`/`make e2e-dev` run exclusively against seeded, synthetic data
(`make e2e-dev` on its own throwaway e2e database, see "Database isolation").** Never against staging-integration's real Integration Service data — see
AGENTS.md's Testing requirements ("Rule: automated tests run only against the local contour's
seeded/synthetic data") for the full rule. In short: local is seed-only (no external source,
`INTEGRATION_KAFKA_ENABLED=false`); staging-integration is real-source-only (no manual seeding,
ever) — each contour has exactly one of "seeded" or "real external data," never both, and
automated tests only ever run against the seeded one. If a test needs data the local seed set
doesn't have yet, extend the seed (`erp-import` record type, `seed-erp.mjs`) or the test's own
fixtures — don't borrow real data from staging-integration to make a test pass.
Sole exception: `make e2e-integration` (#255, `docs/e2e-testing.md`), run by hand against a running
staging-integration contour; it seeds nothing, reads the contour DB with SELECTs only, cancels its own orders as
superadmin and restarts the shared contour (once with a broken schema registry), which interrupts anyone else using it.

**Balance page demo (local only).** `make seed` also imports, through the `erp-import` record types
`contract` (with `isCustomerContract`), `settlementDocumentType`, `settlementDocument` and `settlementBalance`,
a customer that no e2e spec uses: `balance-demo@test.example` / `BalanceDemo123!` (counterparty
`cnt-balance-demo`, contract `ctr-balance-demo`). It has one paid, one partly paid and overdue, and one not yet
due sales invoice; dates are relative to the seed time, so every `make seed` re-applies them.

**Order-edit and held-send states (local only).** `make seed-order-edit-states` (after `make seed-all`,
server running, idempotent) creates, for the demo customer `credit-limited@buyer.example`: an unsent
order with three lines whose middle line is short on its own organization's stock (exercises "Cut lines to
available stock", "Remove? Yes/No" on a non-last line and the last-line restriction), and a reserved order
whose `order.confirmed` send is held by policy (dashboard Outbound tab "Sends held by policy" and the alert
`integration-outbox-held`). It imports storage places, organization stock and contracts through the
`erp-import` record types `storageLocation`, `stockOrganization`, `contract`, and leaves the policy
`erp.organization-stock` at `pre-send-to-erp` set to `hold` on the local contour (that hold queues every automatic
reserve of an order short on organization stock, so e2e checkout specs expecting `RESERVED` fail until the
policy is set back to `warn` in Controls and policies). The held row is marked by
one raw SQL update (an automatic reserve already stops at the same hold, so the live flow cannot produce it on
demand). Never run it against staging-integration.

## Setting up the staging-integration contour

1. Copy `apps/server/.env.central.staging-integration.example` to
   `apps/server/.env.central.staging-integration` (gitignored — never commit real credentials).
2. Fill in `INTEGRATION_KAFKA_SASL_USERNAME`/`INTEGRATION_KAFKA_SASL_PASSWORD` with the real
   staging credentials.
3. Optional: set `EVENT_CONTRACTS_REGISTRY_TOKEN` (read-only package-registry token) so the
   Integration health page can show whether the event-contracts version is outdated — see
   `docs/integration-health.md`.
4. Run `make dev-staging-integration`. It refuses to run if the env file is missing, kills any
   stale staging-integration processes from a previous run first (safe to re-run — see
   `infrastructure/scripts/dev-kill-staging-integration.sh`), starts its own database
   (`mivend_central_staging_integration`), and never touches `make dev`'s local contour or
   `make dev-branch`'s processes: `dev-kill.sh`/`dev-kill-branch.sh`/`dev-kill-staging-integration.sh`
   each identify only their own contour's processes (by the `.env.*` file on the process's own
   command line) before killing anything.
5. Optional, for `make e2e-integration`: `STAGING_TEST_MANAGER_USERNAME`/`STAGING_TEST_MANAGER_PASSWORD`
   (the contour's manager login) enable the manager-portal cancel scenario; without them it is skipped.

It does not run its own `tsc -b --watch` plugin compiler — `dist/` is shared across contours, and
a second watcher alongside `make dev`'s would be the exact duplicate-process/stale-dist hazard
the `backend-plugin-rules` skill's "Monorepo `dist/` and dev watching" section warns about. It
runs a one-shot `pnpm build:plugins` instead, which is sufficient whether or not `make dev` is
already watching plugins.

## Reaching a contour from outside this box

Every contour's server/worker/storefront/manager bind to `0.0.0.0` (or `localhost`, for the
Postgres/RabbitMQ it shares — see "Database isolation" above), but the only thing actually
reachable from outside this box is **nginx** (`/etc/nginx/sites-enabled/mivend.conf`, TLS on
`devhost.example.com`) plus `ufw` allowing exactly the ports nginx listens on — see this box's
`publish-service` skill (the shared box-level one) for the
port-per-service-behind-nginx convention this follows. Internal ports are never reachable
directly from outside (no `ufw allow` for them).

| Service          | Contour             | Internal (`localhost`) | External (`https://devhost.example.com:<port>`) |
| ---------------- | ------------------- | ---------------------- | ------------------------------------------------ |
| API (Admin+Shop) | local               | `3000`                 | `8003`                                           |
| Storefront       | local               | `5173`                 | `8004`                                           |
| Manager          | local               | `5174`                 | `8005`                                           |
| Dashboard        | local               | `5175`                 | `8006`                                           |
| API (Admin+Shop) | staging-integration | `3010`                 | `8013`                                           |
| Storefront       | staging-integration | `5183`                 | `8014`                                           |
| Manager          | staging-integration | `5184`                 | `8015`                                           |
| Dashboard        | staging-integration | `5185`                 | `8016`                                           |
| API (Admin+Shop) | e2e (during a run)  | `3020`                 | not published                                    |
| Storefront       | e2e (during a run)  | `5193`                 | not published                                    |
| Manager          | e2e (during a run)  | `5194`                 | not published                                    |
| Storefront       | **prod preview**    | `18024`                | `8024`                                           |
| Manager          | **prod preview**    | `18025`                | `8025`                                           |
| Dashboard        | **prod preview**    | `18026`                | `8026`                                           |

### Production preview (issue #115)

Not a real fourth contour — a standing way to check "what does this actually feel like as a real
production build" without deploying anywhere external. `make preview-build`/`preview-up`/
`preview-down` build the same Docker images `docker-compose.yml`'s real production deploy would
use (nginx + the bundled/minified Vite output, `Cache-Control: immutable` on hashed assets, proxy
keepalive — see the three `packages/*/Dockerfile`s) and run them directly on this host via
`docker run --network host` (not the compose network), pointed at **staging-integration's real
data** (`:3010`) rather than a fresh empty database. Kept intentionally rare/manual — for after a
pile of changes have landed, not a routine dev-loop step; `make dev`'s raw Vite dev servers stay
the everyday workflow.

The container's own nginx listens on a fixed host port directly (`LISTEN_PORT` env var,
`packages/*/nginx.conf.template`'s `listen ${LISTEN_PORT};`) rather than the compose deployment's
internal `80` — `--network host` means "container port" and "host port" are the same thing, so
this has to be a port nothing else already owns. `18024`/`18025`/`18026` were picked simply as
free ports at the time; they carry no other meaning and aren't part of the local/staging-
integration internal-port sequence.

Published externally the same way as the other contours (`/etc/nginx/sites-enabled/mivend.conf`
proxies `8024`/`8025`/`8026` → `127.0.0.1:18024`/`18025`/`18026`, `ufw allow`ed) — unlike those,
these three ports are **not tied to a `make dev`/`make dev-staging-integration` process**, so they
stay up independently and only go down via `make preview-down` (or a manual `docker rm -f`).

**Real gotcha hit setting this up**: `API_TARGET=http://localhost:3010` hangs inside the
container — nginx resolves `localhost` via IPv6 first and the backend doesn't answer on `::1`.
Use `127.0.0.1` explicitly (`make preview-up`'s default) or `--network host`, never bare
`localhost`, when pointing a container's `API_TARGET` at anything on this same box.

Load-time baseline measurements for this preview are recorded in
`docs/frontend-load-benchmarks.md`.

`packages/dashboard` has its own `Dockerfile`/`nginx.conf.template` and is wired into
`make preview-build`/`preview-up`/`preview-down` alongside storefront/manager, but is
deliberately **not** added as a service to `infrastructure/docker/docker-compose.yml` — that file
covers the real deploy, and dashboard's real-deploy story wasn't part of #115's scope (see
`@vendure/dashboard` caveats above). Not an oversight.

**Dashboard has its own port, unlike the old Admin UI.** The Angular `@vendure/admin-ui-plugin`
used to be mounted inline on the API process (`AdminUiPlugin.init({ port: ADMIN_UI_PORT, ... })`)
and, despite its `port` option, never actually listened on that port — `/admin` was served on the
main API port instead (verified: `ss -tlnp` showed no socket on `ADMIN_UI_PORT`). Issue #77
replaced it with `@vendure/dashboard`, deployed as a genuinely separate standalone Vite app
(`packages/dashboard`, same pattern as storefront/manager), not mounted on the server via
`DashboardPlugin.init()`. So unlike the old setup, the Dashboard **does** need and get its own
port (`5175`/`8006` local, `5185`/`8016` staging-integration) — it's a real process listening on
that port, not a dead config option.

**Same-origin dev proxy, not a cross-origin direct call.** An earlier version of
`packages/dashboard/vite.config.ts` set `@vendure/dashboard`'s `api.host`/`api.port` to a literal
`VITE_API_TARGET` host:port, baked into the served bundle — this broke for anyone reaching the
Dashboard through its published external port (e.g. `:8006`), since their browser then tried to
fetch its own local machine's `http://localhost:3000/admin-api` instead of this box's. Fixed by
setting `api.host`/`api.port` to `'auto'` (derives the admin-api origin from `window.location` at
request time) plus a `/admin-api` (and `/assets`) dev proxy in `vite.config.ts`, same pattern as
`packages/storefront`/`packages/manager`'s own vite proxies — every viewer's request now lands
back on whichever origin they're actually looking at, same-origin, no server-side CORS needed at
all.

The server's `plugins` array also registers `DashboardPlugin` (from `@vendure/dashboard/plugin`)
with no `.init()` call — same "standalone deployment" caveat the old `AdminUiPlugin` had for its
own `metricSummary` query: without it, the Dashboard's Insights page has no server-side
`dashboardMetricSummary` GraphQL field to query and its order-metrics chart silently renders
empty (no error surfaced beyond a 400 in the browser console).

Step of 10 between contours is deliberate — the next real contour after staging-integration (or a
branch instance that ever needs its own external access, which it doesn't today per
`docs/architecture.md`'s "Storefront hosting: Central-only, not per-branch") would normally take
the next free decade (`8023`-`8026`), but `8024`/`8025`/`8026` are already spoken for by the
production-preview ports above (not a real contour, see "Production preview" below) — the next
real contour should use `8033`-`8036` instead, or reclaim `8023`/`8027`-`8029` if the preview
setup is ever retired.

`packages/storefront/vite.config.ts`/`packages/manager/vite.config.ts` read `VITE_API_TARGET`
(and `VITE_PORT`) as plain env vars rather than hardcoding `localhost:3000` — the root
`package.json`'s `dev:storefront:staging-integration`/`dev:manager:staging-integration` scripts
set them explicitly. `--mode staging-integration` is passed on the Vite CLI purely so the process
is identifiable by `infrastructure/scripts/dev-kill-staging-integration.sh` (and excluded by
`dev-kill.sh`'s local-only kill) — Vite's own `.env.<mode>` file loading isn't used, since
`.env.*` is repo-wide gitignored and there's no secret here worth fighting that for.

Adding the nginx `server{}` blocks + `ufw allow` rules for a new contour is a one-off manual step
on this box (not part of this repo) — follow `publish-service`'s steps exactly, including its
"verify from outside this box" step (a `curl` from this box to its own public domain silently
loops back via `lo` and proves nothing).

## Open follow-up

`make check-event-contracts` (see `docs/ai/erp-integration-service-decision.md`'s "Audit
2026-09-04" contract-drift finding) should ideally run against whatever
`@nlightn22/event-contracts` version staging/prod actually use, not just whatever happens to be
locally pinned — not yet implemented, tracked under issue #68's checklist.

`packages/storefront`/`packages/manager`/`packages/dashboard` all now have a real production
build/serve pipeline (`Dockerfile` + nginx, issue #115; see "Production preview" above) — but
every contour, including staging-integration, still serves them via the raw Vite dev server
today; nothing has actually deployed the new images to a real contour yet, only run manually via
`make preview-*` on this box. See `docs/frontend-load-benchmarks.md` for real baseline numbers
comparing the prod container against the dev server.

## Contour startup timing (reference)

Healthy `make dev-staging-integration` restart (after `pnpm build:plugins`): `/health` 200 in
about 25–40 s. Several minutes with the server pinned at ~90% CPU before it listens means a
boot-time hook is doing O(n²) work (the manufacturer facet backfill did, fixed 2026-10-04);
a concurrent restart by another session also kills the first one (`make: Killed`).

**Orphaned ts-node-dev child spinning at ~90% CPU, port never listening**: a hot-reload during
`pnpm build:plugins` can leave the child stuck in ts-node-dev's own `waitForFile` busy-wait
(its compile process died mid-respawn). Confirm with a stack sample (`kill -USR1 <pid>`, then
Debugger.pause over `127.0.0.1:9229`), then `kill -9` that child only — the watcher respawns it.

### Stuck process scanner (#326)

`infrastructure/scripts/stuck-scan.py` is a host-level daemon, independent of any `make` target and of this repo's paths: every
`STUCK_INTERVAL_SECS` it looks at all processes whose name matches `STUCK_COMM` (node, esbuild, vite, chrome, python by default)
and reports those that stay above `STUCK_CPU_PCT` CPU for `STUCK_BUSY_SECS` while holding no listening socket. It only
detects: it writes the status file atomically and never touches a process unless `STUCK_KILL=1`, and then only a suspect inside
a process group recorded by `dev-run-tracked.sh` (`/tmp/mivend-dev*.pgid`; the file must be owned by root or the suspect's user and
a member of the group must still run with its cwd inside this repo), whose stdout is a regular file untouched for
`STUCK_LOG_QUIET_SECS`, logging the kill to stderr. Workers and import children never listen and can run hot for long, so
`STUCK_KILL` must not be used where the child's output is not a file that keeps growing while it works. Docker containers are never touched.

Install (nothing is installed by the repo): copy `infrastructure/systemd/mivend-stuck-scan.service` to `/etc/systemd/system/`,
fix the path in `ExecStart`, `systemctl enable --now mivend-stuck-scan`; without systemd,
`nohup python3 infrastructure/scripts/stuck-scan.py >/dev/null 2>&1 &` (or a `@reboot` cron entry) does the same.

| Variable | Default | Meaning |
| --- | --- | --- |
| `STUCK_STATUS_FILE` | `/run/mivend-stuck-processes.json` | Status file (scanner, pre-flight and `make dev-health`) |
| `STUCK_INTERVAL_SECS` | `30` | Scan interval |
| `STUCK_CPU_PCT` | `60` | CPU percent of one core that counts as busy |
| `STUCK_BUSY_SECS` | `600` | How long it must stay busy and not listening; a cold server compile plus boot is about 40 s, a legitimately CPU-bound suite process can run longer, hence the generous default |
| `STUCK_COMM` | `^(node\|esbuild\|vite\|chrome.*\|python3?)$` | Process-name regex to inspect |
| `STUCK_KILL` | unset | `1` enables the kill of suspects in dev-run-tracked groups |
| `STUCK_LOG_QUIET_SECS` | `300` | Kill only when the suspect's stdout file has not changed for this long |
| `STUCK_PGID_GLOB` | `/tmp/mivend-dev*.pgid` | Tracked group files `STUCK_KILL` is limited to |

Status file: `{"updated": <epoch>, "interval": <s>, "stuck": [{"pid", "command", "cwd", "cpu_percent", "busy_seconds",
"listening": false, "last_log_lines": [...]}]}`; `stuck` is an empty list when all is well. `last_log_lines` is filled when the
process's stdout is a regular file. The file is created with mode 0640 (it holds command lines and log tails). The scanner
test (`stuck-scan.test.sh`) needs python3, jq, ss and setsid.

`make up` (so `test-int`, `test-access`, `test-changed` and every `e2e-*` target) and `make e2e-integration` run
`stuck-check.sh` first: it prints the stuck list as a warning and carries on. `STUCK_CHECK=strict` makes a non-empty list fail the
target. A missing file, or one older than `STUCK_STALE_SECS` (180), is ignored silently. `make dev-health` is the same reader
in strict, verbose mode (exit 1 if anything is stuck).

## Auth cookie secret

`COOKIE_SECRET` signs the auth cookie and must be identical for every server/worker process and
stable across restarts. Vendure's default is a random secret per process start, which logs everyone
out (and creates a new session row) on every restart. Outside production a fixed dev default is used;
in production the server refuses to start without a real value (a `change-me…` placeholder is also
rejected). Changing it logs everybody out exactly once.

## Second factor (TOTP)

`TWO_FACTOR_REQUIRED` (`true` or `false`, default `false`, any other value fails boot) makes a one-time authenticator
code mandatory at every fresh sign-in for every account, superadmin included (#279). Production sets `true`; the local,
branch and staging-integration contours keep it `false`, so seeds, e2e logins and integration scripts that sign in with a
password keep working. An account that has enrolled a device is always asked for the code, whatever the flag says.
`TWO_FACTOR_ENCRYPTION_KEY` (optional, 64 hex characters) is the AES-256-GCM key for stored secrets; unset, it is derived
from `COOKIE_SECRET`, so rotating `COOKIE_SECRET` without the dedicated key makes every stored secret unreadable. Both
variables are in the three `apps/server/.env.*.example` files, in `x-server-env` of `infrastructure/docker/docker-compose.yml`
(defaults `false` and empty) and in `.env.production.example`. The Vendure Dashboard asks for the code the same way (its
login page is replaced by an extension, so a Dashboard dev server must be restarted to pick it up). Contract, recovery and the
operational reset script: docs/two-factor.md.

## Session lifetime and cap

`SESSION_DURATION` (default `30d`, Vendure's own default is one year) is the server-side session
lifetime; Vendure extends it on activity. A "remember me" cookie still lives one year (hardcoded
in Vendure), but the token it carries stops working once the session expires.
`SESSION_MAX_ACTIVE_CUSTOMER` (default `2`) and `SESSION_MAX_ACTIVE_STAFF` (default `3`) cap active sessions per
customer and per administrator: a sign-in beyond the cap ends the user's oldest session. The local `.env` examples
use `20` because e2e specs share one login; production uses the defaults. `SESSION_DAILY_RESET_ENABLED` (default
`false`; `true` in `.env.production.example`), `SESSION_DAILY_RESET_HOUR` (0-23, default `3`) and
the process time zone (`TZ`; compose passes `TZ` from the deployment env, default `UTC`) turn
on the `session-daily-reset` task, which ends every customer and staff session created before the latest reset hour;
acting and API-key sessions are excluded. A bad flag or hour fails boot; the removed `SESSION_DAILY_RESET_TIME_ZONE` fails boot too (use `TZ`). `SESSION_MAX_ACTIVE_PER_USER` was removed in #335 and now fails boot with a pointer to the two new caps: drop it from every env file on upgrade. `SESSION_KNOWN_DEVICE_RETENTION_DAYS` (default `400`, the device cookie lifetime) bounds how long a sign-in device is remembered. The device cookie is `Secure` when `NODE_ENV=production`. The hourly `session-cleanup` task deletes
expired and ended sessions. Ended sessions are only listed nowhere (`mySessions` shows active ones) and nothing
references the `session` table, so deleting them loses no history. The session cache is in-process (Vendure's
default, no Redis): another server process may accept an ended token until its cache entry expires
(`sessionCacheTTL`, 300 s). The new-device sign-in e-mail needs no variable; policy details: docs/access-control.md
"Session policy". All five variables are in the three `apps/server/.env.*.example` files, in `x-server-env` of
`infrastructure/docker/docker-compose.yml` and in `infrastructure/docker/.env.production.example`.

## CORS and CSRF prevention (#331)

Every client reaches the API through its own origin (nginx and Vite proxy `/shop-api`, `/admin-api`,
`/assets`), so by default the server sends no CORS headers (`apiOptions.cors: false`).
`CORS_ALLOWED_ORIGINS` (comma-separated explicit origins, empty by default, `*` refused) enables
credentialed CORS for exactly those origins; set it only when a browser client calls the server
directly from another origin. `apiOptions.csrfPrevention` is always on: a GraphQL request needs a
non-simple content type (`application/json`) or the `Apollo-Require-Preflight` header, so a
cross-site form POST cannot log a visitor in. Server-side REST callbacks are not Apollo and are
unaffected; a new client that sends `multipart/form-data`, `text/plain` or a GET query must set that header.

## Migration and entity schema drift (#302)

A database built only by migrations must equal the entity-derived schema. `migrations-match-entities.int.test.ts`
(`make test-int`) builds a throwaway database by migrations alone and fails when TypeORM would still generate changes.
Migration `1791544000000` realigned index and FK names (the plain rename migrations of #223 kept hash names of the old
tables), the four string custom-field columns of `order` (`varchar(255)`) and the two `order` unique custom fields (constraints).
Indexes only a migration can express (partial, expression, custom-field indexes) are listed in the test's
`MIGRATION_ONLY_INDEXES`. A new entity index or column needs its migration in the same change, or the test fails.

## ERP REST callbacks are a test tool, not an integration channel

`POST /erp/callback/payment`, `POST /erp/callback/order-status`, `GET /erp/orders/:code/status` and
`GET /erp/kafka-status` exist only to simulate ERP pushes in the local contour and in e2e/seed scripts.

- Nobody real calls them: the real exchange with the ERP is Kafka through the Integration Service
  (orders, settlement documents, balances). Real payments will arrive on a future Kafka stream (#195),
  not here.
- They are off by default (`ERP_CALLBACK_ENABLED`) and need `ERP_CALLBACK_API_KEY` when on; never enable
  them on staging-integration or production.
- The payment callback models a standard payment fact: required `proformaInvoiceUuid`, the payment's own
  `amount` and `currencyCode`, organization, outcome and `erpEventId` (idempotency key). A payment with no
  document reference is NOT supported here; that case (FIFO allocation) belongs to the real stream.
- Do not extend them with new business behaviour or contracts: put that on the Kafka contracts instead.

## REST/dev-surface flags

Policy: every non-GraphQL REST endpoint and dev surface is **closed by default** behind an explicit
enabling flag, and even when enabled requires an API key header (`X-Api-Key`, or
`Authorization: Bearer` for erp-import). A flag on with a missing/short (<16 chars) key still
refuses every call (401) and logs a startup error. Payment-provider webhooks would use provider
signatures instead. Shared guard: `packages/shared/src/api-key.ts`; the controller allow-list test
is `apps/server/src/__tests__/unit/rest-controller-allowlist.test.ts`.
Exception: `GET /document-pdf/<uuid>` (#263) is a portal download, always on, authorized by the caller's own
session and the document's counterparty scope instead of a key (see `docs/access-control.md`, "Scope guards").
In a deployment, `static/document-pdfs` must be a persistent volume shared by every server and worker replica, not the container filesystem.

| Variable | Default | What it opens | Why | Must be true in | Key requirement | Used by | If on in production |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `EMAIL_DEV_MAILBOX_ENABLED` | off (only `true`) | `GET /mailbox` (emails written to disk) | See sent emails locally without a mail transport (#121) | local, e2e/CI | none (dev only) | manager e2e user specs | Anyone can read password-reset tokens and take over accounts |
| `EMAIL_TRANSPORT` | `file` outside production; mandatory in production | `smtp` sends through an authenticated SMTP server; `file` writes mails to disk | Real delivery of password-reset and activation links (#137) | production: `smtp` | `smtp` requires `EMAIL_SMTP_HOST/PORT/SECURE(starttls\|tls)/USER/PASSWORD` and `EMAIL_FROM_ADDRESS` (sender name is `SITE_NAME`); in production also `MANAGER_PUBLIC_URL` and `STOREFRONT_PUBLIC_URL` (reset-link bases for staff and customers) and `SITE_NAME`; a missing one fails boot | server, worker-email | Unset fails boot; `file` means no mail is delivered |
| `STOREFRONT_PUBLIC_URL` | unset | Storefront origin returned with an acting-session ticket (#322) | A manager is sent to this URL to open the customer's storefront | production and any contour where managers act as customers | Absolute `http(s)` origin; unset fails `startActingSession` with a clear error before a ticket is issued (boot is not blocked) | server | Required in production (also reset-link base) |
| `SITE_NAME` | `Shop`; mandatory in production with `EMAIL_TRANSPORT=smtp` | Mail sender display name; storefront and manager page title | Branding per deployment | production: set per deployment | No quotes (`"` `'`), line breaks or `< > & $ ; \`; frontends read it from the container env (nginx `sub_filter`, see `docs/deployment.md`) | server, worker-email, storefront, manager | Unset in production with smtp fails boot |
| `SITE_DEFAULT_LANGUAGE` | `en` | Mail language when the request names none: `en` or `ru`; any other value fails boot | Transactional mails in the deployment's language (#280) | production: set explicitly | Background mails (portal activation, staff provisioning) always use it | server, worker-email | Unset means English |
| `EMAIL_FOOTER_TEXT` | generic per-language line | Footer line of every mail | Per-deployment branding (#280) | optional | No double quote, line break or `< > $ ; { } \`; `'` and `&` are allowed (the template escapes the value); invalid fails boot; reaches mail templates only | server, worker-email | Unset uses the default text |
| `SITE_FAVICON_URL` | built-in icon | Favicon URL or `/assets/...` path | Branding per deployment | optional | `http(s)://` URL or `/path`, no spaces, quotes or `$ ; { } \ < >`; validated on server boot, nginx falls back to the built-in icon | storefront, manager, dashboard | Unset keeps the built-in icon |
| `API_DOCS_ENABLED` | off (only `true`) | `/api-docs`, `/api-docs-json` Swagger | Browse REST DTOs (#28) | local, e2e/CI | none | `swagger-docs.spec.ts` | Discloses the internal REST surface |
| `ERP_CALLBACK_ENABLED` | off (only `true`) | `POST /erp/callback/order-status`, `POST /erp/callback/payment`, `GET /erp/orders/:code/status`, `GET /erp/kafka-status` | Simulated ERP pushes and status reads | local, e2e/CI; never staging-integration/production until a real caller needs it | `ERP_CALLBACK_API_KEY`, min 16 chars | `order-status-flow.spec.ts`, `payments-erp-callback.spec.ts`, `seed-customer-detail.mjs` | Forged order status and payment facts |
| `ERP_CALLBACK_API_KEY` | unset (refuses) | key for the four routes above | Authenticates the caller | wherever the flag is true | min 16 chars; local default `dev-callback-key-change-me-0000` only in local env files and e2e fallbacks | same as above | Weak/default key allows forged callbacks |
| `ERP_IMPORT_ENABLED` | off (only `true`) | `/erp/import/*` legacy direct-REST intake | Synthetic data for local/branch (#68) | local, branch, e2e/CI | `ERP_IMPORT_TOKEN` | `make seed`, `dev-fresh.sh`, `ci-e2e-smoke.sh`, e2e helpers | Arbitrary master-data writes |
| `ERP_IMPORT_TOKEN` | unset (refuses) | Bearer token for `/erp/import/*` | Authenticates the importer | wherever import is enabled | min 16 chars; literal `dev-token` refused when `NODE_ENV=production`; local default `dev-import-token-change-me-0000` | seed scripts, `packages/e2e/helpers/api.ts` | Weak token allows master-data writes |
| `ONLINE_PAYMENT_STUB_ENABLED` | off (only `true`) | `online-stub` card PaymentMethod (simulated card payment at checkout) | Exercise the card flow without acquiring | local, e2e/CI | none; refused (logged, method disabled) when `NODE_ENV=production` | storefront `/payment-stub` | Orders marked paid without real money |
| `DOCUMENT_PDF_DIR` | `apps/server/static/document-pdfs` | Directory where generated document PDFs are written | Give each process (e.g. `make test-access`'s throwaway server) its own PDF store | n/a | n/a | `vendure-config.ts`, access test harness | n/a (a path, not a surface) |
| `SERVER_BIND_ADDRESS` | `127.0.0.1` | Host address the compose `server` port 3000 binds to | Keep the API off public interfaces unless a proxy is intended | set to `0.0.0.0` only deliberately | n/a | `infrastructure/docker/docker-compose.yml` | n/a (compose-only; default is the safe one) |

`infrastructure/docker/docker-compose.yml` sets the first three flags and `ERP_IMPORT_ENABLED`
explicitly to `false` for the production `server`.
