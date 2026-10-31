# Data-drift reports from external systems (issue #303)

Each external system checks itself against the source of truth and publishes a read-only drift
report. mivend does not re-verify their data: it polls the reports, stores them, and shows
administrators one list. This is separate from the #84 count reconciliation
(`erp_reconciliation_issue`), which stays unchanged.

Provider contract: the provider's `consistency-openapi.yaml` (`GET /v1/consistency/summary` and
`GET /v1/consistency/issues`). Only the search-service source is implemented; adding a source is
one more entry in `consistencySources` (base URL, key, provider check schedule), no new adapter.

## Where it lives

`packages/plugins/erp-integration/src/consistency/`.

- Tables `consistency_report` (one row per source + provider issue id) and `consistency_source_state`
  (last summary, health, poll watermark per source). Both have an immutable `uuid`; a report also has a
  numeric `number` from a database sequence, a reference for people only.
- Poll task `erp-integration-consistency-poll`, every 5 minutes (central hub only, nothing runs
  without a configured source). Retention task `erp-integration-consistency-retention`, daily.

## Polling rules

- Per source: fetch the summary, then page `issues?status=all&since=<watermark>` by cursor until
  `nextCursor` is null. A repeated cursor or more than 400 pages ends the run as an invalid response.
- Upsert is `INSERT ... ON CONFLICT (source, provider_issue_id) DO UPDATE ... WHERE stored
  last_detected_at <= incoming`, so a repeated or late page is harmless and a re-detected issue
  appears twice across pages without duplicating. A resolved id that reappears is reopened in place.
  Resolved reports stay as history until retention deletes them.
- The watermark (max `lastDetectedAt`) is saved only after a fully paged run, and sent as the
  inclusive `since` next time, so nothing is skipped.
- Expected/actual are stored as the provider sent them. For stock the provider's `quantity` is
  mivend's `stockOnHand` and its `availableQuantity` is `erpAvailableQuantity`; `available` follows
  the provider's single availability rule and may be higher than mivend's free quantity.

## Source health (computed by mivend)

| Health | Cause |
| --- | --- |
| `unreachable` | network error, timeout, 5xx |
| `unauthorized` | 401 or 403 (key rejected or missing the `consistency:read` scope) |
| `no-check-yet` | 503 `{"error":"no-check-yet"}` |
| `stale` | `lastCheck.finishedAt` older than 3x the provider check schedule (a running check uses the last known finish, else its start) |
| `invalid-response` | 400, malformed body, looping cursor |
| `rate-limited` | 429; recorded only, not an issue (the next poll retries) |

Every state except `ok` and `rate-limited` is stored as one report of type `report-unavailable`
(`entityType` `source`, severity `warning` for `no-check-yet`, otherwise `critical`). It is resolved
when the source is healthy again and reopened (occurrences + 1) if it fails again.

## Reading

Admin GraphQL, permission `ManageErpIntegration` (the existing read-only integration health
permission; no new permission and no per-type restriction, so `input-anomaly` reports are visible
to every holder of it). No mutations: nothing here writes to another system or triggers a replay.

- `consistencyReports(options)`: paginated, filters `source`, `status`, `type`, `severity`,
  `entityType`, newest detection first, `take` capped at 100.
- `consistencySources`: per source health, last provider summary (check state, stream lag, provider
  counts) and local open counts by type and severity. Empty when no source is configured.

## Configuration

Env table: `docs/environments.md`, "Data-drift report sources". Tests use synthetic provider
payloads only and never contact a real provider.
