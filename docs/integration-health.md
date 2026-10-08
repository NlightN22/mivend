# Integration health (dashboard page and runbook)

Dashboard page: **System -> Integration health** (permission `ManageErpIntegration`, central hub
only). Two tabs, each with a standard refresh icon above the table. Issue #195.

## Inbound tab

One row per stream. Rows are the union of the event contract (`@nlightn22/event-contracts`,
installed version shown on top), the configured Kafka topics, and anything seen in the inbox or the
lag poller, so a quiet stream still shows with zeros.

| Column                           | Meaning                                                                                                        |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Contract / Consumed              | Stream exists in the contract / mivend consumes it (`Ignored` = deliberately not consumed, reason as tooltip) |
| Kafka lag                        | Broker-side lag at the last scheduled poll (every minute). Dash = no poll data yet, `0` = caught up. Click to expand partitions. Over 1000 is red |
| Pending / Processing             | Inbox rows already read from Kafka and committed, waiting for / being handled by the mivend worker              |
| Failed                           | Dead-lettered inbox rows, including unprocessable Kafka messages (see "Failed rows" below)                       |
| No-op (24h)                      | Messages a handler deliberately did nothing for, or applied only in part, in the last 24 h (reason as tooltip): processed with `outcome = noop`, not dropped silently |
| Oldest                           | Age of the oldest pending inbox row; growing means the worker is not keeping up                                 |

Kafka lag and inbox backlog are different numbers and are expected to disagree.

### Drift

A red row with a message appears when:

- `NOT_CONSUMED`: stream is in the contract, not consumed, not ignored. Add a handler, or add it to
  `ignored-contract-streams.ts` with a real reason.
- `NOT_IN_CONTRACT`: stream is consumed but missing from the installed contract (stale or renamed).
- `UNKNOWN_STREAM`: inbox rows or lag data exist for a stream that is in neither the contract nor config.

The same check runs in CI as a unit test (`contract-streams.test.ts`): bumping the contract package
fails the build if a new stream is neither consumed nor ignored. Contract stream names are derived
from the package's exported `*Schema` names (`stream-health.ts`, `contract-streams.ts`).

### Contract version drift

The banner compares the installed contract version with the latest published one: red when
behind, neutral when it could not be checked (no token, or registry unreachable). The lookup is
cached for one hour.

**Registry token.** Set `EVENT_CONTRACTS_REGISTRY_TOKEN` (a read-only package-registry token with
`read:packages`) in the contour's env file, e.g. `apps/server/.env.central.staging-integration`
(gitignored; template: the `.example` next to it), then restart the contour. It is read at server
start. The developer's own token for `pnpm install` lives in `~/.npmrc`; the server does not read
that file, so copy the value into the env file instead. Use a dedicated read-only token on
production, not a personal one. Without it the page still works and shows "could not be checked".
`make check-event-contracts` does the same comparison from a developer machine.

## Outbound tab

Events mivend wrote to its outbox for Integration Service, one row per registered event type
(`outbound-event-types.ts`, so a type with no events still shows, with zeros): pending, failed,
skipped, age of the oldest pending, last publish time, last publish error or skip reason. The
`published` and `resolved` statuses are not shown as columns (a published row is the healthy end
state; `resolved` is a skipped row that was rebuilt). Inbox rows have their own `replay_requested` and
`resolved` statuses, see "Replay lifecycle".

Two dashboard alerts fire on any non-zero `failed` and any non-zero `skipped`.

### Outbound schemas (issue #203)

`order.submitted` is currently the only outbound event. It is owned by mivend: mivend writes and
changes its schema and submits it to the shared package repository, and the receiving side reviews
and releases it. One shared package, `@nlightn22/event-contracts`, carries both directions
(producer-owned events). Compatible changes (a new optional field, a new event type) are made by
the owner alone; breaking changes need the consumer's agreement and a version bump.

- **Where the schema comes from.** If the installed package exports `ORDER_SUBMITTED_JSON_SCHEMA`,
  mivend reads it from the package; otherwise it uses the local copy
  (`erp-integration/src/schemas/order-submitted.schema.ts`). The Outbound tab's **Schema** column
  shows which: `Contract` (package) or `Local copy` (not yet from the shared package). The local
  file is deleted once the package version that contains the schema is released and installed.
  State at the time of writing: the schema is prepared in the package repository but not released
  (planned 0.53.0), so the column shows `Local copy`.
- **Registry compatibility.** The subject `order.submitted-value` is explicitly `FORWARD`. The
  registry default (`BACKWARD`) rejected every publish with a 409 once an optional field was added.
- **The wire format is part of the contract:** Confluent wire format (magic byte, schema id, JSON
  payload). A receiver that parses plain JSON drops such messages; the receiving side fixes this
  (and keeps unparsable messages durably). Until that fix is deployed, a successful publish on
  mivend's side does not prove the receiver processed the event.
- The Schema column is the only schema-drift indicator planned for this page.

## Failed rows: what they are and what to do

### Inbound (`integration_inbox_event`, status `failed`)

- Every handler error retries with exponential backoff (30 s base, capped at 30 min, +-20% jitter).
  A row is dead-lettered (`failed`) only when 24 h have passed since its first failure.
- A `failed` row is never retried automatically and is never purged: it stays until someone acts.
  Only superseded `processed` rows are tombstoned by retention.
- Look at them on the page **System -> Inbox issues** (also reached by clicking the Failed or No-op
  number in the Inbound table, which opens the list pre-filtered by stream): stream, entity id with
  a copy button, attempts, first failure, last error, plus search and sorting. Payloads are never
  shown. SQL fallback: `SELECT stream, entity_id, attempts, first_failed_at, last_error FROM
  integration_inbox_event WHERE status = 'failed' ORDER BY updated_at DESC`, or the admin GraphQL
  query `failedIntegrationInboxEvents` (needs `ManageAccessControl`).
- Triage by `last_error`:
  - missing dependency (parent entity never arrived): usually fixes itself once the parent is
    replayed; replay the failed entity afterwards;
  - handler bug or contract mismatch: needs a developer fix, then replay;
  - external resource (for example an expired photo download link): replay.
- Recovery is a replay through Integration Service (`POST /api/resync/v1/replay`, see
  `docs/ai/erp-streams-map.md`); the entity arrives as a new event. The **Replay** button on the
  Inbox issues page (needs `RecoverIntegrationEvents`) does it for one row and moves it to
  `replay_requested` (see "Replay lifecycle" below); it is shown only for streams that map onto an Integration Service aggregate type
  (`stream-aggregate-type.ts`; `vat-rate` is excluded: Integration Service generates it itself).
  `NOT_FOUND` or a failed call means Integration Service did not accept the replay: the row stays
  `failed` with `replay did not resolve: ...` in `last_error`.
  Photos also have a built-in automatic recovery.
- Sysadmin: do not edit the table. Report stream, entity id and `last_error` to a developer.

#### Replay lifecycle (`failed` -> `replay_requested` -> `resolved`)

Accepting a replay request proves nothing about the data, so the row is not closed by it:

1. **Replay** claims the row atomically (`failed` -> `replay_requested`, `replay_requested_at` set)
   and only then asks Integration Service, so two clicks ask once. If the request is not accepted
   the row goes back to `failed`. A `replay_requested` row cannot be replayed again.
2. The replayed entity arrives as a new inbox row. In the same SQL statement that marks that row
   `processed` (`IntegrationInboxService.markProcessed`), every `replay_requested` row of the same
   stream and entity requested before the new row was created becomes `resolved`. Any recorded
   processed outcome closes it: `applied`, `superseded`, and a reasoned `noop` (a noop is a
   deliberate, documented result for the replayed event, for example a tombstone for a row mivend
   never had; a retrying event is not processed yet and does not close it).
3. The row goes back to `failed` (annotated `replay did not resolve: <reason>`) when the replayed
   event is dead-lettered (same hook in `markFailed`), or via the sweep task
   `erp-integration-inbox-replay-sweep` (every 5 min) when the newer event already ended `failed`,
   or when no newer event is pending/processing after `REPLAY_WAIT_TIMEOUT_MS` (1 h). While the new
   event is still retrying the row keeps waiting.
4. Every transition is one conditional UPDATE on `status = 'replay_requested'`, so the sweep and the
   processor racing for a row produce exactly one terminal state.

The Inbound table shows the red Failed badge for open failed rows and, next to it, a muted badge
with a refresh icon for `replay_requested` rows (tooltip "replay requested, waiting for the entity
to be processed"); both link to the Inbox issues list filtered by that status.

### Unprocessable Kafka messages

A message with no value, undecodable bytes, or no `entityId`/`eventId` cannot be retried into
validity. The consumer writes it to the inbox as a `failed` row (reason in `last_error`, raw
payload kept, synthetic ids `rejected@<partition>:<offset>` so a redelivery of the same offset is a
no-op) and then commits the offset. It shows in the Failed count and is never claimed for
processing. If the write itself fails the consumer rethrows, the offset is not committed and the
message is redelivered, so nothing is lost silently. Triage like any other failed row; there is
usually nothing to replay, the fix is on the producer side.

### Inbound outcomes (`outcome`, `outcome_reason`)

Every handler returns an outcome on every path (`apply()` returns `Promise<InboundOutcome>`; a bare
`return` does not compile). `inboundApplied()` is stored as `applied`; `inboundNoop(reason)` as
`noop`. `noop` covers two cases, always with a reason: nothing was applied (a tombstone for a row
mivend never had, a missing required field, no target mapping yet), or the message was applied
except for a deliberately skipped part (for example order lines without a `productId`). A row
whose version is older than one already processed is stored as `superseded`. Rows processed before
the column existed have `outcome = null`.
A stream with a high No-op (24h) count is dropping data and needs a look at the reason. A
`counterparty` no-op about the manager and a `product` no-op about its unit are not data loss: both are
soft links, the entity itself was applied. The manager id may reference a user group that is never
published (assignment stays empty); a missing unit is filled in when the unit arrives. The Inbound
tab shows "N of M variants reference a unit that has not arrived" (`variantUnitHealth`).
Escalating "missing required field" no-ops to `failed` (dead-letter) is a per-stream decision
left open.

### Outbound (`integration_outbox`)

Statuses: `pending`, `published`, `failed` (publish gave up), `skipped` (event could not be
built), `resolved` (a skipped row whose event was rebuilt).


- Publish failures retry with the same policy as the inbox (`computeRetryBackoffMs`,
  `RETRY_BACKOFF_*` constants): exponential backoff (30 s base, 30 min cap, +-20% jitter),
  dead-lettered (`failed`) only 24 h after the first failure, so a broker outage does not drop
  events. `failed` is terminal until requeued. The old `maxRetry` option (5 attempts) no longer
  exists.
- The sweep takes each due row under `FOR UPDATE SKIP LOCKED` in its own short transaction and
  publishes while holding that lock on purpose (serialized per row): two sweeps never publish the
  same row, and a requeue waits for the sweep instead of being overwritten.
- Requeue: admin mutation `requeueFailedIntegrationOutbox(ids)` (1 to 500 numeric ids; needs
  `RecoverIntegrationEvents`) returns failed rows to `pending` with a fresh retry state. Safe: the receiver
  deduplicates by `event_id` (see "Receiver deduplication" below); a requeued row keeps its
  `event_id`.
- Skipped: the event could not be built (for example a line has no `organizationId`); the row
  holds the subject (`orderId`, `orderCode`) and the reason. After fixing the cause, call
  `rebuildSkippedIntegrationOutbox(id)` (needs `RecoverIntegrationEvents`): it rebuilds from the
  order, queues the event and marks the skipped row `resolved`. Result enum `RebuildSkippedOutcome`:
  `QUEUED`; `STILL_SKIPPED` (reason updated, also when the builder threw: the error is recorded on
  the row and rethrown); `ALREADY_SENT` (a pending/published row already carries the same subject,
  matched by the registry's `subjectKey`, `orderId` for `order.submitted`).
- **System -> Outbound problems** lists failed and skipped outbox rows (event type, subject id such
  as the order id, status, retries, last error); the Failed and Skipped numbers of the Outbound tab
  link to it pre-filtered. **Requeue** (failed rows) and **Rebuild** (skipped rows) call the
  mutations above and are shown only with `RecoverIntegrationEvents`. Raw payloads are never shown.
- Sysadmin: the alerts fire on any `failed` or `skipped`; report event type and reason to a
  developer.

### Receiver deduplication (verified in the Integration Service source, read-only)

- The order-submitted consumer inserts the message into its inbox with the unique key
  (source system, entity type, `entityId` = mivend's `eventId` from the payload, constant version)
  and `ON CONFLICT DO NOTHING`; the command built from it reuses the same `eventId` under a second
  unique key. A redelivered or requeued event with the same `event_id` is a no-op on both layers.
- It does not deduplicate by order: a new event id for the same order is a new command. This is why
  rebuilding a `skipped` order checks for an existing event by `orderId` first and why a human must
  never create a second event for an order that was already sent.
- Producer side: the Kafka message key is the `event_id`, the producer is idempotent.
- Not verified: only the repository source and a local build were read, not the deployed instance.
  The consumer parses the raw message as JSON, while mivend sends the Confluent wire format (magic
  byte + schema id + JSON); the source shows no step that strips that header. Check on the real
  instance that `order.submitted` is actually accepted before relying on delivery (an unparsable
  message is logged and skipped there without a record).

## Principles (apply to every inbound and outbound integration flow)

1. **mivend data is the source of truth.** A failure to deliver an event to the external system is
   a delay, not a data loss: the order, reservation or payload stays in mivend.
2. **Two stages, two failure kinds.** Outbound: (a) building and recording the event
   (`pending`/`skipped`), (b) publishing it (`published`/`failed`). A skip happens in (a) and
   leaves a `skipped` row; a `failed` row happens in (b) after 24 h of retries.
3. **No silent drops.** Every event ends in a recorded state with a reason: outbound
   `pending | published | failed | skipped`; inbound `processed` (outcome `applied`, `noop` with a
   reason, or `superseded`), `retrying` or `failed` (including unprocessable Kafka messages). A bare
   `return` that only logs is a defect; for inbound handlers it does not compile.
4. **Every non-success state is retryable.** `failed` returns to `pending`; `skipped` is rebuilt
   from the source data once the cause is fixed. Retrying a `failed` row keeps its `event_id`, so
   the receiver's dedup makes it safe; a rebuilt `skipped` order gets new event ids, so mivend
   itself must refuse to rebuild an order that already has an event (`ALREADY_SENT`).
5. **Everything is visible.** The Integration health page shows all states; a non-zero `failed` or
   `skipped` is alertable.
6. **Enforced by structure, not by discipline.** The outbound gateway and the typed inbound
   outcome own all recording; a type registry feeds the page; a lint rule forbids direct outbox
   writes and direct Kafka publishing outside the gateway; a test per skip path proves a record is
   left. Guidance lives in the `external-integration-rules` skill and `docs/testing-patterns.md`
   ("Silent drop").

## Architecture (issue #200)

- **Outbound gateway** (`outbound-gateway.ts`): the only place outbound events are recorded. A
  producer calls `enqueue({ eventType, subject, build })`; `build` returns `outboundSend(events)`
  or `outboundSkip(reason)` (nothing-to-send is not expressible). Pending rows are written in one
  transaction; a skip leaves a `skipped` row with the reason. A skip recorded inside a caller's
  transaction commits or rolls back with it (the business write it describes goes the same way). A
  builder error is recorded on its own connection, so the `skipped` row survives the caller's
  rollback, and is then rethrown.
  `order.submitted` is the first producer (`order-submitted.builder.ts`); an order is sent whole
  or skipped whole.
- **Registry** (`outbound-event-types.ts`): every outbound type; `Record<OutboundEventType, ...>`
  maps (schemas, rebuilders) fail to compile until a new type is filled in.
- **Lint** (`eslint-rules/no-direct-outbound.js`, namespace `outbound/`, tests in
  `eslint-rules/__tests__`): an error to reference `IntegrationOutboxService`,
  `KafkaProducerService` or `IntegrationOutboxEntry` (named, default or namespace import, re-export,
  dynamic `import()`, `require`, by file path or through `@mivend/plugin-erp-integration`), or to
  write `INSERT INTO` / `UPDATE` / `DELETE FROM integration_outbox` in a string. Exempt: the
  gateway, the outbox services, the plugin module, tests and migrations. Not covered: a table name
  assembled at runtime. The three classes are no longer exported from the package index.
- **Inbound**: the inbox row is the record; `apply()` returns an `InboundOutcome` on every path and
  the processor stores it (see "Inbound outcomes"). Early returns in `onApplicationBootstrap`
  guards (`instanceType !== 'central'`, Kafka disabled) are configuration, not event drops, and are
  exempt from the "every early return records an outcome" audit rule.
- **Tests**: "Silent drop" pattern in `docs/testing-patterns.md`; examples
  `outbound-gateway.int.test.ts`, `outbox-recovery.int.test.ts`,
  `integration-inbox-processor.int.test.ts`.

Known gaps: the outbox event is still written on `OrderReservedEvent` (after the reservation
committed), not in the order's own transaction, so a crash between the two leaves no row and no
record; a sweep for "reserved order without any outbox row" is not built. Inbound "missing
required field" no-ops are recorded but not dead-lettered. `plugin-sync`'s own hub-to-branch
outbox is not covered. Drill-down pages for failed/skipped rows, Replay and Requeue buttons are a
separate follow-up.
