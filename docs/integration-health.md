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

Events mivend wrote to its outbox for Integration Service, one row per event type: pending,
failed, age of the oldest pending, last publish time, last error.

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

### Outbound (`integration_outbox`, status `failed`)

- The outbox worker sweeps every 5 s and dead-letters a row after 5 failed publish attempts
  (`maxRetry`). A `failed` outbox row is terminal: it is not picked up again.
- There is no UI or API to requeue it. Known risk: a broker outage of about 30 s is enough to
  dead-letter events. A developer can reset rows after the broker is healthy
  (`UPDATE integration_outbox SET status = 'pending', retry_count = 0 WHERE status = 'failed'`);
  confirm with Integration Service that duplicates by `event_id` are safe before doing it.
- Sysadmin: alert on any non-zero Failed in the Outbound tab, check the broker, report to a developer.
