COMPOSE_DEV = docker compose -f infrastructure/docker/docker-compose.dev.yml
COMPOSE_PROD = docker compose -f infrastructure/docker/docker-compose.yml
GITHUB_REPOSITORY_OWNER ?= nlightn22
VERSION = $(shell node -p "require('./package.json').version")
GIT_SHA = $(shell git rev-parse --short HEAD)

# Machine-specific overrides (gitignored) — e.g. TEST_DB_PORT when this machine's
# docker-postgres-central-1 isn't on the shared default port 5432 (see .env.local.example).
-include .env.local
export

.PHONY: up down logs ps restart \
        build lint fmt \
        test test-int test-e2e mutation-pilot \
        e2e e2e-smoke e2e-ui e2e-report \
        docker-build docker-push \
        preview-build preview-up preview-down \
        prod-up prod-down \
        dev dev-fresh dev-reset dev-branch dev-staging-integration seed seed-approvals seed-payment-refunds \
        seed-customer-detail seed-all \
        verify-branch-scope \
        storybook storybook-ui-kit storybook-manager storybook-storefront storybook-down \
        storefront storefront-dev

# ── Dev infrastructure ─────────────────────────────────────────────────────────

up:
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --build

# infrastructure/docker/docker-compose.dev.yml is ONE shared stack for every contour (local,
# branch, staging-integration) — see docs/environments.md. `down` has no way to tell "my own
# contour's infra" from "some other contour's infra" apart, so the only safe check is: is ANY
# contour's dev stack (server/worker/watcher) still running right now? If so, refuse — tearing
# down here would kill it out from under whoever/whatever started it (real incident: this exact
# thing happened once, see the dev-environment skill's rule 4). Override with `make down FORCE=1`
# once you've confirmed nothing else needs this infra (e.g. you just ran the matching
# dev-kill*.sh yourself, or you checked and it's stale).
down:
ifndef FORCE
	@running="$$(pgrep -af 'ts-node-dev|tsc -b|tsc --watch|vite' 2>/dev/null | grep -v 'make down' || true)"; \
	if [ -n "$$running" ]; then \
		echo "Refusing: dev processes are still running (possibly a different contour — down" >&2; \
		echo "tears down infra shared by ALL contours, see the dev-environment skill):" >&2; \
		echo "$$running" >&2; \
		echo "" >&2; \
		echo "Stop them first (the matching make target's own dev-kill*.sh), or if you're sure" >&2; \
		echo "this is safe, run: make down FORCE=1" >&2; \
		exit 1; \
	fi
endif
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
	bash infrastructure/scripts/dev-run-tracked.sh /tmp/mivend-dev.pgid pnpm dev:all

# Wipe DB volumes, re-seed via native server, then launch full stack
dev-fresh:
	bash infrastructure/scripts/dev-fresh.sh

# Tear down infra containers AND volumes — next up gets a clean DB. Same cross-contour blast
# radius as `down` above (shared docker-compose.dev.yml), plus it wipes every contour's data —
# refuse under the same guard, override with FORCE=1 once confirmed safe.
dev-reset:
ifndef FORCE
	@running="$$(pgrep -af 'ts-node-dev|tsc -b|tsc --watch|vite' 2>/dev/null | grep -v 'make dev-reset' || true)"; \
	if [ -n "$$running" ]; then \
		echo "Refusing: dev processes are still running (possibly a different contour — dev-reset" >&2; \
		echo "wipes infra AND data shared by ALL contours, see the dev-environment skill):" >&2; \
		echo "$$running" >&2; \
		echo "" >&2; \
		echo "Stop them first (the matching make target's own dev-kill*.sh), or if you're sure" >&2; \
		echo "this is safe, run: make dev-reset FORCE=1" >&2; \
		exit 1; \
	fi
endif
	$(COMPOSE_DEV) down -v

# Minimal branch-instance test stack: server + worker only (no separate storefront/manager dev
# servers — see docs/architecture.md's branch-identity/scope design). Safe to run alongside an
# already-running `make dev` central stack: only kills branch-tagged processes (see
# dev-kill-branch.sh), reuses the shared postgres-branch/rabbitmq/elasticsearch containers.
# Since issue #128 (job queue moved off BullMQ/Redis to Vendure's DB-backed
# DefaultJobQueuePlugin), job isolation from central comes from the separate postgres-branch
# database itself — there is no Redis in this stack anymore at all.
dev-branch:
	@bash infrastructure/scripts/dev-kill-branch.sh
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --wait postgres-branch rabbitmq elasticsearch
	@docker exec docker-postgres-branch-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mivend_branch'" | grep -q 1 \
		|| docker exec docker-postgres-branch-1 psql -U postgres -c "CREATE DATABASE mivend_branch"
	pnpm build:plugins
	bash infrastructure/scripts/dev-run-tracked.sh /tmp/mivend-dev-branch.pgid pnpm dev:branch-all

# Deliberately-launched staging-integration contour (issue #68) — the ONLY way to validate the
# real Kafka contract against Integration Service's actual staging broker. Never the default
# `make dev` target. Its own database (mivend_central_staging_integration), so it can never share
# job/state data with `make dev`'s synthetic local contour or `make dev-branch` — see
# apps/server/.env.central.staging-integration and docs/environments.md. Requires
# apps/server/.env.central.staging-integration to exist (copy from
# .env.central.staging-integration.example and fill in real credentials) — never commit that file.
# Does NOT run its own `tsc -b --watch` plugin compiler — dist/ is shared across contours and
# running a second watcher alongside `make dev`'s is exactly the duplicate-process/stale-dist
# hazard AGENTS.md's "Monorepo dist/ and dev watching" warns about; this target does a one-shot
# `pnpm build:plugins` instead, sufficient whether or not `make dev` is already watching it.
dev-staging-integration:
	@test -f apps/server/.env.central.staging-integration || (echo "Missing apps/server/.env.central.staging-integration — copy .env.central.staging-integration.example and fill in real credentials" && exit 1)
	@bash infrastructure/scripts/dev-kill-staging-integration.sh
	GITHUB_REPOSITORY_OWNER=$(GITHUB_REPOSITORY_OWNER) $(COMPOSE_DEV) up -d --wait
	@docker exec docker-postgres-central-1 psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='mivend_central_staging_integration'" | grep -q 1 \
		|| docker exec docker-postgres-central-1 psql -U postgres -c "CREATE DATABASE mivend_central_staging_integration"
	pnpm build:plugins
	bash infrastructure/scripts/dev-run-tracked.sh /tmp/mivend-dev-staging-integration.pgid pnpm dev:staging-integration-all

seed:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Seeding..."
	ERP_IMPORT_TOKEN=$${ERP_IMPORT_TOKEN:-dev-token} node infrastructure/scripts/seed-erp.mjs

# Requires seed to have already run (demo administrators, counterparty cnt-001 must exist).
# The manager-portal roles themselves no longer need a manual seed step — issue #134's
# RoleProvisioningService self-provisions them idempotently at every server boot
# (packages/plugins/access-control/src/role-provisioning.service.ts).
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

# Tops up Orders/Invoices/Documents/History on the demo customer's detail page (AutoService
# Nord / cnt-001) past each tab's page size, so pagination is exercisable in dev/manual QA.
# Idempotent — safe to re-run, only creates the difference up to its target count.
seed-customer-detail:
	@echo "Waiting for server on :3000..."
	@until curl -sf http://localhost:3000/health >/dev/null 2>&1; do sleep 2; done
	@echo "Server ready. Topping up customer-detail tabs..."
	node infrastructure/scripts/seed-customer-detail.mjs

# One command for the full local seeding order (ERP data → approval requests — this exact order
# matters, see seed-approvals' own comment above; manager-portal roles are no longer part of this
# order, see seed-approvals' own comment above). This is what you want by default; the targets
# above stay separate only because occasionally you need to re-run just one (e.g. re-seeding ERP
# data without wiping administrators).
seed-all: seed seed-approvals seed-payment-refunds seed-customer-detail

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

# One dev Storybook up/down pair for all three portals (ui-kit 6006, manager 6016,
# storefront 6018 — HMR websockets use port+1). `storybook-up` kills any previous instances,
# wipes each package's node_modules/.cache/storybook (+ sb-vite-plugin-externals), and backgrounds
# all three `storybook dev` processes with logs under /tmp — run it again any time and it's a
# clean restart, no manual bookkeeping. `storybook-down` kills all three.
#
# The cache wipe matters: Storybook 8's dev-mode CSF indexer (the fast parser behind /index.json,
# separate from a real `storybook build`) has a real recurring bug where after certain file edits
# it gets stuck serving a stale "Could not parse import/exports with acorn" error for a file that
# is actually syntactically valid (confirmed repeatedly with a standalone @babel/parser check) — a
# plain restart alone does not clear it, only wiping this cache does. `fuser -k` (by port, not by
# matched command string) is used to kill, since `pkill -f` was observed leaving the actual node
# process alive (reparented under PPID 1) still holding the port.
storybook-up:
	-fuser -k -9 6006/tcp 6016/tcp 6018/tcp 2>/dev/null; pkill -9 -f "storybook dev" 2>/dev/null; sleep 1
	rm -rf packages/ui-kit/node_modules/.cache/storybook packages/ui-kit/node_modules/.cache/sb-vite-plugin-externals
	rm -rf packages/manager/node_modules/.cache/storybook packages/manager/node_modules/.cache/sb-vite-plugin-externals
	rm -rf packages/storefront/node_modules/.cache/storybook packages/storefront/node_modules/.cache/sb-vite-plugin-externals
	nohup pnpm --filter @mivend/ui-kit storybook:host > /tmp/storybook-ui-kit.log 2>&1 &
	nohup pnpm --filter @mivend/manager storybook:host > /tmp/storybook-manager.log 2>&1 &
	nohup pnpm --filter @mivend/storefront storybook:host > /tmp/storybook-storefront.log 2>&1 &
	@echo "Storybook starting in background: ui-kit :6006, manager :6016, storefront :6018 (logs in /tmp/storybook-*.log)"

storybook-down:
	-fuser -k -9 6006/tcp 6016/tcp 6018/tcp 2>/dev/null
	-pkill -9 -f "storybook dev" 2>/dev/null

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

# Guards against packages/plugins/erp-integration silently drifting from Integration Service's
# real @nlightn22/event-contracts schema (docs/ai/1c-integration-service-decision.md's "Audit
# 2026-09-04" — a real incident, not hypothetical: pinned 0.5.0 vs upstream 0.13.0, 8 minor
# versions of undetected drift). Network-dependent — warns and exits 0 if GitHub Packages is
# unreachable, never blocks lint on a missing/expired token or offline dev machine.
check-event-contracts:
	node infrastructure/scripts/check-event-contracts.mjs

fmt:
	pnpm format

# ── Tests ──────────────────────────────────────────────────────────────────────

test:
	pnpm test

test-int: up
	pnpm --filter "{packages/**}" --no-bail test:integration

# Mutation testing pilot (docs/testing-strategy.md "Mutation testing") — ad hoc only, not part
# of CI or `make test`. Scoped in stryker.config.mjs to one small module at a time.
mutation-pilot:
	pnpm mutation:pilot

# ── Docker app images ──────────────────────────────────────────────────────────

docker-build:
	docker build -f apps/server/Dockerfile -t mivend-server:local .
	docker build -f packages/storefront/Dockerfile -t mivend-storefront:local .
	docker build -f packages/manager/Dockerfile -t mivend-manager:local .

docker-push:
	docker build -f apps/server/Dockerfile \
		-t ghcr.io/nlightn22/mivend-server:v$(VERSION) \
		-t ghcr.io/nlightn22/mivend-server:latest \
		.
	docker build -f packages/storefront/Dockerfile \
		-t ghcr.io/nlightn22/mivend-storefront:v$(VERSION) \
		-t ghcr.io/nlightn22/mivend-storefront:latest \
		.
	docker build -f packages/manager/Dockerfile \
		-t ghcr.io/nlightn22/mivend-manager:v$(VERSION) \
		-t ghcr.io/nlightn22/mivend-manager:latest \
		.
	docker push ghcr.io/nlightn22/mivend-server:v$(VERSION)
	docker push ghcr.io/nlightn22/mivend-server:latest
	docker push ghcr.io/nlightn22/mivend-storefront:v$(VERSION)
	docker push ghcr.io/nlightn22/mivend-storefront:latest
	docker push ghcr.io/nlightn22/mivend-manager:v$(VERSION)
	docker push ghcr.io/nlightn22/mivend-manager:latest

# ── Production ─────────────────────────────────────────────────────────────────

prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

# ── Production preview (issue #115) ─────────────────────────────────────────────
#
# Occasional real-build sanity check: production Docker images for the three frontends, run
# directly on this host (--network host, not the compose network) against the staging-integration
# backend's real data (:3010) — for "we made a pile of changes, let's see how this actually
# behaves in a production build" checks, not a permanent dev workflow. Reachable externally at
# https://devof.komponent-m.ru:8024 (storefront) / :8025 (manager) / :8026 (dashboard) — see
# docs/environments.md's "Production preview" section. `preview-build` requires a GitHub Packages
# read token in ~/.npmrc for the dashboard image (see packages/dashboard/Dockerfile's own comment).

PREVIEW_API_TARGET ?= http://127.0.0.1:3010

preview-build:
	docker build -f packages/storefront/Dockerfile -t mivend-storefront:preview .
	docker build -f packages/manager/Dockerfile -t mivend-manager:preview .
	DOCKER_BUILDKIT=1 docker build -f packages/dashboard/Dockerfile \
		--secret id=npmrc,src=$(HOME)/.npmrc -t mivend-dashboard:preview .

preview-up:
	docker run -d --name mivend-storefront-preview --network host \
		-e API_TARGET=$(PREVIEW_API_TARGET) -e LISTEN_PORT=18024 mivend-storefront:preview
	docker run -d --name mivend-manager-preview --network host \
		-e API_TARGET=$(PREVIEW_API_TARGET) -e LISTEN_PORT=18025 mivend-manager:preview
	docker run -d --name mivend-dashboard-preview --network host \
		-e API_TARGET=$(PREVIEW_API_TARGET) -e LISTEN_PORT=18026 mivend-dashboard:preview
	@echo "Preview containers up: https://devof.komponent-m.ru:8024 (storefront) / :8025 (manager) / :8026 (dashboard)"

preview-down:
	-docker rm -f mivend-storefront-preview mivend-manager-preview mivend-dashboard-preview

# ── E2E tests ──────────────────────────────────────────────────────────────────

e2e test-e2e:
	pnpm --filter @mivend/e2e test

# Minimal critical-route subset (login, order creation) — see docs/testing-strategy.md's
# "E2E strategy". Requires the same `make dev` + `make seed` stack as `make e2e`.
e2e-smoke:
	pnpm --filter @mivend/e2e test:smoke

e2e-ui:
	pnpm --filter @mivend/e2e test:ui

# Recovery-after-transient-failure scenario — see manager/resilience/connection-recovery.spec.ts.
# Not part of `make e2e`/CI; SIGSTOPs the real local dev server, takes a few minutes.
e2e-resilience:
	E2E_RESILIENCE=1 pnpm --filter @mivend/e2e test:resilience

e2e-report:
	pnpm --filter @mivend/e2e report
