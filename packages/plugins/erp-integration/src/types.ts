declare module '@vendure/core' {
    interface CustomProductVariantFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config (ERP-sourced storage-
        // location assignment, see AGENTS.md sync rule #7 and payment-method-handlers.ts's
        // organization-split comment) — read here without taking a package dependency on
        // whichever plugin ends up owning it, same established pattern as plugin-sync/types.ts.
        // Lives on ProductVariant, NOT Order — an order can span multiple organizations (see
        // GlobalSettings.organizationSplitEnabled / InvoiceService.createInvoicesForOrder), so
        // there is no single per-Order organizationId to read.
        organizationId?: number | null;
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

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    db?: number;
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
    | 'stock';

export interface ErpIntegrationPluginOptions {
    instanceType: 'central' | 'branch';
    kafka: KafkaConfig;
    kafkaConsumer: KafkaConsumerConfig;
    schemaRegistry: SchemaRegistryConfig;
    redis: RedisConfig;
    maxRetry?: number;
    outboxPollIntervalMs?: number;
    inboxPollIntervalMs?: number;
}

export const ERP_INTEGRATION_PLUGIN_OPTIONS = Symbol('ERP_INTEGRATION_PLUGIN_OPTIONS');
export const MAX_RETRY_DEFAULT = 5;
export const OUTBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_POLL_INTERVAL_DEFAULT = 5000;
export const INBOX_MAX_ATTEMPTS_DEFAULT = 5;
export const loggerCtx = 'ErpIntegrationPlugin';
