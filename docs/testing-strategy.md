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
`infrastructure/scripts/ci-e2e-smoke.sh`. It is `workflow_dispatch`-only for now (manual
`run_e2e_smoke: true`) until its real runtime/flakiness on a fresh GitHub-hosted runner has been
observed at least once — flip it to run on every PR once verified. The full suite (`make e2e`)
stays local-only.

## CI

Target pipeline: lint → format check → type check → unit → integration → component → contract →
E2E smoke, with a separate heavier E2E workflow if needed. Coverage is a diagnostic signal, not a
goal — no blanket high coverage threshold without analysis. Retries apply only to genuinely
infrastructure-flaky steps, never to mask a real bug.

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
