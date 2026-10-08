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
| Failed                           | Dead-lettered inbox rows (see "Failed rows" below)                                                              |
| No-op (24h)                      | Messages a handler deliberately did nothing for in the last 24 h (reason as tooltip): processed with `outcome = noop`, not dropped silently |
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
skipped, age of the oldest pending, last publish time, last publish error or skip reason.

Two dashboard alerts fire on any non-zero `failed` and any non-zero `skipped`.

## Failed rows: what they are and what to do

### Inbound (`integration_inbox_event`, status `failed`)

- Every handler error retries with exponential backoff (30 s base, capped at 30 min, +-20% jitter).
  A row is dead-lettered (`failed`) only when 24 h have passed since its first failure.
- A `failed` row is never retried automatically and is never purged: it stays until someone acts.
  Only superseded `processed` rows are tombstoned by retention.
- Look at them: `SELECT stream, entity_id, attempts, first_failed_at, last_error FROM
  integration_inbox_event WHERE status = 'failed' ORDER BY updated_at DESC`, or the admin GraphQL
  query `failedIntegrationInboxEvents` (needs `ManageAccessControl`).
- Triage by `last_error`:
  - missing dependency (parent entity never arrived): usually fixes itself once the parent is
    replayed; replay the failed entity afterwards;
  - handler bug or contract mismatch: needs a developer fix, then replay;
  - external resource (for example an expired photo download link): replay.
- Recovery is a replay through Integration Service (`POST /api/resync/v1/replay`, see
  `docs/ai/erp-streams-map.md`); the entity arrives as a new event. Photos have a built-in
  recovery; other streams need the API called by hand.
- Sysadmin: do not edit the table. Report stream, entity id and `last_error` to a developer.

### Inbound no-ops (`outcome = noop`)

A handler that deliberately does nothing (missing required field, inactive/deleted entity, no
target mapping yet) returns `inboundNoop(reason)`; the processor stores `outcome` and
`outcome_reason` on the processed row (also `applied`, and `superseded` for a stale version).
A stream with a high No-op (24h) count is dropping data and needs a look at the reason.
Escalating "missing required field" no-ops to `failed` (dead-letter) is a per-stream decision
left open.

### Outbound (`integration_outbox`)

Statuses: `pending`, `published`, `failed` (publish gave up), `skipped` (event could not be
built), `resolved` (a skipped row whose event was rebuilt).


- Publish failures retry with the inbox's policy: exponential backoff (30 s base, 30 min cap,
  +-20% jitter), dead-lettered (`failed`) only 24 h after the first failure, so a broker outage
  does not drop events. `failed` is terminal until requeued.
- Requeue: admin mutation `requeueFailedIntegrationOutbox(ids)` (needs `ManageErpIntegration`)
  returns failed rows to `pending` with a fresh retry state. Safe only if the receiver
  deduplicates by `event_id` (the producer is idempotent and keys by `event_id`; Integration
  Service's own dedup is to be confirmed).
- Skipped: the event could not be built (for example a line has no `organizationId`); the row
  holds the subject (`orderId`, `orderCode`) and the reason. After fixing the cause, call
  `rebuildSkippedIntegrationOutbox(id)`: it rebuilds from the order, queues the event and marks
  the skipped row `resolved`; `still-skipped` updates the reason, `already-sent` resolves it when
  another row already carries the order.
- Sysadmin: the alerts fire on any `failed` or `skipped`; report event type and reason to a
  developer.

## Principles (apply to every inbound and outbound integration flow)

1. **mivend data is the source of truth.** A failure to deliver an event to the external system is
   a delay, not a data loss: the order, reservation or payload stays in mivend.
2. **Two stages, two failure kinds.** Outbound: (a) building and recording the event
   (`pending`/`skipped`), (b) publishing it (`published`/`failed`). A skip happens in (a) and
   leaves a `skipped` row; a `failed` row happens in (b) after 24 h of retries.
3. **No silent drops.** Every event ends in a recorded state with a reason: outbound
   `pending | published | failed | skipped`; inbound `processed | retrying | failed`, plus an
   explicit, reasoned no-op for deliberate skips. A bare `return` that only logs is a defect.
4. **Every non-success state is retryable.** `failed` returns to `pending`; `skipped` is rebuilt
   from the source data once the cause is fixed. Retrying is safe only if the receiver
   deduplicates by `event_id` (to be confirmed with Integration Service).
5. **Everything is visible.** The Integration health page shows all states; a non-zero `failed` or
   `skipped` is alertable.
6. **Enforced by structure, not by discipline.** Outbound gateway and inbound outcome recording own all recording; a type registry feeds the page; a lint rule forbids direct outbox
   writes and direct Kafka publishing outside the gateway; a test per skip path proves a record is
   left. Guidance lives in the `external-integration-rules` skill and `docs/testing-patterns.md`
   ("Silent drop").

## Architecture (issue #200)

- **Outbound gateway** (`outbound-gateway.ts`): the only place outbound events are recorded. A
  producer calls `enqueue({ eventType, subject, build })`; `build` returns `outboundSend(events)`
  or `outboundSkip(reason)` (nothing-to-send is not expressible). Pending rows are written in one
  transaction; a skip or a builder error leaves a `skipped` row with the reason.
  `order.submitted` is the first producer (`order-submitted.builder.ts`); an order is sent whole
  or skipped whole.
- **Registry** (`outbound-event-types.ts`): every outbound type; `Record<OutboundEventType, ...>`
  maps (schemas, rebuilders) fail to compile until a new type is filled in.
- **Lint** (`eslint-rules/no-direct-outbound.js`, namespace `outbound/`): importing
  `IntegrationOutboxService`/`KafkaProducerService` outside the gateway, the outbox services and
  the plugin module is an error.
- **Inbound**: the inbox row is the record; handlers return `inboundNoop(reason)` instead of a
  bare return, the processor stores the outcome.
- **Tests**: "Silent drop" pattern in `docs/testing-patterns.md`; examples
  `outbound-gateway.int.test.ts`, `outbox-recovery.int.test.ts`,
  `integration-inbox-processor.int.test.ts`.

Known gaps: the outbox event is still written on `OrderReservedEvent` (after the reservation
committed), not in the order's own transaction, so a crash between the two leaves no row and no
record; a sweep for "reserved order without any outbox row" is not built. Inbound "missing
required field" no-ops are recorded but not dead-lettered. `plugin-sync`'s own hub-to-branch
outbox is not covered. Drill-down pages for failed/skipped rows, Replay and Requeue buttons are a
separate follow-up.
