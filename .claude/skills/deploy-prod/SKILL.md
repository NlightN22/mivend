---
name: deploy-prod
description: Use when the owner asks to update the production deployment. Picks the minimal restart set (frontends only, backend, full) from what changed since the last release, with backup, migrate, rollout, verification and rollback steps.
---

# Production update

Applies only when the owner says in chat, for this release, to deploy. Never deploy on your own initiative,
and never touch production while preparing. Hosts, domains, paths and credentials are not in this repo:
`<prod-host>` and `<deploy-dir>` are given by the owner. Read `docs/environments.md` ("Migrations", contours) first.

## 1. Preconditions

- Release gate (AGENTS.md): every commit since the last release has been signed off by the audit session, and
  the owner confirmed in chat for this release. Unaudited commits are audited first or left out (push by sha,
  never a plain `git push` of a shared tree carrying other sessions' local commits).
- Last release: no git tags exist, so find the last version-bump commit (`git log --oneline -- package.json`)
  and use it as `<last>` below.
- Read the currently deployed tag on the host before choosing a version. A tag collision once overwrote a
  registry tag: `ssh <prod-host> "grep '^IMAGE_TAG=' <deploy-dir>/infrastructure/docker/.env.production"`, and
  check the registry does not already hold the new `v<version>` for any of the four images.
- The version bump is one commit that changes only `package.json` (root version, read by `VERSION` in the Makefile).
- Run `pnpm build:plugins` before pushing; `make lint` and `make test` must be green.
- Images are built and pushed by `make docker-push` or the manual `docker-publish-apps.yml` workflow, tagged
  `v<version>` and `latest` for `mivend-server`, `mivend-storefront`, `mivend-manager`, `mivend-dashboard`.
  Deploy by explicit `v<version>`, never `latest`.

## 2. Classify the change

    git diff <last>..HEAD --stat

| Class | Paths |
| --- | --- |
| backend | `apps/server`, `packages/plugins/*`, `packages/shared`, migrations, GraphQL schema or custom fields |
| manager-only | `packages/manager`, `packages/ui-kit` when used only there |
| storefront-only | `packages/storefront`, `packages/ui-kit` when used only there |
| dashboard-only | `packages/dashboard` |
| no deploy | docs, tests, `packages/e2e`, skills, CI config |

`packages/ui-kit` used by both portals means both frontends. A `packages/shared` or plugin change affects the
server image; `migrate`, `server`, `worker` and `worker-email` all use that one image.

## 3. Decision table

| Changed | Pull and recreate | Order |
| --- | --- | --- |
| manager only | `manager` | backup optional |
| storefront only | `storefront` | backup optional |
| dashboard only | `dashboard` | backup optional |
| several frontends, no backend | those frontends | one after another, each verified |
| backend, no migration, additive schema | `server`, `worker`, `worker-email`, then changed frontends | server first |
| backend with migration | backup, `migrate`, `server`, `worker`, `worker-email`, then frontends | strict order |
| removed or renamed GraphQL field or argument, changed type or enum | whole stack in one release | see rules below |

Rules:

- Only additive schema changes (new fields, new optional arguments, new types) let frontends be updated
  independently of the server, in either order: new server with old frontends, or new frontend after the new server.
  Never deploy a frontend that queries fields the running server does not have yet.
- A removed, renamed or retyped field, or a changed Shop API or Admin API contract, forces a coordinated
  release: server and every frontend that used it move to the same version in one window, server first, frontends
  right after. Old frontends fail against the new server until they are recreated, so announce the window.
- Stop workers (`docker compose stop worker worker-email`) before a heavy migration (large table rewrite,
  backfill, index builds on big tables, anything holding long locks), and let `migrate` finish before starting
  them. Workers write the same tables (jobs, Kafka-driven imports), so running them mid-migration risks lock waits
  and half-applied data. Light additive migrations do not need this.
- Migrations are forward-only; production runs `synchronize: false`. A migration that cannot be undone by
  redeploying the old image needs the database backup as its rollback.

## 4. Image tags: shared default, per-frontend pins

`IMAGE_TAG` is the default for every image. `server`, `worker`, `worker-email` and `migrate` always use it.
The frontends take their own optional variable, `STOREFRONT_IMAGE_TAG`, `MANAGER_IMAGE_TAG`,
`DASHBOARD_IMAGE_TAG`; empty or unset means "follow `IMAGE_TAG`".

- Frontend-only hotfix: set only that frontend's variable to the new version, then `pull` and `up -d --wait` that
  service. Nothing else is recreated.
- Backend release: raise `IMAGE_TAG`. Any frontend with a pin stays on its pinned version, so check the pins first.
- Alignment rule: a pin is temporary. The next planned release clears every pin so all services return to one
  version. Before every deploy, list the pins (`grep -E '^(STOREFRONT|MANAGER|DASHBOARD)_IMAGE_TAG=' .env.production`)
  and tell the owner which services will not follow `IMAGE_TAG`.

Two server processes run from one image on one database: `server` (storefront traffic, ERP callbacks, the host
port) and `server-admin` (the manager portal and the dashboard, via their `API_TARGET`). Both serve both APIs; the
frontends' nginx decides which one a user reaches. Startup is serialized by a database lock (`withServerBootstrapLock`),
so the second one waits for the first to finish booting. Roll them one after the other, not together, to keep one of
them answering during a server release; a migration that breaks the old code still needs both stopped.

## 5. Procedure

All commands run on `<prod-host>` in `<deploy-dir>`, with
`COMPOSE="docker compose -f infrastructure/docker/docker-compose.yml --env-file infrastructure/docker/.env.production"`.

Common first steps:

    cp infrastructure/docker/.env.production infrastructure/docker/.env.production.bak-<old-tag>
    docker compose ... ps                 # everything healthy before starting; record it
    # edit IMAGE_TAG=v<version> in .env.production (or a frontend's own pin for a partial release)

### Frontend only (manager, storefront, dashboard)

    $COMPOSE pull <service>
    $COMPOSE up -d --wait <service>       # --wait blocks until the healthcheck passes
    $COMPOSE ps <service>

Smoke: the portal loads over its public URL, sign in, open one list page and the changed page, and check the
browser console for GraphQL validation errors (a sign of an incompatible schema).

### Backend, no migration

    $COMPOSE pull server server-admin worker worker-email
    $COMPOSE up -d --wait server server-admin
    $COMPOSE up -d --wait worker worker-email

`migrate` still runs as a dependency and must exit 0 (no pending migrations is a no-op).

### Backend with migration

    make prod-backup                      # pg_dump to ./backups; copy it off the host; prod-restore-check periodically
    $COMPOSE stop worker worker-email     # heavy migrations only
    $COMPOSE pull migrate server server-admin worker worker-email
    $COMPOSE run --rm migrate             # must exit 0; non-zero: stop, do not start the new server
    echo $?
    $COMPOSE up -d --wait server server-admin
    $COMPOSE up -d --wait worker worker-email

Then pull and recreate changed frontends as above. If `migrate` fails, the old server keeps running on the old
image; fix forward or restore from the backup, and report to the owner before retrying.

### Rollback

- Frontend or backend without migration: restore the previous tag from the `.env.production` backup, then
  `$COMPOSE pull <services>` and `$COMPOSE up -d --wait <services>` for the services that moved.
- With a migration: redeploying the old image is safe only if the migration was additive and the old code
  tolerates the new schema. Otherwise stop server and workers, restore the dump, then bring the old tag up.
  Never run `migration revert` on production without the owner's explicit agreement.

## 6. Post-deploy verification and report

- `$COMPOSE ps`: every service `healthy` or `running`, `migrate` exited 0, no restart loops (`RestartCount`).
- `$COMPOSE logs --since 10m server server-admin worker worker-email`: no repeating errors; the worker healthcheck depends on
  the Kafka consumer connecting when the integration is enabled.
- Server `/health` OK; shop and admin APIs answer; changed UI pages render in both modes the release touched.
- If the release touched order or ERP exchange, confirm a fresh event is processed (read-only checks only).
- Report to the owner in chat: old and new tag, classification and services moved, migration result, checks
  run and their outcome, anything deliberately not verified, and where the `.env` and database backups are.
- After a successful deploy, update `docs/ai/PROJECT_CONTEXT.md` (deployed tag) through the project-context skill.
