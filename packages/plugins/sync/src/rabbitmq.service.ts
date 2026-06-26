import * as amqplib from 'amqplib';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { DLX, EXCHANGE, SYNC_PLUGIN_OPTIONS } from './types';
import type { SyncPluginOptions } from './types';
import { SyncLogger } from './sync-logger';

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
    private connection: amqplib.ChannelModel | null = null;
    private channel: amqplib.Channel | null = null;
    private readonly exchange: string;
    private readonly dlx: string;

    constructor(
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
    ) {
        this.exchange = options.rabbitmq.exchange ?? EXCHANGE;
        this.dlx = options.rabbitmq.dlx ?? DLX;
    }

    async onModuleInit(): Promise<void> {
        await this.connect();
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
        const ch = this.requireChannel();
        const content = Buffer.from(JSON.stringify(event));
        ch.publish(this.exchange, routingKey, content, { persistent: true });
    }

    async subscribe(
        queueName: string,
        bindingKey: string,
        handler: (raw: unknown) => Promise<void>,
    ): Promise<void> {
        const ch = this.requireChannel();
        await ch.assertQueue(queueName, {
            durable: true,
            arguments: { 'x-dead-letter-exchange': this.dlx },
        });
        await ch.bindQueue(queueName, this.exchange, bindingKey);
        await ch.consume(queueName, async msg => {
            if (!msg) return;
            try {
                const raw: unknown = JSON.parse(msg.content.toString());
                await handler(raw);
                ch.ack(msg);
            } catch (err) {
                this.logger.error(`Consumer error on ${queueName}`, err);
                // ZodError = schema mismatch — requeueing would loop forever, go to DLQ immediately
                const isSchemaError = err instanceof Error && err.name === 'ZodError';
                ch.nack(msg, false, !isSchemaError);
            }
        });
    }

    requireChannel(): amqplib.Channel {
        if (!this.channel) throw new Error('RabbitMQ channel not initialized');
        return this.channel;
    }
}
