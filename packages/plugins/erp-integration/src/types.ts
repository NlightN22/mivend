declare module '@vendure/core' {
    interface CustomOrderFields {
        // Owned by apps/server/src/vendure-config.ts's customFields config (ERP-sourced, see
        // AGENTS.md sync rule #7) — read here without taking a package dependency on whichever
        // plugin ends up owning it, same established pattern as plugin-sync/types.ts.
        organizationId?: number | null;
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

export interface ErpIntegrationPluginOptions {
    instanceType: 'central' | 'branch';
    kafka: KafkaConfig;
    schemaRegistry: SchemaRegistryConfig;
    redis: RedisConfig;
    maxRetry?: number;
    outboxPollIntervalMs?: number;
}

export const ERP_INTEGRATION_PLUGIN_OPTIONS = Symbol('ERP_INTEGRATION_PLUGIN_OPTIONS');
export const MAX_RETRY_DEFAULT = 5;
export const OUTBOX_POLL_INTERVAL_DEFAULT = 5000;
