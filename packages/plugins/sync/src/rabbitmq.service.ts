import * as amqplib from 'amqplib';
import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import { DLX, EXCHANGE, MAX_RETRY_DEFAULT, SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';
import { SyncLogger } from './sync-logger';

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
    private connection: amqplib.ChannelModel | null = null;
    private channel: amqplib.Channel | null = null;
    private readonly exchange: string;
    private readonly dlx: string;
    // Started eagerly in the constructor — i.e. before any provider's onModuleInit hook runs —
    // and awaited by publish()/subscribe() rather than relying on onModuleInit ordering. Nest
    // runs onModuleInit hooks within a module concurrently, not sequentially by provider array
    // order; a consumer's onModuleInit calling subscribe() while this service's own
    // onModuleInit was still mid-connect() raced and threw "RabbitMQ channel not initialized".
    // This only ever surfaced on a branch instance (ProductConsumer/OrderConsumer/
    // ReservationConsumer.onModuleInit no-ops on central), so it stayed latent until the first
    // real branch boot.
    private readonly ready: Promise<void>;
    // In-memory, per-process retry counter keyed by eventId — not durable across a restart,
    // but that's an acceptable gap here: its only job is to stop a still-failing message from
    // being nack(requeue=true)'d in a tight, delay-free loop. A real incident traced to exactly
    // that: a poison message (see erp-adapter.stub.ts's productId fix) with no retry cap and no
    // backoff generated an unbounded flood of redeliveries fast enough to OOM the whole host.
    // AGENTS.md's sync rules already require "retried with backoff and eventually routed to a
    // dead-letter queue" — this was never actually implemented, only documented.
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

    // bindingKeys: one or more topic patterns (e.g. `#.branch-a`, `#.all-branches`) — a leading
    // `#` (zero-or-more words), not `*` (exactly one word): eventType itself already contains a
    // dot (e.g. `order.created`), so the full routing key `<eventType>.<target>` (see
    // SyncService.publishEntry) has a variable number of segments before the target suffix.
    // Never a bare `#` on its own — each queue binds only to the target patterns it actually
    // cares about. This is deliberate:
    // "bind everything with # and filter in application code" is a recognized RabbitMQ
    // anti-pattern (the broker should do the filtering it's designed for), and at this scale
    // the real cost isn't throughput — it's every consumer needing a hand-maintained "skip if
    // not for me" branch for event types it was never meant to receive, including its own
    // self-published broadcasts (a central instance binding `#` would receive back every event
    // it just published to its branches).
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

                // Exponential backoff before requeueing — never nack(requeue=true) instantly.
                // A still-failing message redelivered with zero delay is a tight loop, not a
                // retry: it can flood the process fast enough to exhaust host memory (this is
                // exactly what happened before this fix existed).
                const delayMs = Math.min(500 * 2 ** (attempts - 1), 10_000);
                setTimeout(() => {
                    try {
                        ch.nack(msg, false, true);
                    } catch {
                        // Channel may already be closed (module shutting down) — nothing to do.
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
