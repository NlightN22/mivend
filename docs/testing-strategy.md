# Testing strategy

Canonical source of truth for how tests are designed, placed, and run in mivend. Read this
before writing or changing any test — see the `test-design` skill for the mandatory workflow.

## Goals

- Every test has a clear purpose: which risk it proves, at which boundary.
- Every risk is checked at the minimum sufficient level — no reflexive duplication across levels.
- Critical architectural rules are enforced by tests, DB constraints, and lint/CI where possible,
  not only by documentation.
- Adding a feature does not cause unbounded, uncontrolled test growth.

## Levels

### Unit

Pure business logic: invariants, calculations, FSM transitions, strategy selection, input
transformation, overlap classification, allocation rules, scope predicates, retry decisions,
command/event construction.

- No real DB, no RabbitMQ, no Redis, no external services, no full Vendure app bootstrap.
- Mock only real external dependencies — never the logic under test.
- Does not prove ORM/SQL/transaction/locking behavior.

Location: `src/__tests__/unit/`. Runner: Vitest, root `vitest.config.ts` (`make test`).

### Integration

A single infrastructural seam: repository against real Postgres, SQL queries, unique
constraints, foreign keys, transactions, locking (`SKIP LOCKED`, optimistic/pessimistic),
inbox claim, business-write+outbox atomicity, (de)serialization, resolver→service→DB, Redis or
RabbitMQ when the boundary itself is under test, migrations/schema.

Does not automatically become a full user scenario.

Location: `src/__tests__/integration/`. Runner: Vitest, per-plugin `vitest.integration.config.ts`
(`make test-int`).

### Component

A complete chain within one plugin/service, e.g.:

```text
enqueue → claim → process → persist result → mark processed
enqueue → processor failure → retryable state → next sweep → success
GraphQL mutation → service → domain operation → persistence → returned projection
```

- Real DI, real repositories, real DB, real internal services of the component under test.
- External boundaries (payment provider, ERP adapter, SMTP, HTTP) are replaced in a controlled way.
- Worker/processor can be invoked directly (no waiting on a real scheduler interval).
- Does not require booting the full central+branch stack.

Location: `src/__tests__/integration/component/` (co-located with integration tests, same
Vitest/DB infra, distinguished by directory and by testing a full chain rather than a single seam).

### Contract

Boundary stability: RabbitMQ event envelope, routing keys, event versions, ERP callback payload,
external webhook payload, GraphQL schema, generated GraphQL operations, adapter interfaces,
central/branch sync formats, required external identifiers, backward compatibility.

Minimum checks: required fields, allowed values, unknown extra fields, still-supported old
version, unsupported version, producer/consumer agreement, no silent field removal/rename,
optional/nullable semantics, routing key stability, correct id uniqueness scope.

Location: `src/__tests__/integration/contracts/` for a given plugin, or a dedicated
`__tests__/contracts/` at the boundary owner (e.g. `plugin-sync` for the RabbitMQ envelope).

### E2E

Only critical user and cross-system routes (see "E2E strategy" below). Never used to enumerate
every validation error, status combination, retry scenario, overlap, isolation variant, or
internal branch — those belong at lower levels.

Location: `packages/e2e/`. Runner: Playwright (`make e2e`).

## Level selection rule

Each scenario goes at the lowest level that proves it:

- Unit proves a business rule.
- Integration proves a technical seam works.
- Component proves one component's full chain works.
- Contract proves a boundary is stable.
- E2E proves one critical route end-to-end.

Never copy the same scenario set onto every level by default. Example (payment distribution):
allocation variants → unit; write+transaction → integration; inbox accept→process→persist chain
→ component; one main payment user route → E2E.

## Directory structure

```text
src/
├── __tests__/
│   ├── unit/
│   ├── integration/
│   │   ├── (plain integration tests)
│   │   ├── component/
│   │   └── contracts/
```

Do not apply this mechanically to every plugin. Only create `component/`/`contracts/`
subdirectories once a plugin actually has tests of that kind — no empty directories, no
speculative structure. Most plugins today only need `unit/` and `integration/`.

## Database isolation (integration/component tests)

**Decision: schema-per-file, single shared Postgres instance.** Each integration test file
creates its own Postgres schema (e.g. `test_<file-hash>`) instead of `dropSchema: true` against
`public`. This is the minimal change over the current setup — same `mivend_test` database, same
`docker-compose`/GitHub Actions `postgres` service, same `DataSource` bootstrap pattern already
used in every plugin — it only adds a `schema` option and a unique-per-file schema name.

Why not the alternatives: a single shared schema with row-cleanup between tests still races on
DDL when two files `synchronize: true` the same table names concurrently (the exact bug already
hit in `plugin-acquiring`/`reservation`/`approval-workflow`/`counterparty`, currently patched
around with `fileParallelism: false`); DB-per-worker needs new CI provisioning; Testcontainers
adds container startup cost and Docker-in-Docker requirements for no isolation benefit over
schema-per-file at this project's scale — do not introduce it "because it's popular."

Once a plugin's integration config uses schema-per-file, its `fileParallelism: false` workaround
can be removed — files (and, subject to real DB connection-pool limits, workers) may run in
parallel because each owns its own schema.

**Rollout status: complete across every plugin with integration tests** — `documents`,
`saved-views`, and `session-management` were the last three still on `dropSchema: true` against
the shared `public` schema; migrated together with `plugin-erp-import`'s already-migrated
component test verified as the reference. Confirmed by running all of `documents`, `saved-views`,
`session-management`, `erp-import`, and `acquiring`'s integration suites concurrently
(`pnpm --filter <these 5> --no-bail test:integration`) — the actual risk this decision exists to
prevent (cross-plugin, not just cross-file, DDL races against one shared `mivend_test` database)
is what this run exercises, not just each plugin in isolation.

## Mocking strategy

Allowed to mock: external payment provider, ERP adapter, transport boundary, SMTP, file storage,
third-party HTTP API, time, id generator.

Never mock, in a component test: the internal application service under test, its repository,
the transaction boundary, the processor under test, entities/core domain rules.

Forbidden: a test that is 100% mocks, asserting only that one mock called another.

## Worker testing

Never wait on a real scheduler interval. A worker is split into: scheduler/queue wiring, sweep,
claim-batch, processor, lifecycle transitions — each independently invocable in tests. Tests must
be able to: call sweep directly, process a specific batch, control time, simulate a failure,
verify retry, verify recovery, verify concurrency (real concurrent calls, not two sequential
ones). Production BullMQ wiring gets one separate, minimal integration check — not exercised by
every component test.

## Fixtures, factories, builders

- Factories build minimally valid objects; builders explicitly override the fields relevant to
  the scenario. No large hidden default state.
- Scope values and external ids are visible in the test, not buried in a factory default.
- External ids are deterministic; time is controlled; random data only with a fixed seed.
- One factory does not construct half the system (e.g. a counterparty factory does not also
  create branches, orders, and payments).
- Helpers exist for the recurring scope-isolation pair: target scope / foreign scope / same
  external id / different ownership.

Location: `packages/shared/src/testing/` for genuinely cross-plugin helpers (id generators, time
control, DataSource/schema bootstrap); plugin-local factories stay inside that plugin's
`src/__tests__/` — do not promote a plugin-specific factory to `shared` until a second plugin
actually needs it.

## Assertions

Custom assertions only for real, repeated architectural checks: foreign-scope record unchanged,
business-data+outbox present/absent atomically, inbox lifecycle state, side effect happened
exactly once, projection matches its event set, record carries an external reconciliation
reference. A custom assertion must not hide significant logic — failure messages stay readable.

## E2E strategy

Critical routes only: login + trading-point selection, product search + cart, order creation,
approval/confirmation, payment, invoice/payment display, branch/counterparty access rights, one
central-branch sync flow, one redelivery scenario, one recovery-after-transient-failure scenario.

Requirements: no duplicated business rules (those live at lower levels), stable seed data,
isolated cart/session per test, no inter-test ordering dependency, trace/screenshots/logs kept on
failure, no fixed `waitForTimeout` sleeps, a minimal smoke subset runnable in CI, heavy E2E in a
separate workflow if runtime requires it.

A minimal `@smoke`-tagged subset (storefront login, deferred-payment order creation — see
`packages/e2e/package.json`'s `test:smoke` / `make e2e-smoke`) runs via
`.github/workflows/integration.yml`'s `e2e-smoke` job, booted non-interactively by
`infrastructure/scripts/ci-e2e-smoke.sh`. **Verified green end to end** (`workflow_dispatch` run
`29812146992`, 2026-07-21 — `integration` job ~2min, `e2e-smoke` job ~3min) after 11 iterative
`workflow_dispatch` attempts that found and fixed 7 real, previously-unknown bugs in the boot
path (see "Known technical debt" below for the full list — CI build scoping, a manager circular
type, the `uuid-ossp` extension, `dotenv` PATH-shadowing by a system Ruby gem, unbounded wait
loops, a missing pre-build step, a gitignored `.env.central`, missing Chrome for puppeteer, and a
genuine postgres init-script race condition). **Deliberately kept `workflow_dispatch`-only, not
flipped to run on every PR** — booting the full native stack (5 infra containers + server+worker+
storefront+manager) costs several minutes end to end for what is, on purpose, only 2 tests; that
cost is real and was explicitly weighed against running it routinely (see `AGENTS.md`'s "Do not
include heavy E2E on every push without a time estimate" — this is that estimate). Re-run
manually via `gh workflow run integration.yml -f run_e2e_smoke=true` when touching the boot path
itself, or periodically as a health check — not as a per-PR gate. The full suite (`make e2e`)
stays local-only.

## CI

Target pipeline: lint → format check → type check → unit → integration → component → contract →
E2E smoke, with a separate heavier E2E workflow if needed. Coverage is a diagnostic signal, not a
goal — no blanket high coverage threshold without analysis. Retries apply only to genuinely
infrastructure-flaky steps, never to mask a real bug.

**Actual shape (2 jobs, not 6+)**: `.github/workflows/ci.yml`'s `lint-and-typecheck` job covers
lint/format/typecheck; its `unit-tests` job runs `pnpm test` (unit + contract — contract tests
need no DB/infra, so they're already part of the unit vitest run) with a second, explicitly
labeled step that re-runs just the contract subset for a distinctly named pass/fail in the
Actions log. `.github/workflows/integration.yml`'s `integration` job runs the full
`test:integration` across every plugin (integration + component together — both need the same
Postgres/Redis/RabbitMQ, so there's no isolation reason to split them), with a second, explicitly
labeled step that re-runs just the two existing component suites (`plugin-erp-import`,
`plugin-reservation`) the same way. `e2e-smoke` stays a separate `workflow_dispatch`-only job (see
"E2E strategy" above).

**Why not 4-6 fully separate jobs, one per level, matching the target pipeline literally**: as of
this writing there is exactly 1 contract suite and 2 component suites in the whole repo (`git
grep` them if that's changed since). A dedicated job means a dedicated Postgres/Redis/RabbitMQ
service matrix and its own startup cost, paid on every push, for 1-3 files — the same "don't add
abstractions before real repetition" rule this project applies everywhere else in `AGENTS.md`
applies to CI structure too. The chosen shape (extra labeled _steps_ within the existing 2 jobs,
re-running the same subset a second time under its own name) gets the actual goal — a level's
pass/fail is visible on its own in the Actions log, not buried inside a generic "tests passed" —
at effectively zero extra infra cost, accepting a few seconds of redundant re-execution instead.
**Revisit this decision once component or contract suite count grows enough that a dedicated job
(and its own service matrix) pays for itself** — there's no fixed threshold, use judgment at that
point the same way this decision was made.

## Mutation testing

Selective, not blanket: payment distribution, scope predicates, state-transition guards, overlap
algorithms, idempotency decisions, reservation/availability calculations, ownership rules. Start
with a pilot on one small module before deciding whether to expand.

**Pilot run and conclusion**: StrykerJS (`@stryker-mutator/core` + `@stryker-mutator/vitest-runner`,
root devDependencies — not added to any single plugin's own `package.json`, since
`@stryker-mutator/vitest-runner` requires `vitest >=2.0.0` and several plugins, including
`plugin-acquiring`, still pin their own `vitest ^1.0.0`/`1.6.x`) against
`plugin-acquiring/src/idempotency.service.ts` — chosen as a genuine idempotency-decision module
this same testing-architecture pass had just found a real, previously-untested concurrency bug in
(see `idempotency.service.ts`'s `claim()` and `idempotency.int.test.ts`). Config: `stryker.config.mjs`
at the repo root, `mutate` scoped to that one file, driven through the root `vitest.config.ts`
(`make mutation-pilot` / `pnpm mutation:pilot`).

Result: 81 mutants, 14 killed, 10 survived, 57 "no coverage" — a low headline score (~17%), but
**every one of the 10 survivors is a branch this project deliberately tests at the integration
level, not unit level** (the `claim()` outcome branches for `'conflict'`/`'in-progress'`/
`'completed'`, and the `POSTGRES_UNIQUE_VIOLATION` constant's real-error-code path) — confirmed
against `idempotency.int.test.ts`, which does kill all of them when run separately. None of the
survivors represent an actual undetected regression; the pilot instead validated that the
level-placement decision (`docs/testing-strategy.md`'s "minimum sufficient level" rule) was
correct, not sloppy.

**Cost/usefulness verdict**: mutation testing at the _unit_ level alone gives a misleading score
for any module whose real coverage is split across unit + integration levels by design — which,
per this project's own placement rule, is the common case, not the exception. Getting a
meaningful score would require running Stryker against a live-Postgres integration config too
(this pilot's config deliberately does not — no CI infra wiring, no live DB dependency for an ad
hoc mutation run), which raises the real cost (run time was already ~1 minute for one 90-line
file/81 mutants; a live-DB integration run would add infra startup and per-mutant DB isolation
overhead on top). **Decision: keep it as a manual, ad hoc tool for a developer to run against one
module they're actively hardening (`make mutation-pilot`) — do not wire it into CI, do not set a
blanket score threshold, and do not expand it to more modules automatically.** Revisit only if a
specific module's tests keep passing through a real regression that mutation testing would have
caught — the general pattern-level candidates listed above remain valid targets for that
narrower, deliberate use, one module at a time.

## Definition of done

A change is not done until:

- Applicable risks are identified and a test plan exists (see the `test-design` skill).
- Tests are added at the minimum sufficient level for each risk.
- Positive and necessary negative cases are covered.
- Data isolation is checked for any scoped operation.
- Idempotency is checked for any repeatable/async flow.
- Retry and recovery are checked for any worker/integration touched.
- Atomicity is checked for any related-write pair (e.g. business data + outbox).
- Contract is checked when an external boundary changes.
- No unjustified duplication across levels.
- Tests are isolated and reproducible (no run-order dependency, no fixed sleeps).
- Targeted tests pass, then the required Makefile commands pass.
- Deliberately uncovered risks are called out, with a reason.

## Commands

- `make test` — unit tests, offline.
- `make test-int` — integration/component/contract tests (starts infra via `make up`).
- `make e2e` — Playwright E2E (requires `make dev` + `make seed`).

## Diagnosing failing tests

- Unit failure: no infra involved — reproduce with `pnpm --filter <pkg> vitest run <file>` after
  `make down` is irrelevant; check the assertion and the fixture data first.
- Integration/component failure: check `make up` actually succeeded (`docker ps`); a
  cross-file DDL race shows up as a Postgres error unrelated to the assertion — see the
  schema-per-file rule above before assuming a logic bug.
- E2E failure: check the Playwright trace/screenshot artifact first, not the assertion message —
  most failures are stale auth state, seed drift, or a missing `make dev`/`make seed`, per
  `docs/e2e-testing.md`.

## Known technical debt

Honest inventory as of this pass through the testing-architecture task (not a call to action —
some of these are deliberate, some are real gaps worth tracking). Update this list as items are
closed or new ones are found; don't let it silently go stale.

- ~~`packages/storefront`'s typecheck was broken on `main`~~ **Fixed.** 6 real errors across
  `HomePage.vue`, `FavoritesPage.vue`, `ProductListView.vue`, `SettingsPage.vue`: two genuinely
  unused declarations (`ProductListView.vue`'s `handleToggleFavorite` took an unused `variantId`
  param — the function already derives it from the item it's given; `SettingsPage.vue`'s unused
  `useRouter()`), one wrong-generic-idiom bug (`FavoritesPage.vue`'s `toCard` typed its param as
  `ReturnType<typeof favoritesStore.items>[number]` — `items` is a `Ref<FavoriteItem[]>` _value_,
  not a callable, so `ReturnType<...>` was never valid; fixed by importing `FavoriteItem` and
  using it directly), and one composable return-type bug (`useWidgetProducts.ts` declared
  `items`/`loading` as `ReturnType<typeof ref<T>>`, which resolved to `Ref<T | undefined>` instead
  of `Ref<T>` — fixed by typing them as plain `Ref<T>`, which is what `ref<T>(initialValue)`
  actually, always returns). `vue-tsc --noEmit` and the real `vite build` are both clean now.
- ~~`e2e-smoke` had never actually been run in CI~~ **Fixed — verified green** (see "E2E strategy"
  above for the run reference). It took 11 iterative `workflow_dispatch` attempts to get there,
  each surfacing one real, previously-unknown bug in the boot path — a useful reminder that "we
  wrote a CI script" and "the CI script actually works" are different claims until the second one
  is checked for real: 1. `integration.yml`'s "Build plugins" step ran unscoped `pnpm build` (the whole monorepo,
  including `manager`/`storefront`, neither of which integration tests touch) — scoped to
  `pnpm --filter '!@mivend/manager' --filter '!@mivend/storefront' -r build`. 2. `manager`'s `ApprovalsInboxPage.stories.ts` had a genuine circular return-type annotation. 3. Neither the CI `postgres:16` service nor a genuinely fresh local Postgres volume ever created
  the `uuid-ossp` extension several entities' `uuid_generate_v4()` id default needs — fixed
  centrally in `createTestSchema()` (`packages/shared/src/testing/postgres-test-schema.ts`). 4. `reserve-order.concurrency.test.ts` was missing `rawConnection` on its shim (same class of
  bug as the `InboxService`/`IdempotencyService` fixes earlier in this doc), which then exposed
  `ReservationService.setOrderReservationState`'s raw SQL hardcoding the production table/
  flattened-customField-column names (`FROM "order"`, `"customFieldsReservationstate"`) — no
  test fixture could ever satisfy that; fixed by replacing the raw SQL with a normal
  `repo.findOne()` re-read through the same entity-mapped repository the rest of the method
  already uses. 5. `approval-request.concurrency.test.ts`'s "exactly one of two concurrent decide() calls
  succeeds" wasn't reliably forcing real read/write overlap against a fast local Postgres (the
  first call's whole read→write chain could finish before the second call's read even started
  — genuinely sequential, and "both succeed" is the _correct_ outcome for that case, not a
  bug — verified separately that the service's own optimistic-lock guard is correct via a
  forced-simultaneous-read harness). Fixed with an explicit read-race barrier
  (`armReadRaceBarrier`) that holds every `findOneOrFail` call until all expected callers have
  read, so the write phase always starts from a genuinely concurrent, same-version read. 6. `ci-e2e-smoke.sh`: `dotenv -e ...` resolved to the ubuntu runner's own pre-installed Ruby
  `dotenv` gem (shadowing the project's `dotenv-cli` npm package), which doesn't support `-e`
  and crashed instantly — but backgrounded, so `set -euo pipefail` never saw it, and the script
  just hung on a port that would never open. Fixed by calling `pnpm dev:central` (forces
  `node_modules/.bin` resolution) instead of the raw binary; also replaced every unbounded
  `until curl ...; do sleep 2; done` wait with a bounded `wait_for_url` helper so any _other_
  future background-process failure fails loudly within minutes instead of hanging for the
  workflow's entire default timeout. 7. `ci-e2e-smoke.sh` never built plugins/shared before starting the server — `ts-node-dev`
  `require()`s each `@mivend/plugin-*` package directly (via its `dist/index.js`), it does not
  transpile workspace dependencies on the fly the way Vite does. Fixed by adding the same
  scoped build step `integration.yml` already has. 8. `apps/server/.env.central` is gitignored (only `.env.*.example` variants are committed), so
  it never exists on a fresh checkout — `dotenv-cli` silently no-ops on a missing file, so none
  of the expected env vars were ever set, and Vendure's own hardcoded fallback
  (`process.env.DB_NAME ?? 'mivend'`) pointed at a database that was never created. Fixed by
  seeding `.env.central` from its `.example` (a real, working drop-in — same dev-only
  credentials `docker-compose.dev.yml` itself already hardcodes) when missing. 9. `plugin-documents`' `PdfBrowserService` launches a real Chrome via puppeteer at server
  bootstrap; a missing browser crashed the whole Nest bootstrap, not just PDF generation.
  `puppeteer`'s postinstall (which normally downloads Chrome) didn't run on the fresh runner —
  fixed by installing it explicitly (`pnpm --filter @mivend/plugin-documents exec puppeteer
browsers install chrome`). 10. The custom `infrastructure/docker/postgres/entrypoint.sh` raced its own `ALTER USER postgres
WITH LOGIN` against `/docker-entrypoint-initdb.d/01-create-test-db.sql`'s own `ALTER USER`
  statement — the official postgres image's two-phase startup only binds its _temp_ init
  instance (the one running init scripts) to the unix socket, never TCP, but this
  entrypoint's wait loop connected via the default unix-socket path, which succeeds during
  the temp phase too. Two concurrent `ALTER USER` statements on the same `pg_authid` row
  produced "tuple concurrently updated", aborting the whole official entrypoint (a fatal
  error in an init script kills the container) — only diagnosable at all once a "dump
  container logs on failure" step was added, since `docker compose up -d` never streams
  container stdout. Fixed by waiting on `pg_isready -h 127.0.0.1` (forces TCP) before this
  entrypoint's own commands run, which structurally can't observe the temp phase at all.

        Deliberately **not** flipped to run on every PR despite being green now — see "E2E strategy"
        above for the reasoning (cost vs. benefit for 2 tests) and the re-run command.

- **CI has 2 jobs with labeled subset-steps, not 4-6 fully separate jobs** — deliberate, see the
  CI section above for the full reasoning and the revisit condition.
- **Mutation testing is ad hoc only (`make mutation-pilot`), not in CI** — deliberate, see the
  "Mutation testing" section above.
- **`plugin-erp-import`'s per-record `data` payload shape has no runtime validation** — only the
  outer envelope (`exchangeId`, `records`, each record's `type`) is checked
  (`batch-import.contract.test.ts`). The 15 individual record DTOs (`ProductRecordDto`,
  `StockRecordDto`, etc.) are Swagger-only, same root cause as the `outcome`-enum gaps already
  fixed elsewhere (no global `ValidationPipe`/`class-validator` in this project). Not fixed here —
  15 DTOs' worth of real validation logic is a substantially larger, separately-scoped change than
  the narrow envelope-level fixes made this pass, and each one needs its own risk analysis (what
  should reject vs. what should tolerate unknown/missing fields) rather than a blanket treatment.
  Tracked: `tasks/erp-import-record-validation.md`.
- **Contract-test coverage is 2 boundaries (`plugin-sync`'s RabbitMQ envelope,
  `plugin-erp-import`'s batch DTO) out of several documented candidates** (GraphQL schema/
  generated operations, `plugin-sync`'s central/branch sync formats beyond the envelope schema
  itself). Extend opportunistically when touching those boundaries, per the `test-design` skill —
  not a backlog to clear in one pass. Tracked: `tasks/contract-tests-expansion.md`.
- **"Forbid a production scheduler inside component tests" (one of the "Архитектурные
  ограничения" examples the original task named) has no static enforcement** — only architectural
  practice (workers are split into scheduler/sweep/claim/processor, tests call the processing
  methods directly, never a real `bullmq` `Worker`/`Queue`). No ESLint rule exists for it yet,
  unlike the sibling examples (RabbitMQ/ErpAdapter boundaries, sync-processing-in-webhooks,
  owning-service import boundaries), which are all enforced. Not added speculatively — no real
  violation exists yet to calibrate a rule against. Tracked:
  `tasks/eslint-forbid-scheduler-in-component-tests.md`.
