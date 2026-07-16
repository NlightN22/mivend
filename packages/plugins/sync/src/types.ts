import type { ErpAdapter } from './erp-adapter.interface';

declare module '@vendure/core' {
    interface CustomOrderFields {
        // Owned by @mivend/plugin-erp-order (declaration merging) — read here without taking a
        // package dependency on erp-order, same established pattern as plugin-moq's
        // multiplicity field (see plugin-reservation/src/types.ts).
        branchId?: string | null;
        // Owned by this plugin — see order.consumer.ts / administrator-sync.service.ts's
        // sibling pattern (sourceAdministratorId) and docs/architecture.md's "receiving instance
        // gets a full local Order copy".
        sourceOrderId?: string | null;
        // Owned by this plugin — informational projection of a `payment.recorded` fact on a
        // non-owning instance, see OrderSyncService.applyPaymentRecorded and
        // docs/architecture.md's "Order as a read-model" section.
        paymentStatus?: string | null;
    }
}

export interface RabbitMQConfig {
    url: string;
    exchange?: string;
    dlx?: string;
}

export interface RedisConfig {
    host: string;
    port: number;
    password?: string;
    // Logical Redis DB index — must differ between a central and a branch instance sharing
    // the same physical Redis server, otherwise their BullMQ queues (fixed names, e.g.
    // 'sync-outbox') collide and one instance's worker can pick up the other's job.
    db?: number;
}

export interface SyncPluginOptions {
    instanceType: 'central' | 'branch';
    instanceId: string;
    redis: RedisConfig;
    rabbitmq: RabbitMQConfig;
    erpAdapter?: ErpAdapter;
    maxRetry?: number;
    outboxPollIntervalMs?: number;
    erpPollIntervalMs?: number;
}

export const SYNC_PLUGIN_OPTIONS = Symbol('SYNC_PLUGIN_OPTIONS');
export const EXCHANGE = 'mivend.sync';
export const DLX = 'mivend.sync.dlx';
export const MAX_RETRY_DEFAULT = 5;
export const POLL_INTERVAL_DEFAULT = 5000;
export const ERP_POLL_INTERVAL_DEFAULT = 30_000;
