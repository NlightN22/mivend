import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
import type { SASLOptions } from 'kafkajs';

import { SchemaRegistryClient } from './schema-registry.client';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';
import { encodeConfluentMessage } from './wire-format';
import type { OutboundEventSchema } from './schemas/registry';
import { OUTBOUND_EVENT_SCHEMAS } from './schemas/registry';

@Injectable()
export class KafkaProducerService implements OnModuleDestroy {
    private producer: Producer | undefined;

    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly schemaRegistry: SchemaRegistryClient,
    ) {}

    // Publishes one outbox row's payload. Throws on any failure (broker unreachable, Registry
    // unreachable, send rejected) — the caller (IntegrationOutboxWorker) is responsible for
    // catching this and applying the retry/dead-letter policy; this method never swallows an
    // error itself (AGENTS.md rule #4 — no silent drops).
    async publish(
        eventId: string,
        eventType: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const schemaEntry = this.resolveSchema(eventType);
        const schemaId = await this.schemaRegistry.resolveSchemaId(eventType, schemaEntry.schema);
        const producer = await this.getProducer();

        await producer.send({
            topic: this.options.kafka.topic,
            messages: [
                {
                    key: eventId,
                    value: encodeConfluentMessage(schemaId, payload),
                    headers: { 'event-type': eventType },
                },
            ],
        });
    }

    private resolveSchema(eventType: string): OutboundEventSchema {
        const entry = OUTBOUND_EVENT_SCHEMAS[eventType];
        if (!entry) {
            throw new Error(`No registered outbound schema for event type "${eventType}"`);
        }
        return entry;
    }

    private async getProducer(): Promise<Producer> {
        if (this.producer) return this.producer;

        const kafka = new Kafka({
            clientId: this.options.kafka.clientId,
            brokers: this.options.kafka.brokers,
            ssl: this.options.kafka.ssl,
            sasl: this.options.kafka.sasl as SASLOptions | undefined,
        });
        this.producer = kafka.producer();
        await this.producer.connect();
        return this.producer;
    }

    async onModuleDestroy(): Promise<void> {
        await this.producer?.disconnect();
    }
}
