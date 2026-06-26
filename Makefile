COMPOSE_DEV = docker compose -f infrastructure/docker/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infrastructure/docker/docker-compose.yml
GITHUB_REPOSITORY_OWNER ?= nlightn22
VERSION = $(shell node -p "require('./package.json').version")
GIT_SHA = $(shell git rev-parse --short HEAD)

.PHONY: up down logs ps restart \
        build lint fmt \
        test test-int \
        docker-build docker-push \
        prod-up prod-down

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

# ── Code ───────────────────────────────────────────────────────────────────────

build:
	pnpm build

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
