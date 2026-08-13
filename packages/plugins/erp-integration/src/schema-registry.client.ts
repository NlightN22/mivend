import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// A producer-authoritative client: registers this plugin's own outbound event schemas with
// Integration Service's Confluent-compatible Schema Registry and resolves the returned schema
// id, per issue #62's decision to use the Registry (not a generated npm package) as the contract
// distribution point. Integration Service's consumer resolves our schemas the same way, from our
// registrations — see docs/sync.md's "Why Kafka both ways, not Kafka + RPC".
@Injectable()
export class SchemaRegistryClient {
    // Registration is idempotent on the Registry side for byte-identical schemas, but caching
    // avoids a network round trip on every single outbox row for the (overwhelmingly common)
    // case of publishing the same event type repeatedly.
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
