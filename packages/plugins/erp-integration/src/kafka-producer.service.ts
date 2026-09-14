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
    // error itself (the no-silent-drops messaging invariant — no silent drops).
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
            // acks: -1 (all) — kafkajs requires this on every send() when the producer itself
            // was created with idempotent: true (see getProducer's own comment); it's a per-send
            // option in kafkajs's types, not part of ProducerConfig.
            acks: -1,
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
        // idempotent: true — without it, kafkajs's own internal retry on a transient
        // send failure (broker timeout, leader-not-available, etc.) can duplicate a message on
        // the broker even though outboxService/the outbox row's own eventId already gives every
        // payload a stable, de-dupeable key. This closes the gap at the producer/broker level
        // instead of relying solely on the consumer-side dedup key downstream (see
        // external-integration-rules skill's "Producer idempotency" section). kafkajs requires
        // maxInFlightRequests <= 5 and acks: -1 (all) whenever idempotent is true — both are
        // kafkajs's own enforced defaults for an idempotent producer, set explicitly here so this
        // doesn't silently break if kafkajs's defaults ever change.
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
