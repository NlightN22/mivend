import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SyncEventSchema, assertNever } from 'shared';
import type { SyncEventByType } from 'shared';

import { SyncProcessedEvent } from '../entities/sync-processed-event.entity';
import { RabbitMQService } from '../rabbitmq.service';
import { SyncLogger } from '../sync-logger';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

@Injectable()
export class ProductConsumer implements OnModuleInit {
    constructor(
        private readonly rabbitmq: RabbitMQService,
        private readonly dataSource: DataSource,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'branch') return;
        const queueName = `sync.${this.options.instanceId}`;
        await this.rabbitmq.subscribe(queueName, '#', raw => this.handleRaw(raw));
        this.logger.info(`ProductConsumer subscribed to ${queueName}`);
    }

    private async handleRaw(raw: unknown): Promise<void> {
        const event = SyncEventSchema.parse(raw);

        switch (event.eventType) {
            case 'product.created':
                await this.handleProductCreated(event);
                break;
            case 'product.updated':
                await this.handleProductUpdated(event);
                break;
            case 'product.deleted':
                await this.handleProductDeleted(event);
                break;
            case 'price.updated':
            case 'customer.created':
            case 'customer.updated':
            case 'credit-terms.updated':
            case 'order.created':
            case 'order.updated':
            case 'inventory.updated':
            case 'reservation.created':
            case 'reservation.released':
                this.logger.info(`Skipping ${event.eventType} — not handled by ProductConsumer`);
                break;
            default:
                return assertNever(event);
        }
    }

    private async tryMarkProcessed(em: EntityManager, eventId: string): Promise<boolean> {
        const result = await em
            .createQueryBuilder()
            .insert()
            .into(SyncProcessedEvent)
            .values({ eventId })
            .orIgnore()
            .execute();
        return result.identifiers.length > 0;
    }

    private async handleProductCreated(event: SyncEventByType<'product.created'>): Promise<void> {
        await this.dataSource.transaction(async em => {
            if (!(await this.tryMarkProcessed(em, event.eventId))) return;
            await em.query(`UPDATE product SET enabled = $1 WHERE id = $2`, [
                event.payload.enabled,
                event.payload.productId,
            ]);
        });
        this.logger.info(`Applied product.created [${event.payload.productId}]`);
    }

    private async handleProductUpdated(event: SyncEventByType<'product.updated'>): Promise<void> {
        await this.dataSource.transaction(async em => {
            if (!(await this.tryMarkProcessed(em, event.eventId))) return;
            if (event.payload.enabled !== undefined) {
                await em.query(`UPDATE product SET enabled = $1 WHERE id = $2`, [
                    event.payload.enabled,
                    event.payload.productId,
                ]);
            }
        });
        this.logger.info(`Applied product.updated [${event.payload.productId}]`);
    }

    private async handleProductDeleted(event: SyncEventByType<'product.deleted'>): Promise<void> {
        await this.dataSource.transaction(async em => {
            if (!(await this.tryMarkProcessed(em, event.eventId))) return;
            await em.query(`UPDATE product SET deleted_at = NOW() WHERE id = $1`, [
                event.payload.productId,
            ]);
        });
        this.logger.info(`Applied product.deleted [${event.payload.productId}]`);
    }
}
