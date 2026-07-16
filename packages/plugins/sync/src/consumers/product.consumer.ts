import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SyncEventSchema, assertNever } from 'shared';
import type { SyncEventByType } from 'shared';

import { AdministratorSyncService } from '../administrator-sync.service';
import { OrderSyncService } from '../order-sync.service';
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
        private readonly administratorSyncService: AdministratorSyncService,
        private readonly orderSyncService: OrderSyncService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'branch') return;
        const queueName = `sync.${this.options.instanceId}`;
        // Bind only to events actually targeted at this branch specifically or at all branches
        // broadcast — never a bare `#` (see RabbitMQService.subscribe's comment on why).
        await this.rabbitmq.subscribe(
            queueName,
            [`#.${this.options.instanceId}`, '#.all-branches'],
            raw => this.handleRaw(raw),
        );
        this.logger.info(`ProductConsumer subscribed to ${queueName}`);
    }

    private async handleRaw(raw: unknown): Promise<void> {
        const event = SyncEventSchema.parse(raw);

        // Defense-in-depth, not load-bearing: correct routing-key binding already makes this
        // instance receiving its own published event structurally impossible for every event
        // type today. Kept as a cheap guard in case a future event type's target ever equals
        // the publishing instance's own id.
        if (event.sourceInstanceId === this.options.instanceId) return;

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
            case 'administrator.created':
            case 'administrator.updated':
                await this.handleAdministratorUpsert(event);
                break;
            case 'administrator.deactivated':
                await this.handleAdministratorDeactivated(event);
                break;
            case 'order.created':
                await this.handleOrderCreated(event);
                break;
            case 'order.updated':
                await this.handleOrderUpdated(event);
                break;
            case 'payment.recorded':
                await this.handlePaymentRecorded(event);
                break;
            case 'price.updated':
            case 'customer.created':
            case 'customer.updated':
            case 'credit-terms.updated':
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

    // Order handlers check-then-apply-then-mark (see handleOrderCreated/handleOrderUpdated)
    // rather than the mark-then-apply pattern used everywhere else in this file, so this is a
    // plain existence check, not the atomic insert tryMarkProcessed does.
    private async isAlreadyProcessed(eventId: string): Promise<boolean> {
        const existing = await this.dataSource
            .getRepository(SyncProcessedEvent)
            .findOne({ where: { eventId } });
        return !!existing;
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

    private async handleAdministratorUpsert(
        event: SyncEventByType<'administrator.created'> | SyncEventByType<'administrator.updated'>,
    ): Promise<void> {
        await this.dataSource.transaction(async em => {
            if (!(await this.tryMarkProcessed(em, event.eventId))) return;
            await this.administratorSyncService.applyUpsert(em, event);
        });
        this.logger.info(`Applied ${event.eventType} [${event.payload.administratorId}]`);
    }

    private async handleAdministratorDeactivated(
        event: SyncEventByType<'administrator.deactivated'>,
    ): Promise<void> {
        await this.dataSource.transaction(async em => {
            if (!(await this.tryMarkProcessed(em, event.eventId))) return;
            await this.administratorSyncService.applyDeactivation(em, event);
        });
        this.logger.info(`Applied administrator.deactivated [${event.payload.administratorId}]`);
    }

    // OrderSyncService goes through Vendure's real OrderService (create/addItemToOrder/
    // transitionToState), which manages its own persistence via the RequestContext it builds —
    // it does not participate in the raw `em` used elsewhere in this file. The idempotency
    // marker still gets its own small transaction first, same guarantee as every other handler.
    // Apply-then-mark, not mark-then-apply: OrderSyncService.applyCreate/applyUpdate can throw
    // deliberately (see applyUpdate's "no local replica found" case) to get a real
    // backoff-then-retry from RabbitMQService.subscribe's consume loop, on the assumption that
    // order.created just hasn't landed yet (see order.consumer.ts's producer-side race note).
    // Marking the eventId processed *before* the apply — as every other handler in this file
    // does, safely, because their apply and mark happen in the same transaction — would make
    // that retry a no-op: the redelivered message would see isAlreadyProcessed()=true and skip
    // straight past the very work the retry exists to attempt again.
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
