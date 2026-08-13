import { Inject, Injectable } from '@nestjs/common';

import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// A producer-authoritative client for this plugin's OWN outbound `OrderSubmitted` event only:
// registers its schema with Integration Service's Confluent-compatible Schema Registry and
// resolves the returned schema id, per issue #62's decision to use the Registry (not a generated
// npm package) as the contract distribution point for that direction — see docs/sync.md's "Why
// Kafka both ways, not Kafka + RPC".
//
// This is NOT used for the 8 inbound catalog/price/stock streams: those are plain protobuf
// `toBinary()`/`fromBinary()` with no Confluent wire-format header and no Registry involvement at
// all (verified against Integration Service's real producer/consumer code — see
// docs/ai/1c-integration-service-decision.md's 2026-08-14 retraction and
// kafka-consumer.service.ts's own comment). An earlier version of this file had a
// Registry-dynamic `getSchemaById` consumer-side lookup for inbound decode; it was removed
// because those messages were never encoded that way to begin with and it could never
// successfully decode a real message.
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
