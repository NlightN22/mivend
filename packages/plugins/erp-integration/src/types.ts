declare module '@vendure/core' {
    interface CustomProductFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config. A relation to the
        // Manufacturer entity (issue #116) — ProductChanged's `manufacturer` is an ERP directory
        // GUID, not a display name, so this is a real relation, not a plain string field. See
        // manufacturer.entity.ts / manufacturer.service.ts.
        manufacturer?: import('./entities/manufacturer.entity').Manufacturer | null;
    }

    interface CustomProductVariantFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config (ERP-sourced storage-
        // location assignment, see the external-integration-rules skill and payment-method-handlers.ts's
        // organization-split comment) — read here without taking a package dependency on
        // whichever plugin ends up owning it, same established pattern as plugin-sync/types.ts.
        // Lives on ProductVariant, NOT Order — an order can span multiple organizations (see
        // GlobalSettings.organizationSplitEnabled / InvoiceService.createInvoicesForOrder), so
        // there is no single per-Order organizationId to read.
        organizationId?: number | null;
        // The StorageLocationChanged.priority that last won organizationId above — see
        // StorageLocationStreamHandler and vendure-config.ts's own doc comment on this field.
        organizationPriority?: number | null;
        // The StorageLocationChanged entityId that currently owns organizationId/
        // organizationPriority — see vendure-config.ts's own doc comment on this field.
        organizationSourceEntityId?: string | null;
    }

    interface CustomStockLevelFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config. the ERP's own
        // availableQuantity (StockChanged) for this (productVariant, stockLocation) — issue #72's
        // ATP cap. See StockStreamHandler and ReservationAvailabilityService.
        erpAvailableQuantity?: number | null;
    }

    interface CustomTaxCategoryFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config. Stable ERP-side VAT
        // code (issue #79) — ProductStreamHandler resolves the TaxCategory to assign by this
        // field, never by name.
        erpVatCode?: string | null;
    }

    interface CustomStockLocationFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config. StockLocation has no
        // native external-id field — this is WarehouseStreamHandler's idempotency key
        // (Warehouse.erpId) and BranchStockLocationStrategy's join key back to Warehouse.
        warehouseErpId?: string | null;
    }
}

export interface KafkaConfig {
    brokers: string[];
    clientId: string;
    ssl?: boolean | { ca: string[] };
    sasl?: {
        mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
        username: string;
        password: string;
    };
    topic: string;
}

export interface SchemaRegistryConfig {
    url: string;
    username?: string;
    password?: string;
}

export interface KafkaConsumerConfig {
    brokers: string[];
    clientId: string;
    groupId: string;
    ssl?: boolean | { ca: string[] };
    sasl?: {
        mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
        username: string;
        password: string;
    };
    // Integration Service's own inbound topics for the Milestone-1 streams — one topic per
    // entity type (issue #62's design section 2). Keyed by INBOUND_STREAMS in inbox-event.ts so
    // adding a stream later means adding one entry here + one handler, not touching consumer
    // wiring itself.
    topics: Record<InboundStream, string>;
}

export type InboundStream =
    | 'category'
    | 'organization'
    | 'warehouse'
    | 'price-type'
    | 'product'
    | 'offer'
    | 'price'
    | 'stock'
    | 'storage-location'
    | 'stock-organization'
    | 'order-registration-result'
    // The ERP's order-changed stream (issue #110/#72) — the order's ongoing, current-state view
    // (status/reservedQuantity/contractId), fired repeatedly over the order's lifetime, distinct
    // from order-registration-result's one-shot registration outcome. Bulk lane, not critical:
    // unlike order-registration-result this is not the sole reservation-release trigger, so a
    // backlog behind catalog/price/stock does not block the release-latency-sensitive path.
    | 'order-changed'
    // The ERP's "Подразделение" (org-structure division) — feeds the existing, previously-unfed
    // Department entity in @mivend/plugin-access-control. Different domain than the 10 streams
    // above (company.customers, not company.catalog/orders) — see DepartmentStreamHandler.
    | 'department'
    // The ERP's "Контрагент" (counterparty) — feeds @mivend/plugin-counterparty's Counterparty entity.
    // Same company.customers domain as department above. Issue #104: partial-create of name/
    // isActive/inn/erpGroupLabel/departmentId (verified live against
    // @nlightn22/event-contracts@0.38.0, search-platform#92/#118) — creditLimit/paymentDelayDays/
    // priceType/branchId stay erp-import/REST-only fields, never fabricated here (see
    // CounterpartyStreamHandler). manager_id/manager_ids now consumed too, resolved to an
    // Administrator via the 'user' stream below (issue #109 unblocked). creditBalance lives on
    // its own separate stream, see 'counterparty-credit-balance' below.
    | 'counterparty'
    // The ERP's "Пользователи" (user) — enrichment-only correlation of an Administrator with the ERP's own
    // user GUID, matched by email once (see UserEnrichmentService). Issue #109. Feeds
    // Administrator.customFields.erpId/departmentId — never creates an Administrator. Also the
    // resolution target for CounterpartyChanged's manager_id/manager_ids above. role/positionId
    // deliberately not consumed yet — mivend#117's Position-entity design isn't finalized.
    | 'user'
    // search-platform#129: register-driven creditBalance for Counterparty
    // (AccumulationRegister_ВзаиморасчетыСКонтрагентами), independent of CounterpartyChanged's own
    // catalog-change trigger. See CounterpartyCreditBalanceStreamHandler.
    | 'counterparty-credit-balance'
    // Issue #107: the ERP's promo-rule ("Скидка/Наценка" гиft/percent promotions keyed by a trigger
    // product), company.customers.events.v1.PromoRuleChanged. Feeds the same
    // @mivend/plugin-price-entry DiscountRule entity as the existing facet/priceType-threshold
    // rules — see PromoRuleStreamHandler and DiscountRule's own doc comment for the two-shape
    // invariant.
    | 'promo-rule';

// Every stream handler that reads a payload's `isActive` field must treat an ABSENT key as
// false, never as true. Root cause (confirmed live with Search Platform during mivend#89's
// follow-up investigation): Integration Service's published contracts declare isActive/isDeleted
// as plain (non-optional) proto3 bool fields. Under proto3, `false` is a scalar field's
// zero-value, and the @bufbuild/protobuf JSON encoder they use OMITS any non-optional scalar
// field equal to its zero-value — `isActive:false` is therefore NEVER sent as an explicit
// `false`, only as an absent key, for every stream using this contract shape. A handler reading
// `payload.isActive !== false` (defaulting an absent key to "active") can never detect a real
// deactivation at all — this was a live, silent bug affecting product/warehouse/price/priceType/
// organization since inception, not something introduced by any one incident. The correct read is
// `payload.isActive === true`. isDeleted is unaffected (its own zero-value is false too, so an
// explicit `true` is always sent) — only isActive-style "defaults to true" flags need this fix.

export interface ErpIntegrationPluginOptions {
    instanceType: 'central' | 'branch';
    // Issue #68: separate axis from `instanceType`. A plain `make dev` must never reach a real
    // Integration Service broker just because `instanceType === 'central'` — this must be
    // explicitly opted into per contour (see docs/environments.md). Defaults to `false` when
    // unset (KAFKA_ENABLED_DEFAULT) so any config site that forgets to set it fails safe.
    kafkaEnabled?: boolean;
    kafka: KafkaConfig;
    kafkaConsumer: KafkaConsumerConfig;
    schemaRegistry: SchemaRegistryConfig;
    maxRetry?: number;
    outboxPollIntervalMs?: number;
    inboxPollIntervalMs?: number;
    // How often the batched Collection-filter recompute runs (see
    // collection-filters-recompute.scheduled-task.ts) — compensates for
    // setApplyAllFiltersOnProductUpdates(false), which KafkaConsumerBootstrapService disables so
    // the Kafka-driven product stream doesn't enqueue its own apply-collection-filters job per
    // event (a real incident: tens of thousands of individual jobs, one per product, each
    // recomputing every Collection).
    collectionFiltersRecomputeIntervalMs?: number;
    // Issue #84: Integration Service's reconciliation summary API base URL (e.g.
    // https://is.komponent-m.ru) and its X-Api-Key. Reused for both the daily ScheduledTask and
    // the manual-trigger mutation — never hardcoded, never logged. Optional (like
    // schemaRegistry.url) so every other existing plugin config fixture doesn't need updating;
    // ReconciliationSummaryClient falls back to RECONCILIATION_API_URL_DEFAULT/an empty key,
    // which only matters on a contour that actually enables kafkaEnabled+central (see the
    // ScheduledTask's own gate) — a plain `make dev` never reaches this code path at all.
    reconciliationApiUrl?: string;
    reconciliationApiKey?: string;
    reconciliationIntervalMs?: number;
    // Issue #91: how often KafkaLagPollerService recomputes per-partition consumer lag for every
    // inbound topic. Defaults to KAFKA_LAG_POLL_INTERVAL_DEFAULT.
    kafkaLagPollIntervalMs?: number;
    // Issue #91: a partition's lag above this value gets a Logger.warn from the poller — the
    // "at minimum a log line above a threshold" half of the issue's suggested scope. Defaults to
    // KAFKA_LAG_WARN_THRESHOLD_DEFAULT.
    kafkaLagWarnThreshold?: number;
}

// Every InboundStream, kept in sync by hand with the union type above — used only to derive the
// bulk lane's stream set below (INBOX_CRITICAL_STREAMS is exhaustively subtracted from it).
// `satisfies Record<InboundStream, true>` (not a plain array, unlike a first pass at this) makes
// forgetting a stream here a compile error the moment a new InboundStream is added to the union
// — without it, a forgotten stream would silently land in neither lane and never get processed
// again (mivend.audit.90's review of issue #93, MEDIUM finding).
const ALL_INBOUND_STREAMS_MAP = {
    category: true,
    organization: true,
    warehouse: true,
    'price-type': true,
    product: true,
    offer: true,
    price: true,
    stock: true,
    'storage-location': true,
    'stock-organization': true,
    'order-registration-result': true,
    'order-changed': true,
    department: true,
    counterparty: true,
    'counterparty-credit-balance': true,
    user: true,
    'promo-rule': true,
} satisfies Record<InboundStream, true>;
const ALL_INBOUND_STREAMS: readonly InboundStream[] = Object.keys(
    ALL_INBOUND_STREAMS_MAP,
) as InboundStream[];

// Issue #93: order-registration-result is reservation-release-blocking (see
// OrderRegistrationResultHandler) and must never sit behind a bulk catalog/price/stock backlog —
// it gets its own claim/process lane, exclusively its own (see
// INBOX_ORDER_REGISTRATION_RESULT_STREAMS below): no other stream, including 'user', ever shares
// its claim query, so a backlog on any other stream can never delay it.
export const INBOX_ORDER_REGISTRATION_RESULT_STREAMS: readonly InboundStream[] = [
    'order-registration-result',
];
// Issue #127: 'user' gets its own dedicated lane for a completely different reason than
// order-registration-result above — not reservation urgency, but a real head-of-line-blocking
// incident. claimBatch's single global `ORDER BY createdAt ASC` inside the bulk lane let an
// older, much larger `counterparty` backlog starve `user` of any claim slots for hours, even
// though UserStreamHandler itself was healthy and had nothing wrong with it. A third, disjoint
// lane guarantees `user` a claim slot regardless of any other bulk-lane stream's backlog
// size/age — and, symmetrically, guarantees a future `user` backlog can never delay
// order-registration-result either, since they no longer share a claim query.
export const INBOX_USER_STREAMS: readonly InboundStream[] = ['user'];
// The union of both non-bulk lanes — used only to derive INBOX_BULK_STREAMS below (every other
// InboundStream). Each lane still claims independently via its own stream set above; this union
// is not itself passed to claimBatch anywhere.
export const INBOX_CRITICAL_STREAMS: readonly InboundStream[] = [
    ...INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    ...INBOX_USER_STREAMS,
];
export const INBOX_BULK_STREAMS: readonly InboundStream[] = ALL_INBOUND_STREAMS.filter(
    stream => !INBOX_CRITICAL_STREAMS.includes(stream),
);

// Vendure's DefaultSchedulerStrategy default task timeout is 60_000ms (DEFAULT_TIMEOUT,
// @vendure/core) and marks a task 'failed' + releases its lock past that — but the task's own
// execute() promise keeps running in the background regardless (a Promise can't be cancelled),
// so a bulk-lane run that exceeded a 60s timeout would silently keep going while the next tick
// starts a second one alongside it. The wall-clock budget below keeps the reclaim loop
// (integration-inbox.scheduled-task.ts) comfortably inside this explicit timeout regardless of
// backlog size, so an unbounded backlog just means more scheduled ticks, never an orphaned/
// duplicated in-flight run (mivend.audit.90's review of issue #93, MEDIUM-HIGH finding).
export const INBOX_BULK_TASK_TIMEOUT_MS = 120_000;
export const INBOX_BULK_WALL_CLOCK_BUDGET_MS = 90_000;

// Issue #96: thrown by a stream handler when a foreign lookup into another Kafka stream's data
// (Warehouse, PriceType, ProductVariant, OrganizationRequisites, ...) comes back empty. Kafka
// gives no cross-topic ordering guarantee, so the referenced entity's own stream simply may not
// have been consumed yet — an ordinary, expected race, not a processing bug. Distinct from a
// malformed/incomplete payload (still `Logger.warn` + `return`, unretryable — see the
// external-integration-rules skill's "Cross-entity dependencies" section). Caught specifically by
// IntegrationInboxProcessorService.processOne(), which routes it to
// IntegrationInboxService.markMissingDependency() (backoff + `nextRetryAt`) instead of the
// existing markFailed() short/fixed-attempt dead-letter path used for every other error.
export class MissingDependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingDependencyError';
    }
}

export const ERP_INTEGRATION_PLUGIN_OPTIONS = Symbol('ERP_INTEGRATION_PLUGIN_OPTIONS');
export const KAFKA_ENABLED_DEFAULT = false;
export const MAX_RETRY_DEFAULT = 5;
export const OUTBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_CRITICAL_BATCH_SIZE_DEFAULT = 20;
// Issue #127: the 'user' lane's own batch size, deliberately the same default as the
// order-registration-result lane's above — both are now small, low-volume, latency-sensitive
// lanes with no reclaim-while-full loop (see integration-inbox.scheduled-task.ts). Kept as its
// own named constant, not a reused reference, so the two lanes can be tuned independently later
// without one change silently affecting the other.
export const INBOX_USER_BATCH_SIZE_DEFAULT = 20;
// Issue #96: MissingDependencyError's own backoff shape, distinct from INBOX_MAX_ATTEMPTS_DEFAULT
// (which stays short/fail-fast for genuine processing bugs and malformed payloads). Base 30s,
// doubling per attempt, capped at 30 minutes per individual retry gap, ±20% jitter (spreads out a
// large batch of simultaneously-eligible rows instead of a thundering-herd reclaim).
export const MISSING_DEPENDENCY_RETRY_BASE_MS = 30_000;
export const MISSING_DEPENDENCY_RETRY_MAX_MS = 30 * 60_000;
export const MISSING_DEPENDENCY_RETRY_JITTER_RATIO = 0.2;
// Wall-clock give-up budget since row.createdAt, not a fixed attempt count — mirrors issue #93's
// own INBOX_BULK_WALL_CLOCK_BUDGET_MS pattern. A fixed attempt count stops meaning anything once
// backoff is capped at a fixed 30-minute gap; 24h is the actual guarantee being made here.
export const MISSING_DEPENDENCY_WALL_CLOCK_BUDGET_MS = 24 * 60 * 60 * 1000;
// Bigger than the critical lane's batch for bulk throughput, but not jumped straight to
// 200-500 — keeps the SELECT ... FOR UPDATE SKIP LOCKED transaction size reasonable (issue #93
// decision). Tune based on real measurement if still insufficient.
export const INBOX_BULK_BATCH_SIZE_DEFAULT = 100;
export const INBOX_MAX_ATTEMPTS_DEFAULT = 5;
export const COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT = 180_000;
// Once daily — no sub-day freshness requirement raised for this (issue #84).
export const RECONCILIATION_INTERVAL_DEFAULT = 24 * 60 * 60 * 1000;
export const RECONCILIATION_API_URL_DEFAULT = 'https://is.komponent-m.ru';
// Frequent enough to catch a stalled consumer well before it becomes a support ticket, without
// hammering the broker's admin API — no sub-minute freshness requirement raised for issue #91.
export const KAFKA_LAG_POLL_INTERVAL_DEFAULT = 60_000;
export const KAFKA_LAG_WARN_THRESHOLD_DEFAULT = 1000;
export const loggerCtx = 'ErpIntegrationPlugin';
