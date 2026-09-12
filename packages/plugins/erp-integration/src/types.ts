declare module '@vendure/core' {
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
        // Owned by apps/server/src/vendure-config.ts's customFields config. 1C's own
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
    | 'order-registration-result';

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
}

export const ERP_INTEGRATION_PLUGIN_OPTIONS = Symbol('ERP_INTEGRATION_PLUGIN_OPTIONS');
export const KAFKA_ENABLED_DEFAULT = false;
export const MAX_RETRY_DEFAULT = 5;
export const OUTBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_MAX_ATTEMPTS_DEFAULT = 5;
export const COLLECTION_FILTERS_RECOMPUTE_INTERVAL_DEFAULT = 180_000;
export const loggerCtx = 'ErpIntegrationPlugin';
