# Environments

There are **two independent axes** here — this document exists because conflating them is exactly
what caused the incident in issue #68 (a plain `make dev` connected `KafkaConsumerService` to
Integration Service's real staging Kafka broker, `is.komponent-m.ru`, and wrote real inbound
events into the same Postgres that `make seed-all`'s synthetic `erp-import` data lives in).

## Axis 1: `INSTANCE_TYPE` — identity (central hub vs. branch)

Pre-existing, unrelated to issue #68. `INSTANCE_TYPE=central|branch` answers "who am I in the
hub↔branch topology" (see `docs/sync.md`). A branch instance syncs to/from the central hub over
RabbitMQ; the central hub is also the only instance type allowed to talk to the ERP / Integration
Service at all (AGENTS.md sync rule #6). This axis does **not** say anything about which data
source a given run is actually pointed at — that's axis 2.

Testing the hub↔branch RabbitMQ sync itself (`plugin-sync`) is a separate, not-yet-implemented
concern from what this document covers — it could in principle run against a local Kafka/RabbitMQ
within the local-dev contour below, but that is out of scope for issue #68 and untested so far.

## Axis 2: contour — where does the data come from

Three contours, always for a **central** instance (branches never touch Integration Service):

| Contour                                  | Env file                                       | Makefile target                | Database                             | Real Integration Service Kafka?                                                                            |
| ---------------------------------------- | ---------------------------------------------- | ------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **local** (isolated dev)                 | `apps/server/.env.central`                     | `make dev`                     | `mivend_central`                     | Never — `INTEGRATION_KAFKA_ENABLED=false`. Only synthetic data via `make seed-all` (`erp-import`).         |
| **staging-integration** (external Kafka) | `apps/server/.env.central.staging-integration` | `make dev-staging-integration` | `mivend_central_staging_integration` | Yes, deliberately — validates the real Kafka contract against Integration Service's actual staging broker. |
| **production**                           | real prod env (deploy pipeline)                | (deploy pipeline)              | prod DB                              | Yes, real prod Integration Service.                                                                        |

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
same `DB_NAME`/`REDIS_DB` as `.env.central` — doing so would let real Integration Service data
intermix with `make seed-all`'s synthetic data, which is the exact bug this document exists to
prevent.

Postgres has its own container/port per instance type (`mivend_central`/`mivend_central_staging_integration`
both live in `docker-postgres-central-1`, distinguished by `DB_NAME`; the branch instance's own
`docker-postgres-branch-1` is separate again), but **Redis is one shared container on port 6380**
across every contour of the central instance (see `infrastructure/docker/docker-compose.dev.yml`'s
`redis` service) — isolation there is by `REDIS_DB` (logical DB index) alone, not by container.
Current assignment, and this must stay unique per contour/instance sharing that Redis: local
(`.env.central`) = `0`, branch (`.env.branch`) = `1`, staging-integration
(`.env.central.staging-integration`) = `2`. Before adding a fourth contour/instance onto this same
Redis, pick the next unused index — reusing one silently shares BullMQ queues/keys between
contours.

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
AGENTS.md's "Monorepo dist/ and dev watching" warns about. It runs a one-shot `pnpm build:plugins`
instead, which is sufficient whether or not `make dev` is already watching plugins.

## Reaching a contour from outside this box

Every contour's server/worker/storefront/manager bind to `0.0.0.0` (or `localhost`, for the
Postgres/Redis/RabbitMQ it shares — see "Database isolation" above), but the only thing actually
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
| API (Admin+Shop) | staging-integration | `3010`                 | `8013`                                           |
| Storefront       | staging-integration | `5183`                 | `8014`                                           |
| Manager          | staging-integration | `5184`                 | `8015`                                           |

**No separate Admin UI port.** `AdminUiPlugin.init({ port: ADMIN_UI_PORT, ... })`'s `port` option
looks like it should mean "the Admin UI listens here" — it doesn't, in this setup. Verified
directly: nothing ever listens on `ADMIN_UI_PORT` (`ss -tlnp` shows no such socket), and `/admin`
responds with the real UI on the main API port instead. So the Admin UI for any contour is just
`<that contour's external API port>/admin` — e.g. `https://devof.komponent-m.ru:8003/admin` for
local, `:8013/admin` once staging-integration is running. Don't add a dedicated nginx block for
it; a first attempt at this table did, pointing at `ADMIN_UI_PORT`, and it 502'd because nothing
was listening there.

Step of 10 between contours is deliberate — the next contour after staging-integration (or a
branch instance that ever needs its own external access, which it doesn't today per
`docs/architecture.md`'s "Storefront hosting: Central-only, not per-branch") takes the next free
decade (`8023`-`8025`, ...), so the mapping stays predictable without consulting this table for
every new one.

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
