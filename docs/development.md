# Development guide

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+ (`corepack enable`)
- [Docker](https://docs.docker.com/get-docker/) with Compose v2
- GNU Make

## First-time setup

```bash
# 1. Clone and install dependencies
pnpm install

# 2. Log in to GitHub Container Registry (pulls mivend-rabbitmq image)
echo $GITHUB_TOKEN | docker login ghcr.io -u <your-github-username> --password-stdin

# 3. Start dev infrastructure (PostgreSQL × 2, Redis, RabbitMQ, Elasticsearch)
make up

# 4. Copy env files and adjust if needed
cp apps/server/.env.central.example apps/server/.env.central
cp apps/server/.env.branch.example  apps/server/.env.branch
```

`mivend_test` database is created automatically on first `make up`.

## Daily commands

```bash
make up          # start infrastructure
make down        # stop infrastructure
make logs        # follow container logs
make ps          # container status

pnpm dev:central # run server as central hub (hot-reload)
pnpm dev:branch  # run server as branch
```

## Environments / contours

Beyond the `central`/`branch` instance identity above, the central instance also has three
**contours** — local (isolated, synthetic data), staging-integration (real Integration Service
Kafka), and production — each with its own database, Redis DB index, and ports, so they can run
side by side without colliding. Full design, rationale, and setup steps:
**[docs/environments.md](./environments.md)**. Quick reference:

| Contour             | `make` target                  | Env file                                       | DB                                       | Redis DB | API port | Storefront | Manager |
| ------------------- | ------------------------------ | ---------------------------------------------- | ---------------------------------------- | -------- | -------- | ---------- | ------- |
| local               | `make dev`                     | `apps/server/.env.central`                     | `mivend_central`                         | `0`      | `3000`   | `5173`     | `5174`  |
| branch              | `make dev-branch`              | `apps/server/.env.branch`                      | `mivend_branch` (own Postgres container) | `1`      | `3001`   | —          | —       |
| staging-integration | `make dev-staging-integration` | `apps/server/.env.central.staging-integration` | `mivend_central_staging_integration`     | `2`      | `3010`   | `5183`     | `5184`  |

(Branch has no storefront/manager by design — both are central-only, see
`docs/architecture.md`'s "Storefront hosting: Central-only, not per-branch".) External access
from outside this box (nginx + ufw port mapping per contour) is documented in
`docs/environments.md`'s "Reaching a contour from outside this box".

## Building

```bash
make build       # build all packages + server (tsc)
```

Plugins under `packages/` must be built before the server because the server
imports from their `dist/` directories.

## Testing

```bash
make test        # unit tests — no Docker needed
make test-int    # integration tests — starts infrastructure automatically
```

Integration tests use real PostgreSQL, Redis, and RabbitMQ. The first run
may take an extra ~30 s while Docker pulls images.

See [ci-cd.md](./ci-cd.md) for the full CI/CD pipeline description.

## Docker — app image

```bash
make docker-build                  # build server image locally (tag: mivend-server:local)
make docker-push                   # build + push to GHCR with version tag
```

Tags on push: `v{version}` (from `package.json`) + `latest`.

The CI pipeline (`docker-publish-apps.yml`) builds and pushes automatically
on every merge to `main` when `apps/server/**` or `packages/**` change.

## Versioning

Single source of truth: `version` field in the root `package.json`.

```bash
pnpm version:patch   # 0.1.0 → 0.1.1
pnpm version:minor   # 0.1.0 → 0.2.0
pnpm version:major   # 0.1.0 → 1.0.0
```

After bumping — commit and push. CI picks up the new version and tags the
Docker image accordingly.

## Production stack

```bash
# uses infrastructure/docker/docker-compose.yml + ghcr.io/nlightn22/mivend-server
make prod-up
make prod-down
```

Set `IMAGE_TAG=v0.2.0` (or any tag) to pin a specific release:

```bash
IMAGE_TAG=v0.2.0 make prod-up
```
