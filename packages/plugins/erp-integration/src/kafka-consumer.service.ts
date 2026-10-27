import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger, RequestContextService, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { Consumer, Kafka } from 'kafkajs';
import type { EachMessagePayload, SASLOptions } from 'kafkajs';

import { KafkaConsumerStatusMirror } from './kafka-consumer-status-mirror';
import { IntegrationInboxService } from './integration-inbox.service';
import { SCHEMA_BY_STREAM } from './kafka-consumer-schemas';
import type { ClassifiedKafkaMessage } from './kafka-inbound-message';
import { classifyInboundMessage } from './kafka-inbound-message';
import { classifyOrderEventMessage, ORDER_EVENT_STREAMS } from './order-events-message';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions, InboundStream } from './types';

const ORDER_EVENT_STREAM_SET: ReadonlySet<InboundStream> = new Set(ORDER_EVENT_STREAMS);

// Plain protobuf toBinary() payloads, no Confluent header: decode statically, not via Registry.
// Offset is committed only after the inbox write resolves, so ack never precedes the durable write.
// Setup documents carry lists of up to 100k ids; the broker's message limit is 8 MiB.
const FETCH_MAX_BYTES = 16 * 1024 * 1024;
const CONNECT_MAX_ATTEMPTS = 8;
const CONNECT_BASE_DELAY_MS = 1000;
const CONNECT_MAX_DELAY_MS = 60_000;

// kafkajs auto-restarts only retriable crashes; a non-retriable one (e.g. ACL denial) stays dead.
// Supervisor retries with capped backoff so recovery needs no process restart.
const CRASH_RETRY_BASE_DELAY_MS = 1000;
const CRASH_RETRY_MAX_DELAY_MS = 60_000;
// A runner can stop without a non-retriable CRASH event ("consumer not running, exiting");
// if not connected again within this window, rebuild the consumer.
const STALL_WATCHDOG_MS = 120_000;

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
    private consumer: Consumer | undefined;
    private connected = false;
    private destroyed = false;
    private crashRetryTimeout: NodeJS.Timeout | undefined;
    private crashRetryAttempt = 0;
    private stallWatchdog: NodeJS.Timeout | undefined;
    private readonly statusMirror: KafkaConsumerStatusMirror;

    constructor(
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
        private readonly inbox: IntegrationInboxService,
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {
        this.statusMirror = new KafkaConsumerStatusMirror(connection, () => this.adminCtx());
    }

    private adminCtx(): Promise<RequestContext> {
        return this.requestContextService.create({ apiType: 'admin' });
    }

    isConnected(): boolean {
        return this.connected;
    }

    // A failed start() must still schedule crash-retry before rethrowing, or the consumer stays dead.
    async start(): Promise<void> {
        try {
            await this.runOnce();
        } catch (err) {
            this.scheduleCrashRetry();
            throw err;
        }
    }

    // Crashed Consumer instances are never reused; each retry builds a fresh Kafka and Consumer.
    private async runOnce(): Promise<void> {
        const kafka = new Kafka({
            clientId: this.options.kafkaConsumer.clientId,
            brokers: this.options.kafkaConsumer.brokers,
            ssl: this.options.kafkaConsumer.ssl,
            sasl: this.options.kafkaConsumer.sasl as SASLOptions | undefined,
        });
        this.consumer = kafka.consumer({
            groupId: this.options.kafkaConsumer.groupId,
            maxBytesPerPartition: FETCH_MAX_BYTES,
            maxBytes: FETCH_MAX_BYTES,
        });

        const consumer = this.consumer;
        consumer.on(consumer.events.CONNECT, () => {
            this.connected = true;
            this.crashRetryAttempt = 0;
            this.clearStallWatchdog();
            this.statusMirror.set(true);
        });
        const onStopped = (): void => {
            this.connected = false;
            this.statusMirror.set(false);
            if (this.consumer === consumer) this.armStallWatchdog();
        };
        consumer.on(consumer.events.DISCONNECT, onStopped);
        consumer.on(consumer.events.STOP, onStopped);
        // Only step in when restart is false: kafkajs already restarts; a second reconnect double-joins.
        consumer.on(consumer.events.CRASH, ({ payload }) => {
            onStopped();
            if (payload.restart || this.consumer !== consumer) return;
            this.scheduleCrashRetry();
        });

        await this.connectWithBackoff();

        // A failed subscribe for one topic is logged and skipped so the others still consume.
        // Throwing here would stop consumption of every healthy topic, since run() is never reached.
        const streamByTopic = new Map<string, InboundStream>();
        const orderEventTopics = new Set<string>();
        for (const [stream, topic] of Object.entries(this.options.kafkaConsumer.topics)) {
            const isOrderEvent = ORDER_EVENT_STREAM_SET.has(stream as InboundStream);
            if (isOrderEvent && orderEventTopics.has(topic)) continue;
            if (!isOrderEvent && !(stream in SCHEMA_BY_STREAM)) {
                Logger.error(
                    `No schema for stream=${stream}, not subscribing to topic=${topic}`,
                    loggerCtx,
                );
                continue;
            }
            try {
                await this.consumer.subscribe({ topic, fromBeginning: true });
                if (isOrderEvent) orderEventTopics.add(topic);
                else streamByTopic.set(topic, stream as InboundStream);
            } catch (err) {
                Logger.error(
                    `Failed to subscribe to topic=${topic} (stream=${stream}): ${
                        err instanceof Error ? err.message : String(err)
                    } — other topics still consumed`,
                    loggerCtx,
                );
            }
        }
        if (streamByTopic.size === 0 && orderEventTopics.size === 0) {
            Logger.error(
                'No topics could be subscribed to — this consumer will receive no messages until at least one succeeds',
                loggerCtx,
            );
        }

        await this.consumer.run({
            eachMessage: async (payload: EachMessagePayload) => {
                if (orderEventTopics.has(payload.topic)) {
                    await this.handleOrderEvent(payload);
                    return;
                }
                const stream = streamByTopic.get(payload.topic);
                if (!stream) return;
                await this.handleMessage(stream, payload);
            },
        });
    }

    private armStallWatchdog(): void {
        if (this.destroyed || this.stallWatchdog || this.crashRetryTimeout) return;
        this.stallWatchdog = setTimeout(() => {
            this.stallWatchdog = undefined;
            if (this.destroyed || this.connected) return;
            Logger.warn('Kafka consumer stalled without reconnecting, rebuilding it', loggerCtx);
            const stale = this.consumer;
            stale?.disconnect().catch(() => undefined);
            this.scheduleCrashRetry();
        }, STALL_WATCHDOG_MS);
    }

    private clearStallWatchdog(): void {
        if (this.stallWatchdog) clearTimeout(this.stallWatchdog);
        this.stallWatchdog = undefined;
    }

    private scheduleCrashRetry(): void {
        if (this.destroyed) return;
        this.clearStallWatchdog();
        if (this.crashRetryTimeout) clearTimeout(this.crashRetryTimeout);
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
            this.crashRetryTimeout = undefined;
            if (this.destroyed) return;
            this.runOnce().catch(err => {
                Logger.error(
                    `Kafka consumer crash-retry failed to reconnect: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                    loggerCtx,
                );
                // A failing retry must schedule the next attempt; a one-shot retry would leave the consumer dead.
                this.scheduleCrashRetry();
            });
        }, delay);
    }

    // Unprocessable messages are dead-lettered into the inbox, then committed; if recording or
    // enqueueing fails this rethrows, so the offset is not committed (docs/integration-health.md).
    private async handleMessage(
        stream: InboundStream,
        { message, partition }: EachMessagePayload,
    ): Promise<void> {
        const schema = SCHEMA_BY_STREAM[stream as keyof typeof SCHEMA_BY_STREAM];
        if (!schema) throw new Error(`No schema registered for stream ${stream}`);
        await this.store(
            classifyInboundMessage(stream, schema, message, partition ?? 0),
            stream,
            message.offset,
        );
    }

    private async handleOrderEvent({ message, partition }: EachMessagePayload): Promise<void> {
        const classified = classifyOrderEventMessage(message, partition ?? 0);
        if (classified.kind === 'skipped') {
            Logger.warn(
                `Skipped order event type=${classified.type} (offset=${message.offset})`,
                loggerCtx,
            );
            return;
        }
        const stream =
            classified.kind === 'enqueue' ? classified.input.stream : classified.rejected.stream;
        await this.store(classified, stream, message.offset);
    }

    private async store(
        classified: ClassifiedKafkaMessage,
        stream: InboundStream,
        offset: string,
    ): Promise<void> {
        if (classified.kind === 'rejected') {
            Logger.error(
                `Rejected ${stream} message (offset=${offset}): ${classified.rejected.reason}`,
                loggerCtx,
            );
            await this.inbox.enqueueRejected(await this.adminCtx(), classified.rejected);
            return;
        }
        await this.inbox.enqueue(await this.adminCtx(), classified.input);
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
        this.clearStallWatchdog();
        this.connected = false;
        try {
            await this.consumer?.disconnect();
        } catch (err) {
            Logger.error(
                `Kafka consumer disconnect failed on shutdown: ${
                    err instanceof Error ? err.message : String(err)
                }`,
                loggerCtx,
            );
        }
        await this.statusMirror.setFinal(false);
    }
}
