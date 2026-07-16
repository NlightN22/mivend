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
// `#.central` — never a bare `#` alone (see RabbitMQService.subscribe's comment on why); Central
// never legitimately receives administrator.*/product.* etc. from a branch (branches don't
// produce them), so this only ever needs to handle order + payment events (the latter e.g. a
// branch till/kassa witnessing cash paid for a Central-origin order it only holds a replica of
// — see docs/architecture.md's "Order as a read-model" section).
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
            case 'payment.recorded':
                await this.handlePaymentRecorded(event);
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

    // Same reasoning as ProductConsumer's identical pair — a plain existence check, not the
    // atomic insert tryMarkProcessed does, since apply happens before mark here (see below).
    private async isAlreadyProcessed(eventId: string): Promise<boolean> {
        const existing = await this.dataSource
            .getRepository(SyncProcessedEvent)
            .findOne({ where: { eventId } });
        return !!existing;
    }

    // Apply-then-mark — see ProductConsumer's identical pair for why: applyUpdate can throw
    // deliberately on "no local replica found yet" to get a real backoff-then-retry instead of
    // silently dropping an update that raced order.created's delivery.
    private async handleOrderCreated(event: SyncEventByType<'order.created'>): Promise<void> {
        if (await this.isAlreadyProcessed(event.eventId)) return;
        await this.orderSyncService.applyCreate(event);
        await this.dataSource.transaction(em => this.tryMarkProcessed(em, event.eventId));
        this.logger.info(`Applied order.created [${event.payload.sourceOrderId}]`);
    }

    private async handleOrderUpdated(event: SyncEventByType<'order.updated'>): Promise<void> {
        if (await this.isAlreadyProcessed(event.eventId)) return;
        await this.orderSyncService.applyUpdate(event);
        await this.dataSource.transaction(em => this.tryMarkProcessed(em, event.eventId));
        this.logger.info(`Applied order.updated [${event.payload.sourceOrderId}]`);
    }

    private async handlePaymentRecorded(event: SyncEventByType<'payment.recorded'>): Promise<void> {
        if (await this.isAlreadyProcessed(event.eventId)) return;
        await this.orderSyncService.applyPaymentRecorded(event);
        await this.dataSource.transaction(em => this.tryMarkProcessed(em, event.eventId));
        this.logger.info(`Applied payment.recorded [${event.payload.sourceOrderId}]`);
    }
}
