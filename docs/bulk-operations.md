# Bulk operations

How the manager portal "Bulk operations" menu item is built. Tracked in #337. Every operation (activate customers,
change manager, assign a branch or a price type, grant discounts, import) follows this one model: one executor on the
server and one "parameters" step on the page, never a bespoke page per operation.

## Where it sits

- **Menu item "Bulk operations"** opens a catalog of operations. Each operation is registered in code (key, title,
  description, route, permission) and is hidden from a user without its permission. With a few operations the catalog is
  a plain list; from about eight operations it is grouped by area (customers, prices, catalog, orders, access) and
  gets a search field.
- **Tab "History"** in the same menu item lists the batches that were run (see below).
- **Multi-select in ordinary lists** stays for small ad hoc actions (a "Selected: N" bar with the action). Bulk
  operations are for large, filter-based, reviewed runs. The two levels do not duplicate each other.

## The wizard

One shared ui-kit wizard component serves every operation; an operation never brings its own layout.

1. **Select.** The entity list of the page the operation works on (same columns, filters, filter builder and saved
   views as its list page) with the row selection column. Baseline: filter, then "Select all" for the rows of the
   current page (the configured page size). Optional later: "select everything that matches the filter"; the filter is
   re-evaluated on the server at run time, the count is shown and confirmed.
2. **Parameters.** What to do with the selected records (for example grant or revoke portal access).
3. **Review.** A server-side dry run: how many records change, which are skipped and why (no e-mail, no right, already
   in the target state), and conflicts. The dry run creates the batch as a draft (status `draft`, its `uuid` and number
   are minted here, no per-record effects), so a double click on Run reuses the same batch and has one effect. The
   review result is advisory: the executor re-validates every record under the row lock at run time, because state can
   change between review and run, and reports any difference in the result table.
4. **Run and result.** The batch runs in the background with progress, then a per-record result table, a downloadable
   report, and undo where the operation is reversible. Undo is a batch of its own (own `uuid` and number, linked to the
   original, same permission and per-record scope), not a rollback of the old rows.

## The batch

Every run stores a batch; it is the audit trail and the guard against a repeated run.

- **Identity.** An immutable `uuid` and a numeric human number (see `docs/identifiers.md`). The `uuid` is the idempotency
  key: running the same batch twice has exactly one external effect.
- **Content.** Operation type, parameters, status, counters, and one result row per record (applied, skipped with a
  reason, failed with a reason).
- **History list.** An ordinary entity list (who, when, operation, records, result) with the standard filters. It
  follows the operation type's permission and shows only records inside the viewer's scope: a batch can touch records
  the viewer cannot see, so the counters and the per-record table are scoped too.

## The server framework

One batch model instead of per-operation code.

- A new operation registers an executor: type, validation, dry run, apply, optional undo.
- The runner locks the changed rows following `docs/concurrency.md` (lock inside a transaction, read under the lock, no
  swallowed errors) and checks scope and permission per record, not only per batch.
- One permission per operation type; the catalog and the executor use the same permission.
- Tests follow `docs/testing-patterns.md`: idempotency (a batch published twice), concurrency (two batches over the
  same rows), partial failure (some records fail, the rest are applied or rolled back as the operation declares),
  scope (a record outside the actor's scope is skipped, never changed).

## Out of scope for the first iteration

Select-all-matching-the-filter, scheduling of batches, chains of operations.

## As built (first iteration, #337)

Refinements of the model above; the sections above stay the contract.

- **Plugin.** `packages/plugins/bulk-operations` owns the batch tables, the executor registry, the runner and the
  GraphQL API. An operation registers its executor from the plugin that owns the data (the activation executor lives
  in the counterparty plugin, which depends on the framework plugin, never the reverse).
- **Tables.** `bulk_batch` (uuid, number from the table's own database sequence, operation type, parameters, status,
  counters, creator, optional `undoOfBatchId`, selection hash) and `bulk_batch_item` (one row per record: dry-run
  verdict, then outcome `applied|skipped|failed`, reason code, message). Statuses: `draft`, `queued`, `running`,
  `done`, `partial` (some failed), `failed`.
- **Draft minting.** `previewBulkBatch(type, parameters, selection)` is idempotent per creator, type, parameters and
  selection (a hash over the sorted ids): previewing the same selection again reuses the draft and refreshes its
  dry-run verdicts; any change mints a new draft with its own uuid and number. A selection holds at most 1000 ids.
- **Run.** `runBulkBatch(uuid)` moves `draft` to `queued` once under a lock and enqueues a job on the existing
  database-backed job queue (queue `bulk-batch-run`, listed in `apps/server/src/worker.ts`; no new worker process).
  The job moves `queued` to `running` once, so a second call or a second job has no second effect, and applies the
  records one at a time, each in its own short lock-and-transaction, recording the outcome row by row. A record that
  throws becomes `failed` and the run continues; permission is re-checked per record.
- **Undo.** `undoBulkBatch(uuid)` creates (once per original, enforced by a unique index) a new linked batch for the
  applied records the viewer can see and runs it. Only an operation that declares `undoPlan` offers it. Activation
  grants are undoable; a revoke is not (the customer login is soft-deleted and a re-grant would create a new one).
- **History scope.** The list shows finished batches of the types the viewer holds; the header (number, operation,
  who, when) is visible to every holder of the permission, while counters and the per-record table cover only the
  records inside the viewer's scope. Filters are a fixed whitelist (operation, status, creator, number prefix, date
  range), sorts a whitelist of columns, `take` is clamped to 100.
- **Select step.** Rows of any readiness can be selected (the review explains what is skipped); "Select all" takes the
  rows of the current page. Selection across pages is kept while the wizard is open; select-all-matching-the-filter is
  still out of scope.
- **Routes.** `/bulk-operations` (catalog), `/bulk-operations/history`, `/bulk-operations/:operation` (the wizard;
  `?batch=<uuid>` reopens a draft at the review or a finished batch at the result). The old
  `/bulk-operations/activate-customers` and `/counterparty-activation` links redirect.
