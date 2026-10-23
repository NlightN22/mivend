# Production deployment

How the stack is laid out and run in production. Contour model and migrations:
`docs/environments.md`. Measured figures: `docs/deployment-sizing.md`. The request text for
administrators: `docs/ops-request.md`.

## Process layout

One compose file (`infrastructure/docker/docker-compose.yml`) deploys either role; the role is the
env file (`INSTANCE_TYPE`/`INSTANCE_ID`), never a different file.

| Service         | Required | Notes                                                                           |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `postgres`      | yes      | Stock `postgres:16-alpine`; ICU locale set at first init via `POSTGRES_INITDB_ARGS`. |
| `rabbitmq`      | yes      | Stock image; hub/branch sync transport, the app declares its own queues.         |
| `garage`        | yes      | S3 storage for product photos; bucket and key created by `make prod-init-storage`. |
| `migrate`       | yes      | One-shot, runs before the rest; never at app boot.                              |
| `server`        | yes      | API, scheduler is NOT here (worker-only).                                       |
| `worker`        | yes      | Job queue and scheduled tasks (Kafka consumer/outbox on central).               |
| `worker-email`  | yes      | Dedicated email queue, isolated from `worker` via `activeQueues`.               |
| `storefront`    | yes      | Customer portal (nginx, static bundle, proxies `/shop-api`).                    |
| `manager`       | yes      | Manager portal (nginx).                                                         |
| `dashboard`     | optional | Vendure Dashboard for staff; skip with `up -d <services>` if not needed.        |
| `elasticsearch` | optional | Only for `SEARCH_BACKEND=internal` (`COMPOSE_PROFILES=internal-search`).               |

Central vs branch: same images and file. Central additionally sets the `INTEGRATION_*` variables
(the ERP exchange runs only there, `INTEGRATION_KAFKA_ENABLED=true`); a branch leaves them unset
and talks only to central through RabbitMQ sync. Run one compose project per instance.

## Configuration

Everything is in `infrastructure/docker/.env.production` (copy `.env.production.example`, which
lists every variable as required or optional). `make prod-up` passes it via `--env-file`.
Nothing is configured inside a container by hand.

- **Required** variables use `${NAME:?...}`: compose refuses to start without them. The server
  additionally refuses a `COOKIE_SECRET` starting with `change-me`, the dev-token importer, the
  card stub and every REST/dev surface in production.
- **Secrets** are passed only as environment from that git-ignored file (or the deploy
  pipeline's secret store); no image contains one. The app images are built with the registry
  token as a BuildKit secret (`--secret id=npmrc`), which never reaches a layer.
- `INSTANCE_NUMBER_CODE` (exactly 3 digits, unique per instance) is required: the server refuses to boot without it.
- `SEARCH_BACKEND` is required (no default): `internal` needs `COMPOSE_PROFILES=internal-search`, otherwise the workers log a failed Elasticsearch bootstrap; `external` needs `SEARCH_SERVICE_URL` and `SEARCH_SERVICE_API_KEY`.
- **Optional** variables have the default shown in the example file.
- Dead variables removed from the example: none were read by code; missing ones added
  (`INSTANCE_ID`, `RABBITMQ_URL`, `S3_*`, `GARAGE_RPC_SECRET`, search, `INTEGRATION_*`).

## Operations

- **Frontends** re-resolve the `server` address every 10 s (nginx `resolver`), so recreating `server` needs no frontend restart.
- **Health**: `server` is checked on `/health`; postgres, rabbitmq, garage, elasticsearch have
  native checks; others depend on them (`service_healthy`). Every service has
  `restart: unless-stopped`.
- **Limits**: memory limits for server, workers and postgres are variables (`*_MEM_LIMIT`).
- **Logs**: `json-file`, 10 MB x 5 files per service.
- **First deploy**: `make prod-up` (starts postgres/rabbitmq/garage, runs migrations, starts the
  rest), then once `make prod-init-storage`.
- **Upgrade**: set `IMAGE_TAG`, pull, `make prod-up`. It runs `migrate` (plain, forward-only) before
  the new server starts; if it fails the command stops and the old containers keep running. Never
  use a bare `up -d` for an upgrade: nothing in compose orders it after `migrate`.
- **Backups** (volumes `postgres-data`, `garage-data`, `document-pdfs`, `rabbitmq-data`):
    - postgres: `pg_dump -Fc` nightly via `docker compose exec -T postgres pg_dump -U $POSTGRES_USER -Fc $POSTGRES_DB`, copied off the host;
    - garage and `document-pdfs`: stop-free file copy of the volume (`docker run --rm -v <vol>:/v -v $PWD:/b alpine tar czf /b/<vol>.tgz -C /v .`);
    - rabbitmq holds only in-flight sync messages; back it up only if a branch is offline.
    - Restore is tested by loading the dump into a scratch postgres before it is trusted.
