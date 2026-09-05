import { fromBinary, toJson } from '@bufbuild/protobuf';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger } from '@vendure/core';
import {
    CategoryChangedSchema,
    OfferChangedSchema,
    OrganizationChangedSchema,
    PriceChangedSchema,
    PriceTypeChangedSchema,
    ProductChangedSchema,
    StockChangedSchema,
    StockOrganizationChangedSchema,
    StorageLocationChangedSchema,
    WarehouseChangedSchema,
} from '@nlightn22/event-contracts';
import { Consumer, Kafka } from 'kafkajs';
import type { EachMessagePayload, SASLOptions } from 'kafkajs';

import { IntegrationInboxService } from './integration-inbox.service';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions, InboundStream } from './types';

// Reference shape: Integration Service's own search-service kafka-consumer.service.ts (issue
// #62's "Researched" section) — one Consumer, one groupId, subscribed to every configured topic,
// fromBeginning: true, with an outer capped-backoff retry loop around the initial connect()
// (kafkajs's own internal retry gives up and throws after a bounded number of attempts; without
// an outer loop a broker outage longer than that leaves the consumer dead until a restart).
//
// Decode: these 8 topics are plain protobuf `toBinary()`, never a Confluent wire-format
// header/Registry lookup — verified against Integration Service's real producer
// (outbox-event-mapper.ts, `toBinary(<Schema>, message)`, no magic byte/schema id) and
// search-service's own consumer, which decodes with a static, compile-time-known
// `fromBinary(SCHEMA_BY_STREAM[stream], ...)`. This mirrors that exactly — a Registry-dynamic
// decode would fail on every message from these topics, since they were never encoded that way.
// The Registry stays legitimate for this plugin's own OUTBOUND `OrderSubmitted` producer only
// (see schema-registry.client.ts / kafka-producer.service.ts) — that direction is
// producer-authoritative and MiVend's own choice, unrelated to how Integration Service encodes
// its own outbound streams. See docs/ai/1c-integration-service-decision.md's 2026-08-14
// retraction for the full reasoning.
//
// Message handling never processes an event inline — it only decodes the protobuf payload and
// writes it to the inbox (the external-integration-rules skill). The Kafka offset is only committed (by returning
// from eachMessage without throwing) once that inbox write has resolved, so ack happens strictly
// after the durable write — never before.
const CONNECT_MAX_ATTEMPTS = 8;
const CONNECT_BASE_DELAY_MS = 1000;
const CONNECT_MAX_DELAY_MS = 60_000;

// Issue #71: kafkajs's own Runner only auto-restarts a crashed consumer.run() for a *retriable*
// error (see kafkajs's onCrash/isErrorRetriable) — a non-retriable crash (e.g.
// KafkaJSGroupCoordinatorNotFound from a Kafka ACL rejecting the consumer group) is left
// permanently dead with no further attempts, even after the external cause is fixed. This mirrors
// connectWithBackoff's own capped-backoff shape so recovery from a fixed-externally condition
// doesn't require a full app process restart.
const CRASH_RETRY_BASE_DELAY_MS = 1000;
const CRASH_RETRY_MAX_DELAY_MS = 60_000;

const SCHEMA_BY_STREAM: Record<InboundStream, Parameters<typeof fromBinary>[0]> = {
    category: CategoryChangedSchema,
    organization: OrganizationChangedSchema,
    warehouse: WarehouseChangedSchema,
    'price-type': PriceTypeChangedSchema,
    product: ProductChangedSchema,
    offer: OfferChangedSchema,
    price: PriceChangedSchema,
    stock: StockChangedSchema,
    'storage-location': StorageLocationChangedSchema,
    'stock-organization': StockOrganizationChangedSchema,
};

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
    private consumer: Consumer | undefined;
    private connected = false;
    private destroyed = false;
    private crashRetryTimeout: NodeJS.Timeout | undefined;
    private crashRetryAttempt = 0;

    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly inbox: IntegrationInboxService,
    ) {}

    isConnected(): boolean {
        return this.connected;
    }

    async start(): Promise<void> {
        await this.runOnce();
    }

    // One full connect+subscribe+run cycle against a fresh Kafka/Consumer instance. Called once
    // by start(), and again by the crash supervisor below whenever kafkajs itself gives up on a
    // non-retriable crash — a crashed Consumer instance is never reused, matching kafkajs's own
    // internal restart behavior (it always tears down and recreates on restart too).
    private async runOnce(): Promise<void> {
        const kafka = new Kafka({
            clientId: this.options.kafkaConsumer.clientId,
            brokers: this.options.kafkaConsumer.brokers,
            ssl: this.options.kafkaConsumer.ssl,
            sasl: this.options.kafkaConsumer.sasl as SASLOptions | undefined,
        });
        this.consumer = kafka.consumer({ groupId: this.options.kafkaConsumer.groupId });

        this.consumer.on(this.consumer.events.CONNECT, () => {
            this.connected = true;
            this.crashRetryAttempt = 0;
        });
        this.consumer.on(this.consumer.events.DISCONNECT, () => {
            this.connected = false;
        });
        // e.restart is kafkajs's own decision (isErrorRetriable — see kafkajs's onCrash): true
        // means kafkajs is already restarting the same Consumer instance itself, so scheduling a
        // second, competing reconnect here would join the consumer group twice (issue #67's
        // rebalance-stall bug). Only step in when kafkajs decided restart:false.
        this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
            this.connected = false;
            if (payload.restart) return;
            this.scheduleCrashRetry();
        });

        await this.connectWithBackoff();

        const topics = Object.values(this.options.kafkaConsumer.topics);
        for (const topic of topics) {
            await this.consumer.subscribe({ topic, fromBeginning: true });
        }

        const streamByTopic = new Map<string, InboundStream>(
            Object.entries(this.options.kafkaConsumer.topics).map(([stream, topic]) => [
                topic,
                stream as InboundStream,
            ]),
        );

        await this.consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
                const stream = streamByTopic.get(payload.topic);
                if (!stream) return;
                await this.handleMessage(stream, payload);
            },
        });
    }

    private scheduleCrashRetry(): void {
        if (this.destroyed) return;
        this.crashRetryAttempt += 1;
        const delay = Math.min(
            CRASH_RETRY_BASE_DELAY_MS * 2 ** (this.crashRetryAttempt - 1),
            CRASH_RETRY_MAX_DELAY_MS,
        );
        Logger.warn(
            `Kafka consumer crashed without kafkajs auto-restart (non-retriable), reconnecting in ${delay}ms (attempt ${this.crashRetryAttempt})`,
            loggerCtx,
        );
        this.crashRetryTimeout = setTimeout(() => {
            if (this.destroyed) return;
            this.runOnce().catch(err => {
                Logger.error(
                    `Kafka consumer crash-retry failed to reconnect: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                    loggerCtx,
                );
            });
        }, delay);
    }

    // Never throws — an undecodable message must not crash the consumer or block partition
    // progress for other messages. Logged and skipped (offset still commits): a genuinely
    // malformed payload can't be retried into validity, unlike a downstream-processing failure
    // (which goes through the inbox's own retry/dead-letter path instead) — same shape as
    // search-service's own consumer.
    private async handleMessage(
        stream: InboundStream,
        { message }: EachMessagePayload,
    ): Promise<void> {
        if (!message.value) return;
        try {
            const schema = SCHEMA_BY_STREAM[stream];
            const decoded = fromBinary(schema, new Uint8Array(message.value));
            const record = toJson(schema, decoded) as Record<string, unknown>;

            const entityId = String(record.entityId ?? '');
            const version = String(record.version ?? '');
            const sourceEventId = String(record.eventId ?? message.key?.toString() ?? '');

            if (!entityId || !sourceEventId) {
                Logger.error(
                    `Dropping ${stream} message with missing entityId/eventId (offset=${message.offset})`,
                    loggerCtx,
                );
                return;
            }

            await this.inbox.enqueue({
                stream,
                entityId,
                version,
                sourceEventId,
                payload: record,
            });
        } catch (err) {
            Logger.error(
                `Failed to decode/enqueue ${stream} message (offset=${message.offset}): ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
    }

    private async connectWithBackoff(): Promise<void> {
        let attempt = 0;
        for (;;) {
            try {
                await this.consumer!.connect();
                return;
            } catch (err) {
                attempt += 1;
                if (attempt >= CONNECT_MAX_ATTEMPTS) throw err;
                const delay = Math.min(
                    CONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
                    CONNECT_MAX_DELAY_MS,
                );
                Logger.warn(
                    `Kafka consumer connect attempt ${attempt} failed, retrying in ${delay}ms`,
                    loggerCtx,
                );
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    async onModuleDestroy(): Promise<void> {
        this.destroyed = true;
        if (this.crashRetryTimeout) clearTimeout(this.crashRetryTimeout);
        await this.consumer?.disconnect();
    }
}
