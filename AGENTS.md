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

- Code, variable names, comments, GraphQL fields, entity names, migration files: **English only.**
- Chat, commit messages, PR descriptions, human-readable docs: **Russian.**

---

## Monorepo structure

```
mivend/
├── apps/
│   ├── central/              # Central hub Vendure instance
│   └── branch/               # Branch Vendure instance (one per location)
├── packages/
│   ├── plugins/              # Vendure plugins — one package per plugin
│   │   ├── reservation/
│   │   ├── customer-pricing/
│   │   ├── credit-terms/
│   │   ├── cross-reference/
│   │   ├── search/
│   │   ├── sync/
│   │   ├── acquiring/
│   │   └── pos-api/
│   ├── storefront/           # Vue 3 + TypeScript frontend
│   ├── admin-ui/             # Vendure Admin UI extensions
│   └── shared/               # Shared TypeScript types and contracts
├── infrastructure/
│   ├── docker/
│   └── scripts/
├── docs/                     # Architecture, domain, decisions
├── AGENTS.md
├── pnpm-workspace.yaml
└── package.json
```

---

## Sync rules (non-negotiable)

See `docs/sync.md` for the full design. These rules must never be broken:

1. **Outbox pattern is mandatory.** Any data that must reach another instance is first written to
   `sync_outbox` **in the same DB transaction** as the business data. Sending directly to
   RabbitMQ without an outbox record is forbidden — it breaks delivery guarantees.

2. **Every consumer must be idempotent.** Processing the same `eventId` twice must be a no-op.
   Use a unique index on `eventId` as a hard safety net, not just application-level checks.

3. **Ack only after commit.** A RabbitMQ message is acked only after the local DB transaction
   commits successfully. Acking before write risks data loss on crash.

4. **No silent drops.** Every failure is logged, retried with backoff, and eventually routed to
   a dead-letter queue for manual inspection. `try/catch` that swallows sync errors is forbidden.

5. **plugin-sync owns RabbitMQ and the ERP adapter — nothing else touches them.**
   Other plugins publish to Vendure's `EventBus`. `plugin-sync` subscribes and handles transport.
   No other plugin imports from `plugin-sync` or references RabbitMQ directly.

6. **Branches never call the ERP.** Only the central hub communicates with the legacy ERP,
   via the `ErpAdapter` interface implemented inside `plugin-sync`.

7. **ERP is master for business data.** Price types, prices, catalog, customer core fields, and
   credit limits flow ERP → Hub → Branch and are never modified locally on branches.

8. **Reservations are never synced.** They are branch-local by design.

---

## Vendure rules

**Never modify Vendure core.** No edits to `node_modules/@vendure`. All customization is done through plugins.

If Vendure does not support something natively — build a plugin.

---

## Plugin structure

Every plugin is a standalone npm package. Every plugin follows this layout exactly:

```
packages/plugins/<name>/
├── src/
│   ├── <name>.plugin.ts      # VendurePlugin class — entry point only, no logic
│   ├── <name>.service.ts     # Business logic
│   ├── <name>.resolver.ts    # GraphQL resolvers — no business logic here
│   ├── entities/             # TypeORM entities (one file per entity)
│   ├── api/                  # GraphQL schema extensions (.graphql files)
│   └── types.ts              # Plugin-specific TypeScript types
├── index.ts                  # Public exports only
└── package.json
```

Rules:

- Plugin options are passed through the `VendurePlugin` options object — not via environment variables directly.
- Plugins communicate through Vendure's `EventBus` or public service APIs only. Never import another plugin's internal service.
- All TypeORM entities have explicit `@Column` type annotations. Never rely on TypeScript type inference for columns.
- If a service file exceeds 300 lines, split it into focused sub-services.

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

## Business data must live in the database

**Never hardcode business values in code** — no hardcoded enums, no hardcoded lists of types, statuses, categories, or any other domain data.

If it can change without a code deploy, it belongs in the database.

Examples of what must be in the database (not code):

- Price types (RETAIL, WHOLESALE, etc.) — loaded from ERP
- Reservation statuses — stored as varchar, interpreted by service layer
- Payment methods, document types, warehouse codes

Define TypeScript union types or `as const` arrays **only** for internal technical states that are truly fixed by the application logic (not by the business). When in doubt, put it in the database.

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

## What not to do

- Do not add error handling for scenarios that cannot happen.
- Do not add feature flags for things that are not yet planned.
- Do not create helper utilities "just in case."
- Do not wrap a single function call in another function just for naming.
- Do not add backwards-compatibility shims when you can just change the code.
- Do not write multi-line docstrings or comment blocks.
- **Do not hardcode business enums or type lists in code.** Use database entities instead.
- **Do not omit `"license": "GPL-3.0-or-later"` from any `package.json`.**
