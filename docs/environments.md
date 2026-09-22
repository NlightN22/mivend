# Environments

There are **two independent axes** here — this document exists because conflating them is exactly
what caused the incident in issue #68 (a plain `make dev` connected `KafkaConsumerService` to
Integration Service's real staging Kafka broker, `is.komponent-m.ru`, and wrote real inbound
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

## Axis 2: contour — where does the data come from

Three contours, always for a **central** instance (branches never touch Integration Service):

| Contour                                  | Env file                                       | Makefile target                | Database                                 | Real Integration Service Kafka?                                                                            |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------ | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **local** (isolated dev)                 | `apps/server/.env.central`                     | `make dev`                     | `mivend_central`                         | Never — `INTEGRATION_KAFKA_ENABLED=false`. Only synthetic data via `make seed-all` (`erp-import`).         |
| **staging-integration** (external Kafka) | `apps/server/.env.central.staging-integration` | `make dev-staging-integration` | `mivend_central_staging_integration`     | Yes, deliberately — validates the real Kafka contract against Integration Service's actual staging broker. |
| **production**                           | `infrastructure/docker/.env.production`        | `make prod-up`                 | `postgres` service, `docker-compose.yml` | Yes, real prod Integration Service.                                                                        |

Production Postgres is **not** an externally-managed database — it's a container this same repo
provisions (`infrastructure/docker/docker-compose.yml`'s `postgres` service, built from
`infrastructure/docker/postgres/` — the same image the local/staging-integration contours above
use, see `.env.production.example` in that directory).

### Database locale (issue #120 follow-up)

Postgres collation is fixed at `CREATE DATABASE` time and cannot be changed for an existing data
directory — the wrong locale silently sorts Cyrillic text by raw code point instead of alphabet
(this is what happened before #120: `en_US.utf8`, the glibc default, produced a nonsensical
company-name sort order), with no error until someone notices broken UI ordering.

- All three contours' Postgres containers build from `infrastructure/docker/postgres/`, whose
  `entrypoint.sh` **requires** `DB_ICU_LOCALE` (e.g. `ru-RU`) to be set and refuses to start
  without it — see that file's own comment.
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
- Local/CI databases (`make dev`, CI's plain `postgres:16` service) are **not** required to have
  an ICU locale — `db-locale-check.ts` only enforces this when `NODE_ENV=production`, since a
  synthetic/throwaway dev or CI database sorting Cyrillic wrong is a known limitation, not an
  incident.
- Changing an **existing** non-empty database's locale requires a dump/recreate/restore (locale
  is fixed at creation time) plus a full `REINDEX` afterwards — not a rolling/in-place change. For
  local dev this just means `make dev-reset` (synthetic seed data, cheap to regenerate); for
  staging-integration/production with real data this needs a maintenance window.

**Storefront search backend per contour (issue #69)**: `local` uses `internal` (`ElasticsearchPlugin`
against local Elasticsearch, `SEARCH_BACKEND=internal` or unset); `staging-integration` and
`production` use `external` (search-service's `POST /resolve-query`, `SEARCH_BACKEND=external` +
required `SEARCH_SERVICE_URL`). `SearchBackend` (`SEARCH_BACKEND_DEFAULT` in
`packages/plugins/search/src/types.ts`) is decided once at bootstrap in `search.plugin.ts` — a
per-contour deployment choice, never an admin-configurable runtime toggle, and the two backends
are never registered together.

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

Postgres has its own container/port per instance type (`mivend_central`/`mivend_central_staging_integration`
both live in `docker-postgres-central-1`, distinguished by `DB_NAME`; the branch instance's own
`docker-postgres-branch-1` is separate again). Since issue #128 (job queue migrated off
BullMQ/Redis to Vendure's DB-backed `DefaultJobQueuePlugin`), job records live in each contour's
own Postgres database and are isolated by `DB_NAME` the same way everything else is — the
`REDIS_DB` index scheme this section used to describe for per-contour BullMQ queue isolation no
longer applies. Redis itself (the `redis` container/env vars) has been removed from this project
entirely as a follow-up to #128 — nothing in the codebase depends on it anymore.

## Testing must stay within the local contour

**`make test`/`make test-int`/`make e2e` run exclusively against the local contour's seeded,
synthetic data.** Never against staging-integration's real Integration Service data — see
AGENTS.md's Testing requirements ("Rule: automated tests run only against the local contour's
seeded/synthetic data") for the full rule. In short: local is seed-only (no external source,
`INTEGRATION_KAFKA_ENABLED=false`); staging-integration is real-source-only (no manual seeding,
ever) — each contour has exactly one of "seeded" or "real external data," never both, and
automated tests only ever run against the seeded one. If a test needs data the local seed set
doesn't have yet, extend the seed (`erp-import` record type, `seed-erp.mjs`) or the test's own
fixtures — don't borrow real data from staging-integration to make a test pass.

## Setting up the staging-integration contour

1. Copy `apps/server/.env.central.staging-integration.example` to
   `apps/server/.env.central.staging-integration` (gitignored — never commit real credentials).
2. Fill in `INTEGRATION_KAFKA_SASL_USERNAME`/`INTEGRATION_KAFKA_SASL_PASSWORD` with the real
   staging credentials.
3. Run `make dev-staging-integration`. It refuses to run if the env file is missing, kills any
   stale staging-integration processes from a previous run first (safe to re-run — see
   `infrastructure/scripts/dev-kill-staging-integration.sh`), starts its own database
   (`mivend_central_staging_integration`), and never touches `make dev`'s local contour or
   `make dev-branch`'s processes: `dev-kill.sh`/`dev-kill-branch.sh`/`dev-kill-staging-integration.sh`
   each identify only their own contour's processes (by the `.env.*` file on the process's own
   command line) before killing anything.

It does not run its own `tsc -b --watch` plugin compiler — `dist/` is shared across contours, and
a second watcher alongside `make dev`'s would be the exact duplicate-process/stale-dist hazard
the `backend-plugin-rules` skill's "Monorepo `dist/` and dev watching" section warns about. It
runs a one-shot `pnpm build:plugins` instead, which is sufficient whether or not `make dev` is
already watching plugins.

## Reaching a contour from outside this box

Every contour's server/worker/storefront/manager bind to `0.0.0.0` (or `localhost`, for the
Postgres/RabbitMQ it shares — see "Database isolation" above), but the only thing actually
reachable from outside this box is **nginx** (`/etc/nginx/sites-enabled/mivend.conf`, TLS on
`devof.komponent-m.ru`) plus `ufw` allowing exactly the ports nginx listens on — see this box's
`publish-service` skill (`/opt/search-platform/.claude/skills/publish-service/SKILL.md`) for the
port-per-service-behind-nginx convention this follows. Internal ports are never reachable
directly from outside (no `ufw allow` for them).

| Service          | Contour             | Internal (`localhost`) | External (`https://devof.komponent-m.ru:<port>`) |
| ---------------- | ------------------- | ---------------------- | ------------------------------------------------ |
| API (Admin+Shop) | local               | `3000`                 | `8003`                                           |
| Storefront       | local               | `5173`                 | `8004`                                           |
| Manager          | local               | `5174`                 | `8005`                                           |
| Dashboard        | local               | `5175`                 | `8006`                                           |
| API (Admin+Shop) | staging-integration | `3010`                 | `8013`                                           |
| Storefront       | staging-integration | `5183`                 | `8014`                                           |
| Manager          | staging-integration | `5184`                 | `8015`                                           |
| Dashboard        | staging-integration | `5185`                 | `8016`                                           |
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
all (the `apiOptions.cors` config this doc used to mention has been removed).

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

`make check-event-contracts` (see `docs/ai/1c-integration-service-decision.md`'s "Audit
2026-09-04" contract-drift finding) should ideally run against whatever
`@nlightn22/event-contracts` version staging/prod actually use, not just whatever happens to be
locally pinned — not yet implemented, tracked under issue #68's checklist.

`packages/storefront`/`packages/manager`/`packages/dashboard` all now have a real production
build/serve pipeline (`Dockerfile` + nginx, issue #115; see "Production preview" above) — but
every contour, including staging-integration, still serves them via the raw Vite dev server
today; nothing has actually deployed the new images to a real contour yet, only run manually via
`make preview-*` on this box. See `docs/frontend-load-benchmarks.md` for real baseline numbers
comparing the prod container against the dev server.
