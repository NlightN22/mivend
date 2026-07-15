import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SyncEventSchema, assertNever } from 'shared';
import type { SyncEventByType } from 'shared';

import { OrderSyncService } from '../order-sync.service';
import { SyncProcessedEvent } from '../entities/sync-processed-event.entity';
import { RabbitMQService } from '../rabbitmq.service';
import { SyncLogger } from '../sync-logger';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';

// The Central-side counterpart to ProductConsumer (the sole RabbitMQ subscriber for a branch's
// queue) — Central previously only ever published, never subscribed, so a branch-originated
// event (a branch-local operator's order, target='central') had nowhere to land. Binds only to
// `#.central` — never a bare `#` alone (see RabbitMQService.subscribe's comment on why); Central never
// legitimately receives administrator.*/product.* etc. from a branch (branches don't produce
// them), so this only ever needs to handle order events.
@Injectable()
export class CentralConsumer implements OnModuleInit {
    constructor(
        private readonly rabbitmq: RabbitMQService,
        private readonly dataSource: DataSource,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
        private readonly orderSyncService: OrderSyncService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
        const queueName = `sync.${this.options.instanceId}`;
        // Bound to the literal 'central' target, not this instance's own configured
        // `instanceId` (which may differ, e.g. 'hub' in dev/test configs) — there is exactly
        // one hub, so branches address it by the fixed well-known token 'central'
        // (OrderConsumer's producer hardcodes this same literal for a branch-originated order).
        await this.rabbitmq.subscribe(queueName, '#.central', raw => this.handleRaw(raw));
        this.logger.info(`CentralConsumer subscribed to ${queueName}`);
    }

    private async handleRaw(raw: unknown): Promise<void> {
        const event = SyncEventSchema.parse(raw);

        // Defense-in-depth, not load-bearing — see ProductConsumer's identical guard.
        if (event.sourceInstanceId === this.options.instanceId) return;

        switch (event.eventType) {
            case 'order.created':
                await this.handleOrderCreated(event);
                break;
            case 'order.updated':
                await this.handleOrderUpdated(event);
                break;
            case 'product.created':
            case 'product.updated':
            case 'product.deleted':
            case 'administrator.created':
            case 'administrator.updated':
            case 'administrator.deactivated':
            case 'price.updated':
            case 'customer.created':
            case 'customer.updated':
            case 'credit-terms.updated':
            case 'inventory.updated':
            case 'reservation.created':
            case 'reservation.released':
                this.logger.info(`Skipping ${event.eventType} — not handled by CentralConsumer`);
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

    private async handleOrderCreated(event: SyncEventByType<'order.created'>): Promise<void> {
        const isNew = await this.dataSource.transaction(em =>
            this.tryMarkProcessed(em, event.eventId),
        );
        if (!isNew) return;
        await this.orderSyncService.applyCreate(event);
        this.logger.info(`Applied order.created [${event.payload.sourceOrderId}]`);
    }

    private async handleOrderUpdated(event: SyncEventByType<'order.updated'>): Promise<void> {
        const isNew = await this.dataSource.transaction(em =>
            this.tryMarkProcessed(em, event.eventId),
        );
        if (!isNew) return;
        await this.orderSyncService.applyUpdate(event);
        this.logger.info(`Applied order.updated [${event.payload.sourceOrderId}]`);
    }
}
