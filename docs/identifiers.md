# Identifiers: uuid and numeric document numbers

Rules are in `AGENTS.md` ("Identifiers"); this page has the decided details. Issue #207.

## Two identifiers, two jobs

| | `uuid` | `number` |
| --- | --- | --- |
| For | systems: idempotency, links, exchange | people and the other system's search |
| Form | UUID v4, assigned by mivend at creation, immutable | digits only, from a database sequence |
| Unique | globally | per document type |
| Reused | never | never |
| Sent in contracts | yes, the key | yes, a reference |

The integer primary key stays internal and is never sent. `eventId` is a transport key (redelivery of the same message)
and is never an idempotency key for a business entity.

## Which entities

- **uuid + number** (documents): Order, Invoice (and proforma snapshots, #206), PaymentAttempt / payment document,
  Refund, SettlementEntry, DiscountGrant.
- **uuid only**: OrderLine, Reservation (replaces the separate `erpOperationId` / `erpReleaseOperationId` ids as the
  entity identity; operation ids stay for operations), rendered Document records, reconciliation issue records, and every
  other mivend-created entity as it is touched (shared base for plugin entities, a custom field for Vendure core entities).
- **Neither** (ERP-owned masters: Counterparty, Contract, Product, Organization, Warehouse, ...): they keep the ERP's own
  `entityId`.

## Number format

- A plain number, digits only: a **3-digit instance code** (fixed per deployment: one code for the central hub, one for
  each branch) followed by a **7-digit sequence** from a PostgreSQL sequence per document type on that instance, for
  example `1000000012` (never `MAX+1`, never a random suffix). The code makes numbers unique across instances without
  any coordination, so the number is issued **immediately** by the instance that creates the document, hub or branch,
  with no wait for synchronization and no dependency on the hub being reachable.
- Gaps after a rolled-back transaction are acceptable: these are not accounting documents (the ERP holds those);
  gapless numbering is a legal requirement for tax invoices only.
- `Order.code` is the order number (digits only).
- Documents that belong to an order are numbered `<order number>-NN` (`1000000012-01`, `-02`, ...), NN being the
  ordinal of the document within the order. Other document types (payment document, refund, discount grant) have
  their own sequence per instance.
- **Proforma versions (#206):** every version is a new document with its own new number; the earlier version stays
  under its old number and the new one links to it ("replaces"), so a number is never reused and `-NN` is only the
  ordinal within the order; the organization is shown separately.
- **Payment documents:** our number always comes from the sequence; an external reference (acquirer id, receipt number,
  the ERP's event id) is stored and shown separately as the provider/bank reference and never replaces our number.
- Shown everywhere people see a document and accepted by every search box (typing digits finds it).

## Exchange

- Outbound events carry `uuid` and `number` of the entity, plus `uuid` of each line. The producer has a guard keyed by
  the entity `uuid`: a second publish of the same entity (re-confirm, release then confirm, expiry then confirm) has no
  second external effect.
- The ERP stores our `uuid` and `number` in the document it creates and registers idempotently by `uuid` (a repeated
  registration returns the existing document); replies refer to our entity by `uuid`.
- Inbound events about our entities are matched by `uuid` first.

## Implementation status (issue #207)

- Done: `Order.customFields.uuid` / `OrderLine.customFields.uuid`, assigned synchronously at insert by
  `apps/server/src/order-uuid.subscriber.ts` (a TypeORM `EntitySubscriber`, not an EventBus listener, so it is atomic
  with the row's own insert); backfilled for existing rows by migration `1791460000000-order-uuid`.
- Done: `order.submitted`'s duplicate-publish guard (issue #199), in `OrderSubmittedBuilder.build()` via
  `OutboundGateway.hasActiveEntryForOrder`. **Known limitation:** there is no dedicated "ERP rejected this order" fact
  recorded anywhere yet, so the guard's only rejection signal is `Order.customFields.erpStatus === 'REJECTED'` (set by
  `ReservationWriteOffSyncService` from the ERP's registration result). Any other existing `pending`/`published`
  `order.submitted` outbox entry for the order blocks a new one. If a case arises where a legitimate re-submit should
  be allowed on some other signal, that needs its own design, not a workaround here.
- Done: `NumberingService` (`packages/plugins/numbering`) — `next(ctx, documentType)` against a fixed, hardcoded
  Postgres sequence per `NumberingDocumentType` (`order`/`invoice`/`payment`/`refund`/`discount-grant`/`proforma`,
  migration `1791470000000-numbering-sequences`), formats `<3-digit INSTANCE_NUMBER_CODE><7+-digit sequence value>`;
  `formatOrderDocumentNumber(orderNumber, ordinal)` is the pure `<order number>-NN` helper. `INSTANCE_NUMBER_CODE` is
  validated as exactly 3 digits at plugin init and documented in `.env.local.example`/`docs/environments.md`.
- Done: shared `UuidEntity` base (`packages/shared/src/uuid-entity.ts`), assigned via `@BeforeInsert()` so it is
  readable before the row's own insert commits.
- Done: `UuidEntity` applied to Invoice/PaymentAttempt/PaymentRefund/SettlementEntry/DiscountGrant/Document/
  ErpReconciliationIssue/Reservation (migration `1791480000000-plugin-entities-uuid`, backfilled then unique-indexed).
  SettlementEntry gets uuid only — it has no human-facing number field (confirmed by reading its entity/service: it is
  a ledger row, never shown or searched by a number of its own). Reservation gets uuid only, additively:
  `erpOperationId`/`erpReleaseOperationId` are untouched — they track *operations*, a different concept from the
  entity's own identity. The actual uuid/`erpOperationId` **unification** described in the "Which entities" table
  above is still open — nobody has yet changed how reservation sync (`packages/plugins/sync`) or the ERP
  reserve-by-order stream key a reservation; that is real follow-up work, not done by adding the column.
- Done: every `generateDocumentCode` call site replaced with `NumberingService`; `generateDocumentCode`/
  `documentCode.ts` is deleted. Order-scoping decisions made:
  - **Invoice**: order-scoped, `<order number>-NN` via `NumberingService.formatOrderDocumentNumber`. The ordinal is
    computed inside `InvoiceService.createUnderLock`, which already runs under a per-order `withAggregateLock` lock
    (pre-existing, for the idempotent-retry guarantee) — no separate locking was needed, just computing the ordinal as
    the split's 1-based index within that existing locked section. A concurrent-writer test
    (`invoice-creation.concurrency.int.test.ts`) asserts every Invoice number for one order is distinct even when
    `createInvoicesForOrder` is called concurrently.
  - **PaymentAttempt / PaymentRefund**: flat per-instance sequence (`NumberingService.next(ctx, 'payment'|'refund')`),
    not order-scoped. Reasoning: docs/identifiers.md's "Payment documents" paragraph says the number "always comes
    from the sequence", unlike Invoice which this doc explicitly calls out as `<order number>-NN`; `providerPaymentId`/
    `providerRefundId` already carry the acquirer/kassa reference separately. Revisit if this reading turns out wrong.
  - **DiscountGrant**: flat per-instance sequence — it has no `orderId`, so `<order number>-NN` does not apply.
- Done: `order.submitted` carries `orderUuid`/`orderNumber`/`lineUuid` in mivend's own producer-side mirror
  (`packages/plugins/erp-integration/src/schemas/order-submitted.schema.ts`, `OrderSubmittedBuilder.build()`).
  `orderNumber` is `order.code` as-is (today's `ORD-YYYYMM-XXXXXXXX` format, see the deferred item below — not
  affected by this change); `orderUuid`/`lineUuid` come from `Order.customFields.uuid`/`OrderLine.customFields.uuid`.
  All three required, matching `contractId`'s own precedent. **Follow-up, not done here:** the canonical
  `@nlightn22/event-contracts` npm package has the same three fields prepared but unpublished, on a
  `/opt/search-platform-wt-order-uuid` worktree, branch `feat/order-submitted-uuid` — the npm bump into mivend's
  dependency and the ERP/Integration-Service side's own consumption are separate, tracked follow-ups once that
  branch is reviewed and released.
- Done: `DateStampedOrderCodeStrategy` replaced by `NumberingOrderCodeStrategy`
  (`apps/server/src/order-code.strategy.ts`), which pulls `NumberingService` via `init(injector)`
  and calls `NumberingService.next(ctx, 'order')` — `Order.code` is now a plain number in the
  format described above, wired in `apps/server/src/vendure-config.ts`'s
  `orderOptions.orderCodeStrategy`.
- Done: `INSTANCE_NUMBER_CODE=100` set in `apps/server/.env.central` and
  `apps/server/.env.central.staging-integration` (both are the central-hub deployment identity, just two
  different contours/databases — no collision risk, per docs/environments.md's "one code for the hub, one per
  branch"); `INSTANCE_NUMBER_CODE=101` set in `apps/server/.env.branch`.
- Done: the one-off renumbering (`infrastructure/scripts/renumber-documents-207.sql`) has been **run against
  both real local (`mivend_central`) and staging-integration (`mivend_central_staging_integration`) databases**,
  with `instance_code=100`. Verified: zero remaining `ORD-`/`INV-`/`PAY-`/`DSC-` rows in either database, all
  renumbered values unique, a second run against the same database is a no-op (idempotency holds against real
  data, not just the test schema).
  - **Local/staging-integration run `synchronize: true`, so this project's own TypeORM migrations
    (`1791460000000-order-uuid`, `1791470000000-numbering-sequences`, `1791480000000-plugin-entities-uuid`,
    `1791481000000-payment-refund-number`) never actually executed against either real database** — `synchronize`
    tried to add the new `uuid` columns as `NOT NULL` directly against tables with existing rows and failed
    outright (`column "uuid" of relation "discount_grant" contains null values`), crash-looping the server. Fixed
    by applying the exact same add-column/backfill/set-not-null/create-index sequence the migrations already
    encode, by hand, directly against both databases, before restarting. This is a one-time catch-up specific to
    the local/staging-integration contours never running production's migration path — nothing to redo for
    future entities as long as new migrations keep following the same nullable-first-then-backfill-then-NOT-NULL
    shape (never a single-step `ADD COLUMN ... NOT NULL` against a table that can already have rows).
  - Both `make dev` (local) and `make dev-staging-integration` restarted cleanly afterward; `make
    dev-staging-integration`'s separate native-Dashboard (`packages/dashboard`) process failed to boot
    (`Cannot find module '@mivend/plugin-numbering'`, a Vite module-resolution quirk of how it loads
    `vendure-config.ts` standalone — see issue #77) — this is the secondary/optional Dashboard UI, not the
    Manager portal (which is healthy on both contours); not investigated further, flagged as a known gap.
  - A `pnpm build:plugins`/`pnpm --filter server build` run (a real `tsc -b` project build, not `make test`'s
    transpile-only/esbuild paths) caught two real type errors the prior slice's `make lint`/`make test`/
    `make test-int` run did not: `NumberingOrderCodeStrategy.numberingService` needing a definite-assignment
    assertion, and `order.customFields.uuid`/`line.customFields.uuid` being `string | null | undefined` at the
    type level — fixed with explicit guards in `OrderSubmittedBuilder.build()` (skip the order/mark the line
    unbuildable if missing) rather than a non-null assertion.
- Checked, nothing to fix: manager/storefront search-by-number UI. Grepped both frontends for any
  parsing/validation tied to the old `ORD-`/`INV-`/`PAY-`/`DSC-` prefix format — every hit is
  Storybook fixture data or a hardcoded display prefix built from a Vendure entity id (e.g.
  `PaymentRow.vue`'s `PAY-{{ payment.id }}`), never the `number`/`code` field itself, and no
  search box applies a format-specific regex; they already do a plain substring/ILIKE match,
  which works unchanged for a pure-digit number.
- Still open, separate from this slice: the Reservation uuid/`erpOperationId` unification
  described above; Swagger/API example updates.
