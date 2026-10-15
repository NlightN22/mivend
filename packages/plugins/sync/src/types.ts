import type { ErpAdapter } from './erp-adapter.interface';

declare module '@vendure/core' {
    interface CustomOrderFields {
        // Field is owned by @mivend/plugin-erp-order via declaration merging; declared here to avoid
        // a package dependency on it (same pattern as plugin-moq's multiplicity field).
        branchId?: string | null;
        // Owned by this plugin. A receiving instance keeps a full local Order copy,
        // see docs/architecture.md.
        sourceOrderId?: string | null;
        // Owned by this plugin. On non-owning instances this is an informational projection of the
        // payment.recorded fact (Order as read-model, see docs/architecture.md).
        paymentStatus?: string | null;
    }
}

export interface RabbitMQConfig {
    url: string;
    exchange?: string;
    dlx?: string;
}

export interface SyncPluginOptions {
    instanceType: 'central' | 'branch';
    instanceId: string;
    rabbitmq: RabbitMQConfig;
    erpAdapter?: ErpAdapter;
    maxRetry?: number;
    outboxPollIntervalMs?: number;
    erpPollIntervalMs?: number;
    // Base for RabbitMQService's retry backoff (ms) — injectable so tests avoid real-time waits.
    retryBaseDelayMs?: number;
}

export const SYNC_PLUGIN_OPTIONS = Symbol('SYNC_PLUGIN_OPTIONS');
export const EXCHANGE = 'mivend.sync';
export const DLX = 'mivend.sync.dlx';
export const MAX_RETRY_DEFAULT = 5;
export const RETRY_BASE_DELAY_DEFAULT = 500;
export const POLL_INTERVAL_DEFAULT = 5000;
export const ERP_POLL_INTERVAL_DEFAULT = 30_000;
