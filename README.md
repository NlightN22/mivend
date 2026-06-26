# mivend

B2B auto parts distribution platform built on [Vendure](https://www.vendure.io/) 3.x.

Replaces order management and inventory workflows of a legacy ERP system.
Designed for hub-spoke deployments where branch locations operate autonomously
and sync with a central hub via RabbitMQ.

## Stack

- **Vendure 3.x** — e-commerce framework (NestJS + TypeORM + GraphQL)
- **PostgreSQL** — per-instance database
- **RabbitMQ** — async sync between hub and branches
- **Elasticsearch** — OEM part number search and cross-reference
- **Redis / BullMQ** — background job processing
- **Vue 3** — storefront (planned)

## Repository structure

```
apps/
  server/          Vendure instance (hub or branch, controlled by INSTANCE_TYPE env var)
packages/
  shared/          Shared TypeScript types and sync contracts
  plugins/
    customer-pricing/   Price type assignment per customer
docs/
  architecture.md  Platform design and domain decisions
  sync.md          Hub-branch sync architecture and non-negotiable principles
AGENTS.md          Development rules for contributors and AI agents
```

## Getting started

```bash
# Install dependencies
pnpm install

# Start infrastructure
docker compose -f infrastructure/docker/docker-compose.dev.yml up -d

# Run as central hub
pnpm dev:central

# Run as branch
pnpm dev:branch
```

Copy `apps/server/.env.central.example` or `apps/server/.env.branch.example` to the
corresponding `.env.*` file and adjust values before starting.

## License

GPL-3.0-or-later — see [LICENSE](./LICENSE).
