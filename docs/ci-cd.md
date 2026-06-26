# CI/CD

## Test flow

Tests are split into three categories with different infrastructure requirements and run times.

### Unit tests

- **What:** service methods, utility functions, mappers — all external dependencies mocked
- **Infrastructure:** none (runs fully offline)
- **Location:** `src/__tests__/unit/` inside each package
- **Command:** `pnpm test`
- **Excluded:** `**/__tests__/integration/**` (see `vitest.config.ts`)

### Integration tests

- **What:** full plugin cycles hitting a real database — outbox writes, consumer idempotency, DB constraints
- **Infrastructure:** real PostgreSQL + Redis (no mocks)
- **Location:** `src/__tests__/integration/` inside each package
- **Command:** `pnpm --filter "packages/**" test:integration`
- **RabbitMQ:** mocked in integration tests (real broker is not required for DB-level assertions)

### End-to-end tests

Not implemented yet. Will cover full Hub → Branch sync cycles with real RabbitMQ via Testcontainers.

---

## CI pipelines

### `ci.yml` — runs on every push to any branch

| Step                    | Command             |
| ----------------------- | ------------------- |
| Lint                    | `pnpm lint`         |
| Format check            | `pnpm format:check` |
| Type check (server)     | `tsc --noEmit`      |
| Type check (storefront) | `vue-tsc --noEmit`  |
| Unit tests              | `pnpm test`         |

Blocks merge if red. Must stay fast (target: under 2 minutes).

### `integration.yml` — runs on every PR to `main`

Services spun up by GitHub Actions:

| Service    | Image         | Port |
| ---------- | ------------- | ---- |
| PostgreSQL | `postgres:16` | 5432 |
| Redis      | `redis:7`     | 6379 |

Steps: install → build plugins → run integration tests.

Blocks merge if red. RabbitMQ is not a service here — integration tests mock the broker.

### `docker-publish.yml` — runs on push to `main` when `infrastructure/docker/rabbitmq/**` changes

Builds and pushes `ghcr.io/NlightN22/mivend-rabbitmq` to GitHub Container Registry.
Tags: `latest` (main branch) + `sha-<commit>`.
Triggered manually via `workflow_dispatch` as well.

---

## Local development flow

```
# Before committing — runs automatically via husky pre-commit hook:
pnpm lint --fix
pnpm format:write

# Run unit tests locally at any time:
pnpm test

# Run integration tests locally (requires running postgres + redis):
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d postgres-central redis
pnpm --filter "packages/**" test:integration
```

---

## Rules

1. **Unit tests never touch the database.** Mock all repositories and external services.
2. **Integration tests never mock the database.** Hit a real PostgreSQL instance.
3. **Integration tests may mock RabbitMQ.** A real broker is only required for end-to-end tests.
4. **`pnpm test` must pass locally before pushing.** The pre-commit hook runs lint, but not tests — run tests manually.
5. **A PR cannot be merged if CI or integration tests are red.**
6. **Docker images are published automatically** — never push to ghcr.io manually.
