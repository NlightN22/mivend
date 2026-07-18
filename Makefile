COMPOSE_DEV = docker compose -f infrastructure/docker/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infrastructure/docker/docker-compose.yml
GITHUB_REPOSITORY_OWNER ?= nlightn22
VERSION = $(shell node -p "require('./package.json').version")
GIT_SHA = $(shell git rev-parse --short HEAD)

.PHONY: up down logs ps restart \
        build lint fmt \
        test test-int test-e2e \
        e2e e2e-ui e2e-report \
        docker-build docker-push \
        prod-up prod-down \
        dev dev-fresh dev-reset dev-branch seed seed-access-roles seed-approvals seed-payment-refunds seed-all \
        verify-branch-scope \
        storybook storybook-ui-kit storybook-manager storybook-storefront storybook-down \
        storefront storefront-dev

# ── Dev infrastructure ─────────────────────────────────────────────────────────

up:
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --build

down:
	$(COMPOSE_DEV) down

logs:
	$(COMPOSE_DEV) logs -f

ps:
	$(COMPOSE_DEV) ps

restart:
	$(COMPOSE_DEV) restart

# ── Full dev stack (infra in Docker, server+storefront native) ─────────────────

dev:
	@bash infrastructure/scripts/dev-kill.sh
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --wait
	@docker exec docker-postgres-central-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mivend_central'" | grep -q 1 \
		|| docker exec docker-postgres-central-1 psql -U postgres -c "CREATE DATABASE mivend_central"
	pnpm dev:all

# Wipe DB volumes, re-seed via native server, then launch full stack
dev-fresh:
	bash infrastructure/scripts/dev-fresh.sh

# Tear down infra containers AND volumes — next up gets a clean DB
dev-reset:
	$(COMPOSE_DEV) down -v

# Minimal branch-instance test stack: server + worker only (no separate storefront/manager dev
# servers — see docs/architecture.md's branch-identity/scope design). Safe to run alongside an
# already-running `make dev` central stack: only kills branch-tagged processes (see
# dev-kill-branch.sh), reuses the shared postgres-branch/redis/rabbitmq/elasticsearch containers,
# and is isolated from central's BullMQ queues via REDIS_DB (see apps/server/.env.branch).
dev-branch:
	@bash infrastructure/scripts/dev-kill-branch.sh
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --wait postgres-branch redis rabbitmq elasticsearch
	@docker exec docker-postgres-branch-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mivend_branch'" | grep -q 1 \
		|| docker exec docker-postgres-branch-1 psql -U postgres -c "CREATE DATABASE mivend_branch"
	pnpm build:plugins
	pnpm dev:branch-all

seed:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding..."
	ERP_IMPORT_TOKEN=$${ERP_IMPORT_TOKEN:-dev-token} node infrastructure/scripts/seed-erp.mjs

seed-access-roles:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding access-control roles..."
	node infrastructure/scripts/seed-access-roles.mjs

# Requires seed-access-roles + seed to have already run (roles, demo administrators,
# counterparty cnt-001 must exist).
seed-approvals:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding approval workflow requests..."
	node infrastructure/scripts/seed-approvals.mjs

# Requires captured online-acquiring payments to already exist (e.g. from checkout flows or
# e2e runs) — logs a notice and exits cleanly if none are found yet, does not fail seed-all.
seed-payment-refunds:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding payment refunds/disputes..."
	node infrastructure/scripts/seed-payment-refunds.mjs

# One command for the full local seeding order (roles → ERP data → approval requests — this
# exact order matters, see seed-approvals' own comment above). This is what you want by default;
# the three targets above stay separate only because occasionally you need to re-run just one
# (e.g. re-seeding ERP data without wiping roles/administrators).
seed-all: seed-access-roles seed seed-approvals seed-payment-refunds

# E2E verification of branch-scope access control against an already-running, already-seeded
# central instance (make dev + make seed-all first). Safe to run repeatedly — creates its own
# disposable test data and cleans it up.
verify-branch-scope:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	node infrastructure/scripts/verify-branch-scope.mjs

# ── UI development ─────────────────────────────────────────────────────────────

storybook:
	pnpm --filter @mivend/ui-kit build-storybook
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) --profile ui up -d storybook
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) restart storybook

# Idempotent dev Storybook servers: each target kills its own previous instance first, so
# re-running never stacks processes or hops ports. Bound to 0.0.0.0 for VS Code port
# forwarding / external access. One fixed port per portal: ui-kit 6006, manager 6016,
# storefront 6018 (HMR websockets use port+1).
storybook-ui-kit:
	-pkill -f "storybook dev -p 6006" 2>/dev/null; sleep 1
	pnpm --filter @mivend/ui-kit storybook:host

storybook-manager:
	-pkill -f "storybook dev -p 6016" 2>/dev/null; sleep 1
	pnpm --filter @mivend/manager storybook:host

storybook-storefront:
	-pkill -f "storybook dev -p 6018" 2>/dev/null; sleep 1
	pnpm --filter @mivend/storefront storybook:host

storybook-down:
	-pkill -f "storybook dev" 2>/dev/null

storefront:
	pnpm --filter @mivend/storefront dev

storefront-dev:
	pnpm --filter @mivend/storefront dev

# ── Code ───────────────────────────────────────────────────────────────────────

build:
	pnpm build:plugins
	pnpm --filter "server" build

lint:
	pnpm lint

fmt:
	pnpm format

# ── Tests ──────────────────────────────────────────────────────────────────────

test:
	pnpm test

test-int: up
	pnpm --filter "{packages/**}" --no-bail test:integration

# ── Docker app images ──────────────────────────────────────────────────────────

docker-build:
	docker build -f apps/server/Dockerfile -t mivend-server:local .

docker-push:
	docker build -f apps/server/Dockerfile \
		-t ghcr.io/nlightn22/mivend-server:v$(VERSION) \
		-t ghcr.io/nlightn22/mivend-server:latest \
		.
	docker push ghcr.io/nlightn22/mivend-server:v$(VERSION)
	docker push ghcr.io/nlightn22/mivend-server:latest

# ── Production ─────────────────────────────────────────────────────────────────

prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

# ── E2E tests ──────────────────────────────────────────────────────────────────

e2e test-e2e:
	pnpm --filter @mivend/e2e test

e2e-ui:
	pnpm --filter @mivend/e2e test:ui

e2e-report:
	pnpm --filter @mivend/e2e report
