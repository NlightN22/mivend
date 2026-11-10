# Change journal (#323)

**Scope of completeness: the journal records changes made through TypeORM entity operations
(`save`, `insert`, `upsert`, `remove`, `softRemove`, `recover`). It is not a record of every row
change: query-builder updates/deletes and raw SQL bypass it (see Known limits), and changes
from the ERP integration are skipped by design (see below).**

One table, `change_journal_entry`, records who changed which entity, when, and what changed.
Plugin: `packages/plugins/change-journal`.

## What is recorded

`ChangeJournalSubscriber` is a TypeORM subscriber on every entity. For each `insert`, `update`,
`soft-remove`, `recover` and `remove` of a journaled entity it writes one row with the change's own
`EntityManager`, so the entry commits and rolls back with the change (`docs/concurrency.md`). A
failing journal write fails the change.

## Changes from the ERP integration are not journaled (owner decision 2026-11-10)

The journal records our own changes: staff, customers, acting sessions and our own background
tasks. Changes that arrive from the ERP integration are skipped on purpose; this replaces the
earlier issue wording "ERP stream recorded as a system actor". The skip is decided by the source
of the change, not by the entity, so an entity edited by both the ERP and our staff (product,
trading point, counterparty) keeps the staff edits and drops the ERP ones. The source counts as
integration when it is (`change-journal-sources.ts`):

- a scheduled task whose id starts with `erp-integration-` (every inbox lane, reconciliation,
  recomputes, outbox) or `sync-` (`sync-erp-poll`, `sync-outbox`), or
  `external-order-counterparty-reconcile`;
- a REST route under `/erp/` (ERP import, ERP callbacks, ERP order status, Kafka status);
- a RabbitMQ message handled by the sync plugin (`runAsIntegration` around its consumer).

A staff action in the Admin API that touches ERP-owned data (for example a manual inbox replay)
is still journaled, because the request is ours. No ERP mirror entity is excluded by name: with
the source rule they get no ERP entries anyway, and a staff edit of them stays visible. A new
integration entry point must call `runAsIntegration` (or use one of the prefixes above), otherwise
its writes show up as `background`.

| Field | Meaning |
| --- | --- |
| `entityType`, `entityId`, `entityUuid` | TypeORM entity name, primary key (`a:b` for composite keys), `uuid` column when the entity has one |
| `action` | `insert`, `update`, `soft-remove`, `recover`, `remove` |
| `changes` | `{ field: { before, after } }`. Insert: every set column (`after`). Update: only changed columns and relations (relations as ids). Remove: the last values (`before`). `createdAt`/`updatedAt`/version columns are left out; an update that changes nothing writes no entry |
| `actorType` | `administrator`, `customer`, `acting`, `system` |
| `userId`, `administratorId` | the signed-in user; the administrator (for `administrator`) or the acting administrator (for `acting`, where `userId` is the customer) |
| `source` | `admin-api:<operation>`, `shop-api:<operation>`, `<api>-api:rest:<METHOD> <route>`, `scheduled-task:<task id>` or `background` |
| `requestId`, `sessionId` | one id per HTTP request (shared by every operation of a batched GraphQL request) or per task run; the Vendure session id |
| `occurredAt` | `timestamp`, UTC like every other timestamp (`apps/server/src/pg-utc.ts`) |

Values longer than 4000 characters are truncated; binary values are stored as their size; NUL
characters are removed (jsonb rejects them); a value that cannot be serialized (a cyclic object)
is stored as `[unserializable]`, so the journal never fails an otherwise valid save.

## Actors

`ChangeJournalInterceptor` (global) puts the request into an `AsyncLocalStorage` scope that the
subscriber reads; there is no other way from a TypeORM subscriber back to the `RequestContext`.
The actor is resolved when the first write of the request happens, so a sign-in inside the
request is attributed to the signed-in user.

- Admin API with a user: `administrator` (`administrator.userId` lookup).
- Shop API with a user: `customer`, or `acting` when the session row carries an acting
  administrator (the same columns `ActingContextService` reads).
- Both lookups run on the writing transaction's own connection (the subscriber's `event.manager`),
  never on a second pool connection, and are memoized per request.
- No user (sign-in before the session exists, a non-ERP REST route): `system`, `source` names
  the route.
- Every scheduled task (all plugins, Vendure core included) runs inside a `system` scope with
  `source = scheduled-task:<id>`; integration tasks run in a scope that is not journaled.
  `ChangeJournalPlugin` must stay after every plugin that registers a task in `vendure-config.ts`.
- Anything else (job-queue jobs, bootstrap provisioning): `system` with `source = background`.

## Volume (estimate, 2026-11-10)

Measured on the staging-integration database (real ERP data; SELECT only): about 54k products,
54k variants, 213k price entries, 26k counterparties, 36k contracts, 4k trading points, 1.5M
retained inbox events. With the ERP skip, a first full load and every re-export write no entries.
What remains is human and our own background activity: carts and orders (each cart change saves
`Order`/`OrderLine`), staff edits, sign-ins (`User.lastLogin`), reservations, settlements and
cleanup tasks. One entry costs roughly 0.4-1.2 KB (row JSON 200-900 B plus the fixed columns and
two indexes), so even 100k entries a day stay near 40 GB a year at the high end and usually far
less. The cleanup removes up to 1M rows per hourly run (200 x 5000), far above that rate.

Further reduction if it is ever needed: `ChangeJournalPlugin.init({ excludedEntities: [...] })`
drops whole entity types (no code change), or a shorter retention (a code constant).

## Exclusions

Every registered entity is in exactly one of `JOURNALED_ENTITIES` or `EXCLUDED_ENTITIES`
(`change-journal-scope.ts`); `apps/server/src/__tests__/unit/change-journal-coverage.test.ts`
fails on a new entity in neither list. The subscriber journals any entity not excluded, so an
entity missed in both lists is journaled by default. Excluded, with the reason kept next to each
name in code:

- the journal itself;
- sessions and one-time tokens: `Session`, `AnonymousSession`, `AuthenticatedSession`,
  `ActingTicket`, `TwoFactorToken`, `OidcAuthRequest`, `OidcSessionToken`; plus `KnownDevice`
  and the `SignInThrottle` counter;
- queue, transport and idempotency bookkeeping: `JobRecord`, `ScheduledTaskRecord`,
  `SyncOutboxEntry`, `SyncProcessedEvent`, `IntegrationOutboxEntry`, `IntegrationInboxEvent`,
  `IncomingPaymentEvent`, `IdempotencyKey`, `KafkaConsumerStatus`, `KafkaConsumerLagEntry`,
  `BulkBatch`, `BulkBatchItem`;
- projections and computed results: `DiscountRegistryEntry`, `ConsistencyReport`,
  `ConsistencySourceState`, `ErpReconciliationIssue`, `CheckResult`, `CheckStaleRequest`,
  `OrderCheckFailure`, `Notification`;
- `StockLevel`: the ERP stock mirror, rewritten by every stock event;
- tables that are already histories: `StockMovement` and its subtypes, `HistoryEntry` and its
  subtypes, `OrderStatusHistoryEntry`, `EntityVersion`, `CheckPolicyHistory`.

## Redaction

A column whose name contains one of the tokens `password`, `passwd`, `secret`, `token`, `hash`,
`salt`, `totp`, `otp`, `recovery`, `credential(s)`, `apiKey`, `privateKey` (camelCase, snake_case
and custom-field paths are split into tokens) is stored as `{ "redacted": true }`: the entry shows
that it changed, never a value. The same word rule applies to keys nested inside JSON values
(payment metadata, handler arguments, settings-store values): such a key keeps its place with the
value `[redacted]`. This covers password hashes, verification and reset tokens, TOTP
secrets, API key hashes and token hashes. A new secret column must use one of these words.

## Reading

Admin API, permission `ReadChangeJournal` (department-head, general-director, security-officer,
portal-admin; superadmin implicitly):

- `changeJournalForEntity(entityType, entityId, skip, take)`: newest first, `take` at most 100. The
  scope rule is the one of entity history (`EntityVersionScopeRegistry`, `docs/access-control.md`
  "Scope guards on permission-only reads"): `Counterparty`, `TradingPoint` and `VisibilityGrant`
  follow their registered rules, every other entity type is visible only with counterparty scope
  `all`. A hidden entity returns an empty page, like a missing one.
- `changeJournal(filter, skip, take)`: entity type, actor type, user, administrator and time range,
  newest first. Rows of many entity types cannot be scoped in SQL, so this list is served only to
  counterparty scope `all`; everyone else gets an empty page.

Indexes: `(entityType, entityId, occurredAt)` for the per-entity history, `occurredAt` for the
list and the cleanup.

## Retention

Scheduled task `change-journal-cleanup` (hourly) deletes entries older than 365 days
(`RETENTION_DAYS_DEFAULT`; `ChangeJournalPlugin.init({ retentionDays })` overrides it in code, there is
no environment variable). It deletes in batches of 5000 rows, each one statement
(`FOR UPDATE SKIP LOCKED`, so parallel runs split the work), at most 200 batches per run; a larger
backlog takes more runs. It is idempotent and only ever touches rows past the cutoff.

## Known limits

- **Bulk query-builder writes and raw SQL are not journaled.** TypeORM calls subscribers only for
  entity operations (`save`, `insert`, `remove`, `softRemove`, `recover`). `repository.update()`,
  `repository.delete()`, `createQueryBuilder().update()/delete()` and `query('UPDATE ...')` either
  fire no event or fire one without the row identity; such writes are skipped. The code base uses
  them in many places (atomic counters, `ctxQuery` writes such as the acting trading point and the
  preferred trading point self-heal, many reservation and settlement updates), so the journal is
  complete for entity saves only, not for every row change. The subscriber integration test pins
  this gap.
- `repository.insert()` and `repository.upsert()` fire an insert event: an upsert is recorded as
  `insert` with the written values, also when it updated an existing row, and carries no before
  values.
- Before values need the loaded row: `save()` loads it, so updates through `save` carry both
  sides; an update event without it records `after` only.
- Field-level redaction (`requiresPermission` custom fields, e.g. purchase or floor prices) is not
  applied to `changes`: a `ReadChangeJournal` holder with counterparty scope `all` reads those values
  in product/variant entries. The permission is given only to leadership roles for that reason.
- `ManyToMany` join tables are not journaled (no entity events).
- Volume: every journaled save writes one extra row in the same transaction; ERP stream saves are
  skipped by source (above).
- The manager-portal "History" tab is not built yet (follow-up); the API above is what it will use.
