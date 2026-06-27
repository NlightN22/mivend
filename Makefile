COMPOSE_DEV = docker compose -f infrastructure/docker/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infrastructure/docker/docker-compose.yml
GITHUB_REPOSITORY_OWNER ?= nlightn22
VERSION = $(shell node -p "require('./package.json').version")
GIT_SHA = $(shell git rev-parse --short HEAD)

.PHONY: up down logs ps restart \
        build lint fmt \
        test test-int \
        docker-build docker-push \
        prod-up prod-down \
        dev dev-fresh dev-reset seed \
        storybook storefront storefront-dev

# ── Dev infrastructure ─────────────────────────────────────────────────────────

up:
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d

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
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d
	@docker exec docker-postgres-central-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mivend_central'" | grep -q 1 \
		|| docker exec docker-postgres-central-1 psql -U postgres -c "CREATE DATABASE mivend_central"
	@bash infrastructure/scripts/dev-kill.sh
	pnpm dev:all

# Wipe DB volumes, re-seed via native server, then launch full stack
dev-fresh:
	bash infrastructure/scripts/dev-fresh.sh

# Tear down infra containers AND volumes — next up gets a clean DB
dev-reset:
	$(COMPOSE_DEV) down -v

seed:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding..."
	ERP_IMPORT_TOKEN=$${ERP_IMPORT_TOKEN:-dev-token} node infrastructure/scripts/seed-erp.mjs

# ── UI development ─────────────────────────────────────────────────────────────

storybook:
	pnpm --filter @mivend/ui-kit build-storybook
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) --profile ui up -d storybook
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) restart storybook

storefront:
	pnpm --filter @mivend/storefront dev

storefront-dev:
	pnpm --filter @mivend/storefront dev

# ── Code ───────────────────────────────────────────────────────────────────────

build:
	pnpm --filter "./packages/plugins/**" build
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
