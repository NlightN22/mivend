import { ORDER_COMMANDS_TOPIC } from '@nlightn22/event-contracts';
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

    // Never swallow errors here: the caller (IntegrationOutboxWorker) applies retry/dead-letter policy,
    // so a swallowed error would be a silent message drop.
    async publish(eventType: string, payload: Record<string, unknown>): Promise<void> {
        const schemaEntry = this.resolveSchema(eventType);
        // The registry client appends "-value", giving the topic's union subject.
        const schemaId = await this.schemaRegistry.resolveSchemaId(
            ORDER_COMMANDS_TOPIC,
            schemaEntry.schema,
        );
        const producer = await this.getProducer();

        await producer.send({
            topic: ORDER_COMMANDS_TOPIC,
            // kafkajs requires acks: -1 on every send() when the producer is idempotent; it is a per-send
            // option, not part of ProducerConfig, so it cannot be set once at producer creation.
            acks: -1,
            messages: [
                {
                    key: String(payload.orderUuid),
                    value: encodeConfluentMessage(schemaId, payload),
                    headers: { type: String(payload.type) },
                },
            ],
        });
    }

    private resolveSchema(eventType: string): OutboundEventSchema {
        const entry = (OUTBOUND_EVENT_SCHEMAS as Record<string, OutboundEventSchema | undefined>)[
            eventType
        ];
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
        // Prevents kafkajs's internal send retries from duplicating messages on the broker.
        // kafkajs requires maxInFlightRequests <= 5 and acks: -1; pinned explicitly in case defaults change.
        this.producer = kafka.producer({
            idempotent: true,
            maxInFlightRequests: 5,
        });
        await this.producer.connect();
        return this.producer;
    }

    async onModuleDestroy(): Promise<void> {
        await this.producer?.disconnect();
    }
}
