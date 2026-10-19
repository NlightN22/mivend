import type { fromBinary } from '@bufbuild/protobuf';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Logger, RequestContextService, TransactionalConnection } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import {
    CategoryChangedSchema,
    ContractChangedSchema,
    CounterpartyChangedSchema,
    CounterpartyCreditBalanceChangedSchema,
    DepartmentChangedSchema,
    DiscountRuleChangedSchema,
    GrantedDiscountChangedSchema,
    OfferChangedSchema,
    OrderStatusChangedSchema,
    OrganizationChangedSchema,
    PointOfSaleChangedSchema,
    PositionChangedSchema,
    PriceChangedSchema,
    PriceTypeChangedSchema,
    ProductChangedSchema,
    PromoRuleChangedSchema,
    GrantedRetroBonusChangedSchema,
    RetroBonusRuleChangedSchema,
    SettlementBalanceChangedSchema,
    SettlementDocumentChangedSchema,
    SettlementDocumentTypeChangedSchema,
    StockChangedSchema,
    StockOrganizationChangedSchema,
    StorageLocationChangedSchema,
    ManufacturerChangedSchema,
    RegionChangedSchema,
    LegalFormChangedSchema,
    BankChangedSchema,
    BankAccountChangedSchema,
    ProductPhotoChangedSchema,
    UnitChangedSchema,
    UserChangedSchema,
    VatRateChangedSchema,
    WarehouseChangedSchema,
} from '@nlightn22/event-contracts';
import { Consumer, Kafka } from 'kafkajs';
import type { EachMessagePayload, SASLOptions } from 'kafkajs';

import { KafkaConsumerStatus } from './entities/kafka-consumer-status.entity';
import { IntegrationInboxService } from './integration-inbox.service';
import type { ClassifiedKafkaMessage } from './kafka-inbound-message';
import { classifyInboundMessage } from './kafka-inbound-message';
import { classifyOrderEventMessage, ORDER_EVENT_STREAMS } from './order-events-message';
import { ERP_INTEGRATION_PLUGIN_OPTIONS, loggerCtx } from './types';
import type { ErpIntegrationPluginOptions, InboundStream } from './types';

type OrderEventStream = 'order-registration-result' | 'order-changed' | 'order-cancel-result';
const ORDER_EVENT_STREAM_SET: ReadonlySet<InboundStream> = new Set(ORDER_EVENT_STREAMS);

// Worker and HTTP controller run in separate Node processes; this row is the only shared state.
// isConnected() is in-memory, so the status controller reads it through this row.
const STATUS_KEY = 'default';

// Plain protobuf toBinary() payloads, no Confluent header: decode statically, not via Registry.
// Offset is committed only after the inbox write resolves, so ack never precedes the durable write.
const CONNECT_MAX_ATTEMPTS = 8;
const CONNECT_BASE_DELAY_MS = 1000;
const CONNECT_MAX_DELAY_MS = 60_000;

// kafkajs auto-restarts only retriable crashes; a non-retriable one (e.g. ACL denial) stays dead.
// Supervisor retries with capped backoff so recovery needs no process restart.
const CRASH_RETRY_BASE_DELAY_MS = 1000;
const CRASH_RETRY_MAX_DELAY_MS = 60_000;

const SCHEMA_BY_STREAM: Record<
    Exclude<InboundStream, OrderEventStream>,
    Parameters<typeof fromBinary>[0]
> = {
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
    'order-status': OrderStatusChangedSchema,
    department: DepartmentChangedSchema,
    position: PositionChangedSchema,
    counterparty: CounterpartyChangedSchema,
    'counterparty-credit-balance': CounterpartyCreditBalanceChangedSchema,
    user: UserChangedSchema,
    'promo-rule': PromoRuleChangedSchema,
    'discount-rule': DiscountRuleChangedSchema,
    'granted-discount': GrantedDiscountChangedSchema,
    'retro-bonus-rule': RetroBonusRuleChangedSchema,
    'granted-retro-bonus': GrantedRetroBonusChangedSchema,
    'settlement-document': SettlementDocumentChangedSchema,
    'settlement-balance': SettlementBalanceChangedSchema,
    'settlement-document-type': SettlementDocumentTypeChangedSchema,
    'vat-rate': VatRateChangedSchema,
    'point-of-sale': PointOfSaleChangedSchema,
    contract: ContractChangedSchema,
    unit: UnitChangedSchema,
    manufacturer: ManufacturerChangedSchema,
    region: RegionChangedSchema,
    'legal-form': LegalFormChangedSchema,
    bank: BankChangedSchema,
    'bank-account': BankAccountChangedSchema,
    'product-photo': ProductPhotoChangedSchema,
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
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
    ) {}

    private adminCtx(): Promise<RequestContext> {
        return this.requestContextService.create({ apiType: 'admin' });
    }

    isConnected(): boolean {
        return this.connected;
    }

    // Fire-and-forget: a DB hiccup here must never crash Kafka message handling — this is a
    // best-effort status mirror, not a business-critical write.
    private persistStatus(connected: boolean): void {
        this.adminCtx()
            .then(ctx =>
                this.connection
                    .getRepository(ctx, KafkaConsumerStatus)
                    .upsert({ key: STATUS_KEY, connected }, { conflictPaths: ['key'] }),
            )
            .catch(err => {
                Logger.error(
                    `Failed to persist Kafka consumer status: ${
                        err instanceof Error ? err.message : String(err)
                    }`,
                    loggerCtx,
                );
            });
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
        this.consumer = kafka.consumer({ groupId: this.options.kafkaConsumer.groupId });

        this.consumer.on(this.consumer.events.CONNECT, () => {
            this.connected = true;
            this.crashRetryAttempt = 0;
            this.persistStatus(true);
        });
        this.consumer.on(this.consumer.events.DISCONNECT, () => {
            this.connected = false;
            this.persistStatus(false);
        });
        // Only step in when restart is false: kafkajs already restarts; a second reconnect double-joins.
        this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
            this.connected = false;
            this.persistStatus(false);
            if (payload.restart) return;
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
        await this.adminCtx()
            .then(ctx =>
                this.connection
                    .getRepository(ctx, KafkaConsumerStatus)
                    .upsert({ key: STATUS_KEY, connected: false }, { conflictPaths: ['key'] }),
            )
            // best-effort: status row is advisory and shutdown must not fail on it.
            .catch(() => undefined);
    }
}
