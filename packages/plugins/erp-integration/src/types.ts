import type { ConsistencySourceConfig } from './consistency/consistency-types';
declare module '@vendure/core' {
    interface CustomProductFields {
        // Owned by apps/server/src/vendure-config.ts customFields config. ProductChanged.manufacturer is an ERP directory GUID,
        // not a display name, so this is a real relation to Manufacturer, not a plain string field.
        manufacturer?: import('./entities/manufacturer.entity').Manufacturer | null;
    }

    // Owned by @mivend/plugin-acquiring's declaration; stamped at checkout from the variant.
    interface CustomOrderLineFields {
        organizationId?: number | null;
    }

    interface CustomProductVariantFields {
        // Lives on ProductVariant, not Order: an order can span multiple organizations, so no single
        // per-Order organizationId exists. Read here without a package dependency on the owning plugin.
        organizationId?: number | null;
        // The StorageLocationChanged.priority that last won organizationId above — see
        // StorageLocationStreamHandler and vendure-config.ts's own doc comment on this field.
        organizationPriority?: number | null;
        // The StorageLocationChanged entityId that currently owns organizationId/
        // organizationPriority — see vendure-config.ts's own doc comment on this field.
        organizationSourceEntityId?: string | null;
        // Enforced only by MultiplicityOrderInterceptor, and only when BranchSettings.packagesOnly is true.
        // Null when ProductChanged.defaultSalesUnitId is unset (sold in base/piece unit).
        defaultSalesUnitId?: string | null;
        unitName?: string | null;
        unitRatioToBase?: number | null;
        unitWeightKg?: number | null;
        unitVolumeM3?: number | null;
    }

    interface CustomStockLevelFields {
        // Owned by vendure-config.ts customFields. This is the ERP's own availableQuantity (StockChanged),
        // used as the ATP cap, not the local stock level. See ReservationAvailabilityService.
        erpAvailableQuantity?: number | null;
    }

    interface CustomTaxCategoryFields {
        // Owned by vendure-config.ts customFields. Stable ERP-side VAT code: the TaxCategory is resolved
        // by this field, never by name, since names are not a stable key.
        erpVatCode?: string | null;
    }

    interface CustomStockLocationFields {
        // Owned by vendure-config.ts customFields. StockLocation has no native external-id field, so this
        // is the idempotency key for Warehouse.erpId and the join key back to Warehouse.
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
    // One topic per entity type. Keyed by INBOUND_STREAMS in inbox-event.ts, so adding a stream
    // needs one entry here and one handler, with no change to consumer wiring.
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
    // Bulk lane on purpose: unlike order-registration-result this is not the sole reservation-release
    // trigger, so its backlog must not delay the release-latency-sensitive path.
    | 'order-changed'
    // The ERP's answer to an order cancel request (#194): cancelled | rejected per orderUuid.
    | 'order-cancel-result'
    // Feeds Department in @mivend/plugin-access-control; sourced from company.customers, not catalog/orders.
    | 'department'
    // Job-position master data (company.customers) — feeds ErpPosition in @mivend/plugin-access-control.
    | 'position'
    // Partial create only: creditLimit/paymentDelayDays/priceType/branchId are erp-import/REST-only and
    // never fabricated here. creditBalance arrives on its own stream (counterparty-credit-balance).
    | 'counterparty'
    // Enrichment only: never creates an Administrator, just matches by email to set erpId/departmentId.
    | 'user'
    // creditBalance comes from the accumulation register, independent of CounterpartyChanged's own
    // trigger, so balance updates do not depend on the counterparty catalog stream.
    | 'counterparty-credit-balance'
    // Feeds the same DiscountRule entity as the facet/priceType-threshold rules. See DiscountRule's
    // doc comment for the two-shape invariant that both sources must respect.
    | 'promo-rule'
    // Not product-keyed: upserts TaxRate.value by (erpVatCode, zone), so it is independent of
    // ProductChanged arrival order.
    | 'vat-rate'
    // code is never consumed. contact_phone only updates an existing ContactPerson: this stream has no
    // contact name, and ContactPerson.name is non-nullable.
    | 'point-of-sale'
    // Not order-critical, so it runs in the bulk lane. Optional fields such as creditLimit and
    // debtDaysLimit may be absent in the payload, so read them as optional.
    | 'contract'
    // A shared classifier unit has ownerId=null, so a unit row arriving before any product that
    // references it is not a missing-dependency race and needs no ordering.
    | 'unit'
    // Issue #164: the ERP's manufacturer reference directory; the only reliable source of names.
    | 'manufacturer'
    // Region and legal-form reference directories (company.customers); soft-linked from CounterpartyChanged.
    | 'region'
    | 'legal-form'
    // Bank directory and bank accounts (owner = counterparty/organization by owner_type); soft links only.
    | 'bank'
    | 'bank-account'
    // Issue #181: normalized product photos (ProductPhotoChanged); metadata + pre-signed download URL.
    | 'product-photo'
    // Issue #290: one event per ERP discount setup document (DiscountSetupChanged), see DiscountSetupStreamHandler.
    | 'discount-setup'
    // Issue #101: shipment-time confirmed discount fact (GrantedDiscountChanged),
    // company.customers.events.v1. See GrantedDiscountStreamHandler.
    | 'granted-discount'
    // Read-only; one event per ERP retro-bonus setup document, surfaced only in the manager portal.
    | 'retro-bonus-setup'
    // Issue #106: credited-bonus facts (GrantedRetroBonusChanged), see
    // GrantedRetroBonusStreamHandler.
    | 'granted-retro-bonus'
    // Issue #224: receivables history, see SettlementDocumentStreamHandler / SettlementBalanceStreamHandler.
    | 'settlement-document'
    | 'settlement-balance'
    // Issue #227: the ERP-owned document type reference (category, customer visibility).
    | 'settlement-document-type'
    // sp#200: the ERP-owned order status reference (rank, visibility, description).
    | 'order-status';

// proto3 omits false-valued bool fields from the JSON, so an absent isActive means inactive:
// read payload.isActive === true, never !== false. isDeleted is unaffected.

export interface ErpIntegrationPluginOptions {
    instanceType: 'central' | 'branch';
    // The ERP always sends gross (tax-inclusive) prices, so the channel setting is enforced at bootstrap.
    // Idempotent: KafkaConsumerBootstrapService re-applies it on every start; defaults to true.
    pricesIncludeTax?: boolean;
    // #144: raw ERP VAT code (e.g. from INTEGRATION_DEFAULT_VAT_CODE) made the default
    // TaxCategory when none exists; products with an unset/legacy code fall back to it.
    defaultVatCode?: string;
    // Separate from instanceType: a plain dev run must never reach a real broker just because
    // instanceType is central. Opt in explicitly per contour; defaults to false when unset.
    kafkaEnabled?: boolean;
    kafka: KafkaConfig;
    kafkaConsumer: KafkaConsumerConfig;
    schemaRegistry: SchemaRegistryConfig;
    outboxPollIntervalMs?: number;
    inboxPollIntervalMs?: number;
    // How often the retention lane sweeps `processed` rows (#147). Defaults to
    // INBOX_RETENTION_INTERVAL_DEFAULT.
    inboxRetentionIntervalMs?: number;
    // Compensates for setApplyAllFiltersOnProductUpdates(false), which stops the Kafka product stream
    // from enqueuing one apply-collection-filters job per event, so recompute must be batched here.
    collectionFiltersRecomputeIntervalMs?: number;
    categoryTreeRecomputeIntervalMs?: number;
    // Defaults to CREDIT_LIMIT_RECOMPUTE_INTERVAL_DEFAULT.
    creditLimitRecomputeIntervalMs?: number;
    // Never hardcoded or logged. Required by the REST clients (they throw naming the missing key).
    reconciliationApiUrl?: string;
    reconciliationApiKey?: string;
    // Read-only GitHub Packages token used only to look up the latest published event-contracts version.
    eventContractsRegistryToken?: string;
    // sourceSystem sent to the resync replay API; required by the replay client.
    resyncSourceSystem?: string;
    reconciliationIntervalMs?: number;
    // Issue #303: drift-report sources; empty or unset means no polling. Keys come from env only.
    consistencySources?: ConsistencySourceConfig[];
    consistencyPollIntervalMs?: number;
    consistencyRetentionDays?: number;
    // Issue #91: how often KafkaLagPollerService recomputes per-partition consumer lag for every
    // inbound topic. Defaults to KAFKA_LAG_POLL_INTERVAL_DEFAULT.
    kafkaLagPollIntervalMs?: number;
    // Lag above this value triggers a Logger.warn from the poller; only a log line, no hard failure.
    kafkaLagWarnThreshold?: number;
}

// Kept in sync by hand with InboundStream. satisfies Record<InboundStream, true> makes a
// forgotten stream a compile error; without it, the stream would silently land in neither lane.
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
    'order-cancel-result': true,
    department: true,
    position: true,
    counterparty: true,
    'counterparty-credit-balance': true,
    user: true,
    'promo-rule': true,
    'vat-rate': true,
    'point-of-sale': true,
    contract: true,
    unit: true,
    manufacturer: true,
    region: true,
    'legal-form': true,
    bank: true,
    'bank-account': true,
    'product-photo': true,
    'discount-setup': true,
    'granted-discount': true,
    'retro-bonus-setup': true,
    'granted-retro-bonus': true,
    'settlement-document': true,
    'settlement-balance': true,
    'settlement-document-type': true,
    'order-status': true,
} satisfies Record<InboundStream, true>;
export const ALL_INBOUND_STREAMS: readonly InboundStream[] = Object.keys(
    ALL_INBOUND_STREAMS_MAP,
) as InboundStream[];

// Reservation-release-blocking, so it gets an exclusive claim/process lane that no other stream
// shares; a backlog on any other stream can never delay it.
export const INBOX_ORDER_REGISTRATION_RESULT_STREAMS: readonly InboundStream[] = [
    'order-registration-result',
];
// Dedicated lane because a larger, older counterparty backlog starved it: claimBatch's global
// ORDER BY createdAt ASC shared one query. Disjoint lanes keep backlogs from delaying each other.
export const INBOX_USER_STREAMS: readonly InboundStream[] = ['user'];
// Derives INBOX_BULK_STREAMS only. Each lane claims via its own set; this union is never passed
// to claimBatch.
export const INBOX_CRITICAL_STREAMS: readonly InboundStream[] = [
    ...INBOX_ORDER_REGISTRATION_RESULT_STREAMS,
    ...INBOX_USER_STREAMS,
];
export const INBOX_BULK_STREAMS: readonly InboundStream[] = ALL_INBOUND_STREAMS.filter(
    stream => !INBOX_CRITICAL_STREAMS.includes(stream),
);

// Vendure marks a task failed past its 60s timeout, but execute() keeps running regardless, so an
// overlong bulk run would overlap the next tick. The wall-clock budget keeps the loop under 60s.
export const INBOX_BULK_TASK_TIMEOUT_MS = 120_000;
export const INBOX_BULK_WALL_CLOCK_BUDGET_MS = 90_000;

// worker-email.ts is also isWorker=true but must skip erp-integration entirely (#149) — a
// positive match on its own activeQueues, not a "not the real worker" negative check.
export function isEmailOnlyWorker(activeQueues: string[] | undefined): boolean {
    return (
        Array.isArray(activeQueues) &&
        activeQueues.length > 0 &&
        activeQueues.every(queue => queue === 'send-email')
    );
}

// Thrown when another stream's entity hasn't arrived yet (no cross-topic ordering in Kafka).
// Same retry policy as any failure; only logged as a warning since it's an expected race.
export class MissingDependencyError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MissingDependencyError';
    }
}

export const ERP_INTEGRATION_PLUGIN_OPTIONS = Symbol('ERP_INTEGRATION_PLUGIN_OPTIONS');
export const KAFKA_ENABLED_DEFAULT = false;
export const PRICES_INCLUDE_TAX_DEFAULT = true;
// Placeholder value written only by the product-side auto-create path for a new, unmapped VAT code.
// VatRateStreamHandler never writes it when percent is absent; that skips the upsert instead.
export const VAT_PLACEHOLDER_RATE_VALUE = 0;
// Zone has no external-id field in Vendure core, so this finds or creates by name; the ERP's zone
// code (e.g. RU) only selects this stable name and is never stored as the key.
export const DEFAULT_TAX_ZONE_NAME = 'Russia';
export const OUTBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_CRITICAL_BATCH_SIZE_DEFAULT = 20;
// Same default as the order-registration-result lane, but its own constant so the two lanes can
// be tuned independently without one change affecting the other.
export const INBOX_USER_BATCH_SIZE_DEFAULT = 20;
// One retry policy for inbox and outbox failures (#96, #200): exponential backoff 30s -> 30min
// cap, ±20% jitter, dead-lettered only after 24h wall-clock since the first failure.
export const RETRY_BACKOFF_BASE_MS = 30_000;
export const RETRY_BACKOFF_MAX_MS = 30 * 60_000;
export const RETRY_BACKOFF_JITTER_RATIO = 0.2;
export const INBOX_RETRY_WALL_CLOCK_BUDGET_MS = 24 * 60 * 60 * 1000;
// Outbox publishing uses the same backoff and budget as the inbox (#200).
export const OUTBOX_RETRY_WALL_CLOCK_BUDGET_MS = INBOX_RETRY_WALL_CLOCK_BUDGET_MS;
// Once every 10 minutes — a housekeeping sweep, not latency-sensitive like the claim lanes above
// (#147).
export const INBOX_RETENTION_INTERVAL_DEFAULT = 10 * 60_000;
// Bounds the retention task's own reclaim loop, same shape as INBOX_BULK_WALL_CLOCK_BUDGET_MS —
// a resync-sized backlog just means more ticks, never a run that risks the scheduler's timeout.
export const INBOX_RETENTION_WALL_CLOCK_BUDGET_MS = 60_000;
// Larger than the critical lane's batch for throughput, but kept small so the SELECT ... FOR UPDATE
// SKIP LOCKED transaction stays reasonably sized; tune by measurement if still insufficient.
export const INBOX_BULK_BATCH_SIZE_DEFAULT = 500;
export const COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT = 180_000;
export const CATEGORY_TREE_RECOMPUTE_INTERVAL_DEFAULT = 3_600_000;
export const CREDIT_LIMIT_RECOMPUTE_INTERVAL_DEFAULT = 15 * 60_000;
// Once daily — no sub-day freshness requirement raised for this (issue #84).
export const RECONCILIATION_INTERVAL_DEFAULT = 24 * 60 * 60 * 1000;
export const EVENT_CONTRACTS_REGISTRY_URL =
    'https://npm.pkg.github.com/@nlightn22%2fevent-contracts';
// Frequent enough to catch a stalled consumer well before it becomes a support ticket, without
// hammering the broker's admin API — no sub-minute freshness requirement raised for issue #91.
export const KAFKA_LAG_POLL_INTERVAL_DEFAULT = 60_000;
export const KAFKA_LAG_WARN_THRESHOLD_DEFAULT = 1000;
export const loggerCtx = 'ErpIntegrationPlugin';
