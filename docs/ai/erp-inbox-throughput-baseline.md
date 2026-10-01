# erp-integration inbox — throughput baseline (2026-09-28)

Reference point for future regressions. If a future bug report says "the inbox is slow" or "X
stream isn't keeping up", compare against these numbers before assuming something new is wrong —
and re-measure the same way (below) rather than guessing from log noise alone.

Measured live on `mivend_central_staging_integration` during the real, ongoing ERP full resync
that motivated issues #145–#149 (this is real production-shaped load, not a synthetic benchmark —
numbers will differ on a smaller/idle backlog, see "Known throughput-affecting facts" below for
why).

## How to re-measure

```sql
-- t0
SELECT stream, count(*) FILTER (WHERE status='processed') AS processed, now()
FROM integration_inbox_event WHERE stream = '<stream>' GROUP BY stream;
-- wait ~60s, then t1, same query. (processed(t1) - processed(t0)) / elapsed_minutes = rows/min.
```

Needs a real backlog for that stream (`status='pending'`) to actually be draining — a stream with
zero pending rows measures 0/min trivially, that's not a regression, see `getBacklogByStream`
(admin API / integration-health dashboard) to check current backlog per stream first.

Claim-query cost specifically (not per-row processing cost): `EXPLAIN ANALYZE` the query
`findClaimCandidateIds` builds (see `integration-inbox.service.ts`) for the lane in question —
compare against the numbers in "Claim query cost" below, not against the end-to-end rows/min
number, since a plan regression and a per-row processing regression have different fixes.

## Per-stream baseline

| Stream                                                                                               | Rows/min (this measurement)                                  | Notes                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product`                                                                                            | ~220/min sustained (briefly ~300/min right after a restart)  | Was ~20/min before #149 — see "History" below. Dominant cost was two redundant category-FacetValue lookups per event, now cached (`CATEGORY_FACET_CACHE_TTL_MS`, `product.handler.ts`).                                                       |
| `price`                                                                                              | ~4,700–5,000/min                                             | No facet/category-style per-event lookup overhead — this is close to "cheap stream" ceiling for this hardware/DB.                                                                                                                             |
| `stock`                                                                                              | 0/min _in this specific window_ — not a per-row cost problem | See "Known throughput-affecting facts" — starved by `price`'s much older backlog under strict FIFO-by-`eligible_at` within the shared bulk lane, not slow itself. Resumes once `price`'s backlog empties out or ages past `stock`'s own rows. |
| `category`                                                                                           | not measured — 0 pending at measurement time (fully drained) | Re-measure next time a real category backlog exists.                                                                                                                                                                                          |
| `counterparty`, `department`, `organization`, `user`, `warehouse`, `price-type`, `vat-rate`, `offer` | not measured — negligible/zero pending at measurement time   | Low-volume streams; no evidence of a throughput problem, just never had backlog big enough to time.                                                                                                                                           |

Inbox table size at measurement time: 658MB, 417,350 total rows (all streams, all statuses) —
useful context for "does table size alone explain a slowdown" questions later.

## Claim query cost (#147/#148, not stream-specific)

- Before #147: `COALESCE(next_retry_at, created_at)` in `claimBatch`'s `ORDER BY` — no index could
  serve it at all. Full seq scan + sort every claim.
- After #147, before #148: real indexed `eligible_at` column, but a multi-stream `IN (...)` claim
  (the bulk lane) still couldn't use the index for one global order once `pending` was most of the
  table — confirmed via `EXPLAIN ANALYZE`: **~3.4s per 100-row batch** under a ~330k-row backlog.
- After #148: per-stream claim branches (one `UNION ALL` arm per stream, each a plain equality
  lookup against `integration_inbox_event_claim_pending (stream, eligible_at) WHERE
status='pending'`), merged in SQL. Confirmed: **~7ms per claim** (cold-cache first call after a
  restart was ~77ms) under the same ~330k-row backlog. **If a future claim-query change makes this
  regress back toward hundreds of ms or seconds, that's the #147/#148 bug recurring — re-run
  `EXPLAIN ANALYZE` on the generated query first, don't just add another cache or index blindly.**

## Known throughput-affecting facts (architecture, not bugs)

- **The bulk lane's claim is FIFO by `eligible_at` across _all_ its streams together**, not
  round-robin or fair-share per stream. A stream with a much older backlog (arrived earlier, so
  lower `eligible_at`) will keep winning claim slots ahead of a stream with a smaller but _newer_
  backlog, for as long as the older backlog exists — this is what happened to `stock` above,
  starved by `price`'s ~146k-row backlog. This is **expected, correct FIFO behavior** for the bulk
  lane's own design (see `INBOX_BULK_STREAMS`, `integration-inbox.scheduled-task.ts`), not a
  regression — don't "fix" it reactively without checking whether it's just this.
- **`order-registration-result` and `user` never share this contention** — they each have their
  own dedicated lane (`INBOX_ORDER_REGISTRATION_RESULT_STREAMS`/`INBOX_USER_STREAMS`, issues
  #93/#127), claimed independently of the bulk lane entirely. A slowdown in one of those two lanes
  is never explained by a bulk-lane backlog.
- **`retention` (superseded-processed-row tombstoning, #147/#148) never competes for claim slots**
  — it's a fully separate lane that only touches `processed` rows.
- **`processPendingBatch`'s `deadlineMs` (#149) can cause a batch to stop early and release rows
  back to `pending` mid-sweep** — if a stream's rows visibly bounce `pending`→`processing`→
  `pending` in quick succession without ever reaching `processed`, check
  `INBOX_RETENTION_WALL_CLOCK_BUDGET_MS`/whether that stream's own per-row cost has regressed
  (that's what pushes a batch past the deadline), not the release mechanism itself (it's working
  as designed — see the `#149 audit MEDIUM` commit).
- **Two worker processes (`worker.ts`, `worker-email.ts`) used to both run every erp-integration
  task and both join the Kafka consumer group** (fixed in #149, `isEmailOnlyWorker`) — if a future
  change to `apps/server/src/worker.ts`'s own `activeQueues` list ever accidentally drops
  `'apply-collection-filters'`, `worker.ts` itself would get silently misclassified as
  email-only and stop running the ERP Kafka consumer/tasks entirely. Check `isEmailOnlyWorker`'s
  own unit tests (`types.test.ts`) still pass first if consumption stops unexpectedly after a
  `worker.ts` change.

## History (for context, not to re-derive every time)

- **Pre-#145/#146**: prices could starve fresh rows (any stream) under backoff-retry churn; no
  unified retry budget.
- **#146**: fixed claim ordering to FIFO-by-eligibility (`COALESCE` expression) — fixed the
  fairness bug, but that expression itself couldn't be indexed (see "Claim query cost" above).
- **#147**: real `eligible_at` column + index; retention (tombstone superseded processed rows,
  never delete — deleting would break the `(stream, sourceEventId)` dedup key, a real HIGH finding
  caught by audit on the first attempt at this).
- **#148**: multi-stream claim query still not index-friendly under a large backlog (seq scan,
  ~3.4s/batch) → per-stream claim branches (~7ms/batch). A second real bug found by audit in this
  same fix: the two-phase claim (fast candidate lookup, then a locked select) lost Postgres's
  lock-time row recheck, opening a window for double-processing a row a competing sweep already
  claimed — fixed by repeating the eligibility condition under the lock.
- **#149**: `product` stream specifically was ~20/min (≈3s/event) — root cause was two redundant,
  uncached category-FacetValue lookups per event (not the claim query, already fixed by #148).
  Fixed with a 5s-TTL cache. Also fixed in the same pass: `processPendingBatch`'s `deadlineMs`
  now releases unprocessed rows immediately instead of leaving them for a 5-minute stale reclaim,
  and `worker-email.ts` no longer duplicates Kafka consumer group membership / erp-integration
  tasks.

Full incident-level detail for all of the above: `docs/environments.md`'s "Migrations" section
(#147/#148 notes) and each issue's own commit messages/audit trail (`git log --grep '#14[5-9]'`).
