# AGENTS.md

Development rules and principles for mivend.
Read this before writing any code.

---

## Core principles

- **Modularity first.** Every piece of logic lives in the smallest meaningful unit. If something can be a separate file, it should be.
- **File size limit: 200–300 lines.** If a file exceeds this, it needs to be split. No exceptions.
- **No excess code.** Only implement what is required right now. No speculative abstractions, no "we might need this later."
- **Research before implementing.** Before adding a library or choosing a pattern, verify it is the current best practice. Check Vendure docs, check npm trends, check GitHub issues. Don't assume.
- **Clean separation.** Each layer has one responsibility. Resolvers do not contain business logic. Services do not build GraphQL responses. Entities do not have methods beyond simple accessors.

---

## Privacy and confidentiality

This is a public open-source repository. Keep all content generic.

- No company names, brand names, or legal entity names anywhere in the codebase.
- No geographic locations (cities, regions, countries) specific to the business.
- No client names, employee names, or internal system names.
- No internal pricing details, financial figures, or contract terms.
- Architectural decisions may reference general technical constraints (e.g. "unreliable network between locations") but must not describe specific infrastructure or vendors.
- Use generic placeholders in examples: `branch-a`, `branch-b`, `customer-123`, `price-type-wholesale`.

---

## Language

Everything is in **English** — code, comments, variable names, configs, docs, GitHub issues, pull requests, commit messages, and all project files.

The only exception: individual files explicitly requested to be in Russian by the developer.

---

## Monorepo structure — principles, not a tree

**Don't maintain a literal folder tree here — it goes stale the moment anyone adds a plugin or
moves a file, and a stale tree actively misleads (this file's own tree drifted to describe
directories, `apps/central`/`apps/branch`/`packages/admin-ui`, that never existed on disk).**
Discover the actual current layout with `ls`/`find` when you need it — these are the structural
_principles_ that don't change from one plugin/page/file to the next:

- **One Vendure codebase, one process type per role.** `apps/server` is the only Vendure app —
  central hub vs. branch is an _env-driven identity_ (`INSTANCE_TYPE`/`INSTANCE_ID`), never a
  separate app directory. See `docs/environments.md` for the full local/staging-integration/
  production contour model layered on top of that identity.
- **One package per Vendure plugin**, all under `packages/plugins/`, each self-contained per the
  `backend-plugin-rules` skill's required layout. No fixed list is kept here — see
  `packages/plugins/` directly.
- **Two independent Vue 3 frontends**, each its own package: a customer-facing client portal and
  a B2B/backoffice manager portal (see the `frontend-rules`/`storefront-rules`/
  `manager-portal-rules` skills for what's common vs. portal-specific). Neither is Vendure's own
  built-in Admin UI — that's mounted under `/admin` on `apps/server` itself, not a separate
  package (see `docs/environments.md`'s "Reaching a contour from outside this box").
- **One shared UI-kit package** for both frontends — never two parallel component libraries.
- **Shared cross-cutting code** (TypeScript types/contracts used by more than one package, e2e
  tests) each get their own package, not folded into a plugin or a frontend.
- `infrastructure/` (Docker, scripts) and `docs/` (architecture, domain, decisions) sit alongside
  the code, not inside any package.

**Known naming inconsistency, deliberately not fixed yet**: the two frontend packages don't share
a naming pattern (one is a role-ish English word, the other a literal portal name) — a rename to
something symmetrical has been discussed but is explicitly parked, not scheduled. Don't rename
either package without raising it first — it touches pnpm workspace refs, Vite/nginx config, CI,
and `docs/environments.md`'s port tables everywhere.

---

## Testing requirements

Testing is mandatory — not optional. Every plugin and significant piece of logic must have tests
before it is considered done.

Full strategy, level definitions, database isolation, mocking rules, worker testing, and E2E
strategy: **`docs/testing-strategy.md`**. Architectural risk catalog (data isolation, idempotency,
inbox lifecycle, outbox atomicity, ordering, concurrency, retry, partial failure, overlaps,
source ownership, eventual consistency, authorization, contract compatibility) with minimum
scenarios per pattern: **`docs/testing-patterns.md`**.

**Before writing or changing any test, or any code that changes a business flow, CQRS event,
inbox/outbox, worker, scope, permission, or external contract — call the `test-design` skill
first.** It requires reading `AGENTS.md` + the two docs above, identifying business invariants,
data ownership/scope, and external boundaries, checking for existing close tests before adding
new ones, and producing a short test plan (changed behavior, invariants, scope, failure modes,
applicable patterns, level per scenario, reused coverage, deliberate omissions).

The canonical, single source for this procedure is `.claude/skills/test-design/SKILL.md` — it
applies to every agent working in this repo, not only Claude Code. If your tooling has no
skill-invocation mechanism (Codex, or any other agent that only reads `AGENTS.md`/repo files
directly): read `.claude/skills/test-design/SKILL.md` yourself and follow its procedure and test
plan format inline before writing or changing tests — do not skip this step just because there is
no `Skill` tool call available to you. Do not duplicate that file's content elsewhere; if your
tooling needs its own entry point, add a thin adapter file that points back to it instead.

**Rule: minimum sufficient level.** Never copy the same scenario set onto every level. A business
rule belongs in a unit test; a technical seam in an integration test; a full component chain in a
component test; a boundary in a contract test; only a handful of critical end-to-end routes in
E2E. No unjustified duplication across levels.

**Rule: automated tests run only against the local contour's seeded/synthetic data — never
against a real external source.** This follows directly from issue #68's contour separation (see
`docs/environments.md`): `make test`/`make test-int`/`make e2e` all run against `make dev`'s local
contour (`INTEGRATION_KAFKA_ENABLED=false`, synthetic `erp-import`/`seed-erp.mjs` data), never
against `make dev-staging-integration`'s real Integration Service Kafka connection. Concretely:

- If a test needs data that doesn't exist yet in the local seed set (a new `PriceType`, a
  `Warehouse` with a specific shape, a Kafka message payload to feed a handler test), the fix is
  to **extend the seed data or the test's own fixtures** (a new `erp-import` record type — see
  the `backend-plugin-rules` skill's dev seed rules — or a synthetic protobuf-encoded message the
  test constructs itself) — never
  to point a test at the staging-integration contour to borrow real data from there.
- `erp-integration`'s Kafka consumer/producer tests mock the broker/Schema Registry client (see
  `docs/testing-strategy.md`'s mocking strategy — external transport boundaries are exactly what's
  allowed to be mocked); they never require a live connection to `is.komponent-m.ru`, in any test
  level, including integration/component tests.
- The staging-integration contour's own database is deliberately **never seeded** (see
  "Environments / contours" in `docs/environments.md`) — it exists solely to validate the real
  contract against Integration Service's actual broker, taking whatever real data arrives as-is.
  Manually inserting synthetic rows there to make a manual check "work" defeats its entire purpose
  (masking a real contract mismatch) and reintroduces the exact synthetic/real data mixing #68 was
  about preventing, just via a different mechanism (manual seeding instead of an accidental Kafka
  connection).
- A manual, deliberate verification against the real broker (e.g. confirming a consumer fix
  actually decodes a real message) belongs in `make dev-staging-integration`, is not part of the
  automated suite, and is not a substitute for the automated tests above — both are required where
  applicable, not either/or.

### Running tests

Always run tests via Makefile, not directly through pnpm:

- `make test` — unit tests (offline, no infrastructure needed)
- `make test-int` — integration/component/contract tests (starts dev infrastructure via `make up` automatically)
- `make e2e` — Playwright E2E (requires `make dev` + `make seed`)

Never use `pnpm test` or `pnpm --filter ... test` directly — use the Makefile targets.

### CI/CD

- Every push: lint + type-check + unit tests (`.github/workflows/ci.yml`)
- Every PR to main: integration tests (`.github/workflows/integration.yml`)
- A PR cannot be merged if CI is red

### Definition of done

A change is not done until: applicable risks are identified with a test plan; tests are added at
the minimum sufficient level; positive and necessary negative cases pass; data isolation,
idempotency, retry/recovery, and atomicity are checked wherever they apply; contract is checked
for any external-boundary change; no unjustified duplication; targeted tests and the required
Makefile commands pass; deliberately uncovered risks are reported with a reason. Full checklist:
`docs/testing-strategy.md`'s "Definition of done".

---

## Vendure core

**Never modify Vendure core** (`node_modules/@vendure`) — if it doesn't support something
natively, build a plugin.

---

## TypeScript

- Strict mode enabled everywhere (`"strict": true`).
- No `any`. Use `unknown` and narrow, or define proper types in `packages/shared`.
- Prefer explicit return types on public methods.
- Interfaces over type aliases for object shapes that will be implemented or extended.

---

## Naming conventions

| Thing                 | Convention                                | Example                                   |
| --------------------- | ----------------------------------------- | ----------------------------------------- |
| Files                 | `kebab-case`                              | `reservation-service.ts`                  |
| Classes               | `PascalCase`                              | `ReservationService`                      |
| Variables / functions | `camelCase`                               | `getActiveReservations`                   |
| GraphQL mutations     | `verbNoun`                                | `createReservation`, `releaseReservation` |
| GraphQL queries       | `nounOrNounList`                          | `reservation`, `reservations`             |
| DB table names        | `snake_case`, plugin-prefixed             | `reservation_item`, `customer_price_type` |
| Env variables         | `SCREAMING_SNAKE_CASE`, instance-prefixed | `BRANCH_DB_HOST`, `CENTRAL_SYNC_INTERVAL` |

---

## Comments

Write no comments by default.
Add a comment only when the **why** is non-obvious: a hidden constraint, a workaround for a specific bug, a subtle invariant.
Never comment what the code does — names do that.

---

## License

This project is licensed under **GPL-3.0-or-later**, required by Vendure core (GPL-3.0-or-later) which this project directly depends on.

Every `package.json` in the monorepo must contain:

```json
"license": "GPL-3.0-or-later"
```

This applies to all packages without exception: `apps/*`, `packages/shared`, `packages/plugins/*`.
Do not use any other license. Do not omit the field.

---

## Git workflow

**Commit after every completed change — do not wait for an explicit "commit this" request.**
This applies to every agent working in this repo (Claude Code or otherwise), same as the rest of
this file.

- "Completed" means: the change satisfies its own task (a fix, a feature slice, a refactor, a
  doc/config update) and passes the applicable checks — **Mandatory final checks** below for
  code, or the relevant `make test`/`make lint` subset for a narrower change. Do not commit
  half-finished or currently-failing work just to checkpoint it.
- One commit per logical change, not one commit per file and not one giant commit bundling
  unrelated changes together. If a review/audit round produces several fixes to the same feature,
  one commit for that whole round is fine (see the commit message convention below).
- Still follow every other git rule already in place (Claude Code's own tool instructions, and
  general good practice for any agent): never `--force`-push, never `--amend` a commit that's
  already been reviewed/pushed, never skip hooks (`--no-verify`), never commit a file that looks
  like it holds a secret (double-check `git status`/`git diff` contents before staging, especially
  after a broad `git add`), and never commit a `.env*` file that isn't already tracked as an
  `*.example` template — `.gitignore`'s `.env.*` pattern exists specifically to keep real
  credentials (Integration Service Kafka creds, DB passwords, etc.) out of the repo; see
  `docs/environments.md`.
- Before committing, run whatever this file's other sections require for the kind of change made
  (test-design's test plan, final-check's `make lint`/`make test`, access-control-review, etc.) —
  "commit after every change" does not relax any of those, it just removes the need to ask
  permission for the commit step itself once they've passed.
- Commit messages: describe _why_, not just _what_ (see any recent commit in `git log` for the
  house style); reference the relevant issue number when there is one.
- This does not authorize pushing to a remote or opening/merging a PR on its own — those remain
  separate, explicit-request actions unless a specific workflow in this file (or the user) says
  otherwise.

---

## Dev process management

Starting the full dev stack is done exclusively via `make dev`. Do not start individual processes (server, storefront, plugin watchers) manually — they will accumulate as orphans and exhaust memory.

Rules:

- **Always use `make dev`** to start the development stack. It is designed to be the single entry point and handles all processes together.
- **Never run `pnpm --filter server dev`, `pnpm dev:plugins`, or `pnpm --filter @mivend/storefront dev` directly** unless explicitly debugging a single component in isolation — and even then, kill the process immediately after.
- **If you started a background process manually, kill it before the session ends.** Track PIDs and clean up with `kill <PID>` or `pkill -f <pattern>`.
- **`make dev` is not idempotent by design** — running it twice creates duplicate `tsc --watch` processes. Before calling `make dev`, verify no dev processes are already running: `pgrep -f "ts-node-dev|tsc -b|tsc --watch|vite" | wc -l`. If non-zero — stop with `make down` and kill leftover node processes first.
- **`make up`** only starts Docker infrastructure (postgres, redis, rabbitmq, elasticsearch). It is safe to call repeatedly.

---

## What not to do

- Do not add error handling for scenarios that cannot happen.
- Do not add feature flags for things that are not yet planned.
- Do not create helper utilities "just in case."
- Do not wrap a single function call in another function just for naming.
- Do not add backwards-compatibility shims when you can just change the code.
- Do not write multi-line docstrings or comment blocks.
- **Do not hardcode business enums or type lists in code.** Use database entities instead.
- **Do not omit `"license": "GPL-3.0-or-later"` from any `package.json`.**
- **Do not put business logic in page components.** Pages are thin — use composables and stores.
- **Do not write raw GraphQL strings with manual types.** Use codegen.

## Project context maintenance

When the user asks to summarize results, preserve context, prepare context for a new chat, update project memory, or says similar phrases, use the project-context skill.

The goal is not only to continue the current task, but to maintain a compact global project context for future new tasks.

Update:

- `docs/ai/PROJECT_CONTEXT.md`

This file must describe:

- what this project is;
- what has already been implemented;
- current architecture and important decisions;
- planned next work;
- implementation nuances;
- known problems and limitations;
- commands and checks that are important for future work.

Keep it concise and useful for a new Claude Code chat.

Do not dump long logs or full diffs into the context file.

## Mandatory final checks

After changing code, tests, package files, build config, lint config, TypeScript config, CI config, or project scripts, use the final-check skill before reporting completion.

The default final checks are:

    make lint
    make test

Do not claim the task is complete until these checks are run successfully or explicitly skipped with a reason.

## Final audit — separate session, after implementation

Once an issue (or a non-issue task — cleanup, refactor, documentation pass) is implemented and
the checks above pass, run a **final audit in a separate chat session**, not the one that did the
implementation — a fresh session/context catches things a session that just wrote the code is
prone to rationalize away. This project's own convention for naming that session:
`<project>.audit.<issue-number-or-short-description>` (e.g. `mivend.audit.68`, or
`mivend.audit.cleanup-nginx-configs` for work with no issue number) — mirrors the working
session's own `<project>.<issue-number-or-description>` naming. The audit session's own name
varies per task, so don't assume a fixed one; ask, or check recently-active sessions, if you need
to hand off to it and don't already know its name. Report the audit's findings back to the
implementation session/user; fix anything it flags before considering the work done.
