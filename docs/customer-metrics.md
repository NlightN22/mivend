# Customer balance and turnover metrics (manager portal)

Concept for the figures on the customer card and, later, the dashboard. Issue #320.

## Rules

1. **Balance is always the real net position.** The balance shown for a counterparty in the manager portal is the
   sum of the closing balance of every non-deleted settlement balance row of that counterparty. It never depends on
   whether a contract is imported, linked, marked for deletion or hidden from the customer, on the document types the
   customer may see, or on which documents are displayed. Anything that filters balances (contract scope,
   `customerVisible`, a hidden-contract notice) belongs to the customer portal only. The manager portal may show a
   per-contract breakdown next to the total, never instead of it.
2. **Turnover is real too.** Sales, returns and the figures derived from them come from the whole settlement document
   stream of the counterparty, independent of contracts and of portal orders. A counterparty that never logged in has
   the same figures as one that did.
3. **Every figure carries its computation time** (`computedAt`) and a person can see when it was last recalculated.
4. **A defective record is shown as defective, never hidden.** A trading point without an address or coordinates is
   listed with a "cannot be used by the customer" reason.

## What the card shows today, and why it is wrong

| Tile | Source today | Problem |
| --- | --- | --- |
| Sales last 30 days | Sum of portal orders of the linked portal customer, in the browser | Zero for anyone without a portal account; counts orders, not ERP sales |
| Open orders | Orders of the linked portal customer in a non-terminal state | Same: ERP-created orders of the counterparty are missing |
| Outstanding balance | Proforma invoice outstanding balance | A different quantity (our payment requests), not the ledger position |
| Available credit | Credit limit minus the credit balance from the ERP credit stream | Correct as a credit figure; unrelated to the ledger balance |

## Verified on production data (read-only, 2026-11-12)

- The settlement stream holds about 0.77 million documents (one year) and about 1.0 million entries, for about
  8.5 thousand counterparties; about 23 thousand balance rows, of which about 2.9 thousand have no imported contract.
- On a sample counterparty the sum of **all** balance rows, including contract-less ones, equals the ERP's own
  "current debt" to the kopeck. Showing only linked-contract balances gave a different number. This confirms rule 1.
- Document types already carry a data-driven `category` (sale, return, payment, correction, bonus, supplier, payroll).
  One counterparty is often both buyer and supplier, so supplier and payroll categories must stay out of customer
  turnover. The `correction` category mixes sales corrections and debt corrections; a dedicated per-type flag is
  needed to know which corrections move turnover (decision below).
- Computing on the fly is not yet slow: 30-day sales for the largest counterparty took about 0.4 s cold, the
  company-wide 30-day sales about 0.16 s. It grows with the stream and cannot give dynamics cheaply, so the figures
  are precomputed (below).
- 516 trading points sent by the ERP are not in the database: a point without an address is skipped by the stream
  handler ("deferring create") and the event is still marked applied. This contradicts rule 4.

## Facts from the integration service (2026-11-12)

- The source is an accumulation register, so unposted documents never arrive. Contracts marked for deletion are not
  filtered: their documents flow, and their balance arrives in the key snapshot of every triple with a non-zero balance.
  This is why rule 1 holds.
- A repost keeps the document id and sends a newer `version`; unposting or deleting sends `isDeleted` for the same id.
  There is no separate tombstone for the old date, so a recompute must cover the whole counterparty, not one day.
- Document amounts are signed; there is no base-document link and no "kind of movement" field: the kind is the document
  type only. A returned or corrected sale is tied to an order, if at all, through the order links of the entry.
- There is no per-counterparty aggregate stream (30-day or 12-month turnover, average check, current debt): current debt
  is the sum of the balance rows. Control aggregates could be added later as reconciliation figures.
- All dates are UTC instants; the document date is the ERP's local document time converted to UTC (the exact
  conversion per stream is being confirmed on the ERP side).
- Trading points: about 650 of about 7,300 sent points have an empty address and about 100 carry latitude exactly 90, so
  "incomplete point" is a normal state to show, not an exception.

## Metrics

| Metric | Definition |
| --- | --- |
| Balance | Rule 1 |
| Turnover, last 30 days | Sum of entries of the document types flagged as moving turnover (sales, sales corrections, returns), local calendar days, today included |
| Turnover, last 12 months | The same over 12 months |
| Average check | Net turnover divided by the number of ERP sale documents (category `sale`) in the window; corrections and returns add to the amount, never to the count. The card names the unit ("per sales document") |
| Dynamics | Last 30 days against the 30 days before; "new" when the earlier window is empty |
| Open orders | Orders of the counterparty (not only of its portal customer) in a non-terminal state |
| Debt and overdue | Existing FIFO aging read through `counterpartyOverdue` |

## Architecture

Stay in PostgreSQL. A separate analytics system (a column store, a warehouse, search-engine aggregations) adds a
second source of truth, sync lag and double handling of retroactive corrections for a data set that is small for one
instance. Move only when a signal appears: dashboard queries still over 1-2 s after the rollups, analysts needing
free-form slicing, analytic load hurting transactional latency (first step a read replica, then change data capture
into a column store behind the same API), or the fact table growing by orders of magnitude.

- **Rollup table** `counterparty_metrics_daily(counterpartyId, day, sales, returns, saleDocuments, ...)` in the
  business time zone, plus one **totals row** per counterparty (balance, windows, `computedAt`). The card reads one row
  by primary key.
- **Recompute, not increment.** When the settlement apply path changes a counterparty it recomputes that
  counterparty's buckets from the source rows, in the same transaction and under the counterparty lock
  (`docs/concurrency.md`). Reposted, changed-date and backfilled documents are then correct by construction and replays
  are harmless. A bulk import pauses per-event recompute and rebuilds once.
- **Nightly reconcile** rebuilds every counterparty, compares with the live rows, logs mismatches as a health signal and
  compares the computed balance with the ERP's own balance, storing the drift.
- **Fallback** when no row exists yet: compute on demand and store.
- **Company-wide figures** sum the rollup (about counterparties times days rows); a materialized view refreshed every
  few minutes is enough there.
- No trigger-maintained counters, no incremental-view extensions and no time-series extension: delta-only maintenance
  drifts under corrections, and the extra moving parts are not needed at this size.

Sources read for this concept: PostgreSQL manual on materialized views, a vendor comparison of materialized views and
rollup tables (upsert rollups need an explicit strategy for corrections), the time-series guides on late-arriving
data (lookback window plus invalidation, the same idea as recomputing touched buckets), and column-store migration
guides (no hard row threshold; a read replica and rollups first).

## Order of work

1. This document and the balance rule (done here).
2. Card: real balance total from the balance rows (with the contract breakdown beside it), orders by counterparty.
3. Flag column on `settlement_document_type`, rollup tables, recompute in the apply path, backfill, reconcile, tests
   (row-budget and a concurrent-writer test).
4. Card tiles read the totals row; dynamics and average check.
5. Trading points: create points without an address and show every defect on the card; backfill the skipped ones by
   replaying the stream.
6. Company dashboard on the rollup.

## Decisions (owner, 2026-11-12)

- **Average check is per ERP sale document**, as above.
- **Turnover moves with sales corrections, not with debt corrections.** A sales correction document carries the signed
  change of a sale (on production almost all are negative: about 0.4% of sales in amount; returns are always negative),
  dated by the correction itself, so summing sales, sales corrections and returns gives the net figure. A debt
  correction moves the balance only. The `correction` category cannot tell them apart, hence a boolean flag
  `movesTurnover` on `settlement_document_type`, edited as data. To verify before building: how the ERP books a
  correction that changes the quantity of a sale from an earlier period (the amount lands in the correction's own
  period, which is the accepted rule).
- **Business time zone = the server's `TZ`.** Production already sets `TZ` for the server containers (the database
  session stays UTC); no second variable is added. The ERP sends every document date as a UTC instant, so no
  per-document zone is needed. The application computes day boundaries in the process zone, passes UTC instants to
  SQL, and buckets the daily rollup by the same zone name read from the runtime (`Intl`). Changing `TZ` later
  requires rebuilding the rollup, which the nightly reconcile detects. This replaces the "no business timezone is
  configured" note in `docs/payments.md` for the metrics (that note concerns printed dates and stays as is).
- Still open: whether the card also shows supplier-side turnover (default: no).
