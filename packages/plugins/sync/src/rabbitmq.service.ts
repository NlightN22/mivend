import * as amqplib from 'amqplib';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import {
    DLX,
    EXCHANGE,
    MAX_RETRY_DEFAULT,
    RETRY_BASE_DELAY_DEFAULT,
    SYNC_PLUGIN_OPTIONS,
} from './types';
import type { SyncPluginOptions } from './types';
import { SyncLogger } from './sync-logger';

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
    private connection: amqplib.ChannelModel | null = null;
    private channel: amqplib.Channel | null = null;
    private readonly exchange: string;
    private readonly dlx: string;
    // Nest runs onModuleInit hooks concurrently within a module, so consumers must not rely on
    // this service's onModuleInit having finished connecting; subscribe() raced and threw.
    private readonly ready: Promise<void>;
    // Per-process only, not durable across restarts: it just stops tight nack(requeue=true) loops
    // that, with no cap or backoff, can flood the process and exhaust host memory.
    private readonly retryCounts = new Map<string, number>();

    constructor(
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
    ) {
        this.exchange = options.rabbitmq.exchange ?? EXCHANGE;
        this.dlx = options.rabbitmq.dlx ?? DLX;
        this.ready = this.connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.channel?.close();
        await this.connection?.close();
    }

    async connect(): Promise<void> {
        this.connection = await amqplib.connect(this.options.rabbitmq.url);
        this.channel = await this.connection.createChannel();
        await this.setupTopology();
        this.logger.info('RabbitMQ connected');
    }

    private async setupTopology(): Promise<void> {
        const ch = this.requireChannel();
        await ch.assertExchange(this.dlx, 'topic', { durable: true });
        await ch.assertExchange(this.exchange, 'topic', {
            durable: true,
            arguments: { 'x-dead-letter-exchange': this.dlx },
        });
    }

    async publish(routingKey: string, event: unknown): Promise<void> {
        await this.ready;
        const ch = this.requireChannel();
        const content = Buffer.from(JSON.stringify(event));
        ch.publish(this.exchange, routingKey, content, { persistent: true });
    }

    // Leading # (zero-or-more words), not *: eventType has dots, so the routing key has a
    // variable segment count. Never bare #: it would echo a central instance's own broadcasts.
    async subscribe(
        queueName: string,
        bindingKeys: string | string[],
        handler: (raw: unknown) => Promise<void>,
    ): Promise<void> {
        await this.ready;
        const ch = this.requireChannel();
        await ch.assertQueue(queueName, {
            durable: true,
            arguments: { 'x-dead-letter-exchange': this.dlx },
        });
        for (const bindingKey of Array.isArray(bindingKeys) ? bindingKeys : [bindingKeys]) {
            await ch.bindQueue(queueName, this.exchange, bindingKey);
        }
        await ch.consume(queueName, async msg => {
            if (!msg) return;

            let raw: unknown;
            try {
                raw = JSON.parse(msg.content.toString());
            } catch (err) {
                this.logger.error(`Malformed (non-JSON) message on ${queueName}`, err);
                ch.nack(msg, false, false);
                return;
            }

            const retryKey = this.retryKeyFor(raw);
            try {
                await handler(raw);
                ch.ack(msg);
                if (retryKey) this.retryCounts.delete(retryKey);
            } catch (err) {
                this.logger.error(`Consumer error on ${queueName}`, err);
                // ZodError = schema mismatch — retrying can never succeed, go to DLQ immediately.
                const isSchemaError = err instanceof Error && err.name === 'ZodError';
                if (isSchemaError) {
                    ch.nack(msg, false, false);
                    return;
                }

                const key = retryKey ?? 'unknown';
                const attempts = (this.retryCounts.get(key) ?? 0) + 1;
                const maxRetry = this.options.maxRetry ?? MAX_RETRY_DEFAULT;
                if (attempts >= maxRetry) {
                    this.logger.error(
                        `Giving up on ${queueName} after ${attempts} attempts — routing to DLQ`,
                        err,
                    );
                    this.retryCounts.delete(key);
                    ch.nack(msg, false, false);
                    return;
                }
                this.retryCounts.set(key, attempts);

                // Back off exponentially before requeueing: nack(requeue=true) with zero delay becomes a
                // tight redelivery loop that can exhaust host memory.
                const baseDelayMs = this.options.retryBaseDelayMs ?? RETRY_BASE_DELAY_DEFAULT;
                const delayMs = Math.min(baseDelayMs * 2 ** (attempts - 1), 10_000);
                setTimeout(() => {
                    try {
                        ch.nack(msg, false, true);
                    } catch {
                        // best-effort: channel may already be closed (module shutting down).
                    }
                }, delayMs);
            }
        });
    }

    private retryKeyFor(raw: unknown): string | undefined {
        if (raw && typeof raw === 'object' && 'eventId' in raw) {
            const eventId = (raw as { eventId?: unknown }).eventId;
            if (typeof eventId === 'string') return eventId;
        }
        return undefined;
    }

    requireChannel(): amqplib.Channel {
        if (!this.channel) throw new Error('RabbitMQ channel not initialized');
        return this.channel;
    }
}
