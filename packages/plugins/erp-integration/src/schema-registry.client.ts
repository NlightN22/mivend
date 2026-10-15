import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Outbound OrderSubmitted only. Inbound streams are plain protobuf with no Confluent header,
// so they must not go through this Registry-based path.
@Injectable()
export class SchemaRegistryClient {
    // Registry registration is idempotent, so the cache only saves a network round trip per outbox row
    private readonly schemaIdCache = new Map<string, number>();

    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    async resolveSchemaId(subject: string, schema: Record<string, unknown>): Promise<number> {
        const cached = this.schemaIdCache.get(subject);
        if (cached !== undefined) return cached;

        const url = `${this.options.schemaRegistry.url}/subjects/${encodeURIComponent(subject)}-value/versions`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.schemaregistry.v1+json',
                ...this.authHeader(),
            },
            body: JSON.stringify({ schemaType: 'JSON', schema: JSON.stringify(schema) }),
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            throw new Error(
                `Schema Registry rejected registration for subject "${subject}-value": ${response.status} ${body}`,
            );
        }

        const { id } = (await response.json()) as { id: number };
        this.schemaIdCache.set(subject, id);
        return id;
    }

    private authHeader(): Record<string, string> {
        const { username, password } = this.options.schemaRegistry;
        if (!username || !password) return {};
        return {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
        };
    }
}
