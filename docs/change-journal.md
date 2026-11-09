# Change journal (#323)

One table, `change_journal_entry`, records who changed which entity, when, and what changed.
Plugin: `packages/plugins/change-journal`.

## What is recorded

`ChangeJournalSubscriber` is a TypeORM subscriber on every entity. For each `insert`, `update`,
`soft-remove`, `recover` and `remove` of a journaled entity it writes one row with the change's own
`EntityManager`, so the entry commits and rolls back with the change (`docs/concurrency.md`). A
failing journal write fails the change; nothing is skipped silently.

| Field | Meaning |
| --- | --- |
| `entityType`, `entityId`, `entityUuid` | TypeORM entity name, primary key (`a:b` for composite keys), `uuid` column when the entity has one |
| `action` | `insert`, `update`, `soft-remove`, `recover`, `remove` |
| `changes` | `{ field: { before, after } }`. Insert: every set column (`after`). Update: only changed columns and relations (relations as ids). Remove: the last values (`before`). `createdAt`/`updatedAt`/version columns are left out; an update that changes nothing writes no entry |
| `actorType` | `administrator`, `customer`, `acting`, `system` |
| `userId`, `administratorId` | the signed-in user; the administrator (for `administrator`) or the acting administrator (for `acting`, where `userId` is the customer) |
| `source` | `admin-api:<operation>`, `shop-api:<operation>`, `<api>-api:rest:<METHOD> <route>`, `scheduled-task:<task id>` or `background` |
| `requestId`, `sessionId` | one id per request or task run (groups the entries of one operation); the Vendure session id |
| `occurredAt` | `timestamp`, UTC like every other timestamp (`apps/server/src/pg-utc.ts`) |

Values longer than 4000 characters are truncated; binary values are stored as their size.

## Actors

`ChangeJournalInterceptor` (global) puts the request into an `AsyncLocalStorage` scope that the
subscriber reads; there is no other way from a TypeORM subscriber back to the `RequestContext`.
The actor is resolved when the first write of the request happens, so a sign-in inside the
request is attributed to the signed-in user.

- Admin API with a user: `administrator` (`administrator.userId` lookup).
- Shop API with a user: `customer`, or `acting` when the session is an acting session
  (`ActingContextService`, the same source the acting-session plugin uses).
- No user (ERP import REST endpoint, sign-in before the session exists): `system`, `source` names
  the route.
- Every scheduled task (all plugins, Vendure core included) runs inside a `system` scope with
  `source = scheduled-task:<id>`. The ERP inbox lanes therefore show as
  `scheduled-task:erp-integration-inbox-*`. `ChangeJournalPlugin` must stay after every plugin that
  registers a task in `vendure-config.ts`.
- Anything else (job-queue jobs, bootstrap provisioning): `system` with `source = background`.

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
that it changed, never a value. This covers password hashes, verification and reset tokens, TOTP
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
- `repository.insert()` and `repository.upsert()` fire an insert event: an upsert (used by several
  ERP stream handlers) is recorded as `insert` with the written values, also when it updated an
  existing row, and carries no before values.
- Before values need the loaded row: `save()` loads it, so updates through `save` carry both
  sides; an update event without it records `after` only.
- Field-level redaction (`requiresPermission` custom fields, e.g. purchase or floor prices) is not
  applied to `changes`: a `ReadChangeJournal` holder with counterparty scope `all` reads those values
  in product/variant entries. The permission is given only to leadership roles for that reason.
- `ManyToMany` join tables are not journaled (no entity events).
- Volume: every journaled ERP stream save (products, prices, points) writes one extra row in the
  same transaction. Retention bounds the table; `StockLevel` is excluded for this reason.
- The manager-portal "History" tab is not built yet (follow-up); the API above is what it will use.
