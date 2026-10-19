import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { RequestContext, RequestContextService, TransactionalConnection } from '@vendure/core';
import { SyncEventSchema, assertNever, ctxQuery } from 'shared';
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
        private readonly connection: TransactionalConnection,
        private readonly requestContextService: RequestContextService,
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

        // Defensive guard: routing-key binding already prevents self-delivery for all current event types.
        // Kept in case a future event type's target ever equals the publishing instance's own id.
        if (event.sourceInstanceId === this.options.instanceId) return;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        switch (event.eventType) {
            case 'product.created':
                await this.handleProductCreated(ctx, event);
                break;
            case 'product.updated':
                await this.handleProductUpdated(ctx, event);
                break;
            case 'product.deleted':
                await this.handleProductDeleted(ctx, event);
                break;
            case 'administrator.created':
            case 'administrator.updated':
                await this.handleAdministratorUpsert(ctx, event);
                break;
            case 'administrator.deactivated':
                await this.handleAdministratorDeactivated(ctx, event);
                break;
            case 'order.created':
                await this.handleOrderCreated(ctx, event);
                break;
            case 'order.updated':
                await this.handleOrderUpdated(ctx, event);
                break;
            case 'payment.recorded':
                await this.handlePaymentRecorded(ctx, event);
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

    private async tryMarkProcessed(ctx: RequestContext, eventId: string): Promise<boolean> {
        const result = await this.connection
            .getRepository(ctx, SyncProcessedEvent)
            .manager.createQueryBuilder()
            .insert()
            .into(SyncProcessedEvent)
            .values({ eventId })
            .orIgnore()
            .execute();
        return result.identifiers.length > 0;
    }

    // Check-then-apply-then-mark, unlike the mark-then-apply used elsewhere in this file.
    // So this is a plain existence check, not the atomic insert tryMarkProcessed does.
    private async isAlreadyProcessed(ctx: RequestContext, eventId: string): Promise<boolean> {
        const existing = await this.connection
            .getRepository(ctx, SyncProcessedEvent)
            .findOne({ where: { eventId } });
        return !!existing;
    }

    private async handleProductCreated(
        ctx: RequestContext,
        event: SyncEventByType<'product.created'>,
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            if (!(await this.tryMarkProcessed(txCtx, event.eventId))) return;
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `UPDATE product SET enabled = $1 WHERE id = $2`,
                [event.payload.enabled, event.payload.productId],
            );
        });
        this.logger.info(`Applied product.created [${event.payload.productId}]`);
    }

    private async handleProductUpdated(
        ctx: RequestContext,
        event: SyncEventByType<'product.updated'>,
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            if (!(await this.tryMarkProcessed(txCtx, event.eventId))) return;
            if (event.payload.enabled !== undefined) {
                await ctxQuery<unknown>(
                    this.connection,
                    txCtx,
                    `UPDATE product SET enabled = $1 WHERE id = $2`,
                    [event.payload.enabled, event.payload.productId],
                );
            }
        });
        this.logger.info(`Applied product.updated [${event.payload.productId}]`);
    }

    private async handleProductDeleted(
        ctx: RequestContext,
        event: SyncEventByType<'product.deleted'>,
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            if (!(await this.tryMarkProcessed(txCtx, event.eventId))) return;
            await ctxQuery<unknown>(
                this.connection,
                txCtx,
                `UPDATE product SET deleted_at = NOW() WHERE id = $1`,
                [event.payload.productId],
            );
        });
        this.logger.info(`Applied product.deleted [${event.payload.productId}]`);
    }

    private async handleAdministratorUpsert(
        ctx: RequestContext,
        event: SyncEventByType<'administrator.created'> | SyncEventByType<'administrator.updated'>,
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            if (!(await this.tryMarkProcessed(txCtx, event.eventId))) return;
            await this.administratorSyncService.applyUpsert(txCtx, event);
        });
        this.logger.info(`Applied ${event.eventType} [${event.payload.administratorId}]`);
    }

    private async handleAdministratorDeactivated(
        ctx: RequestContext,
        event: SyncEventByType<'administrator.deactivated'>,
    ): Promise<void> {
        await this.connection.withTransaction(ctx, async txCtx => {
            if (!(await this.tryMarkProcessed(txCtx, event.eventId))) return;
            await this.administratorSyncService.applyDeactivation(txCtx, event);
        });
        this.logger.info(`Applied administrator.deactivated [${event.payload.administratorId}]`);
    }

    // Apply-then-mark: applyCreate/applyUpdate throw on purpose to trigger consumer retry/backoff.
    // Marking first would make the redelivered message skip the work the retry is meant to redo.
    private async handleOrderCreated(
        ctx: RequestContext,
        event: SyncEventByType<'order.created'>,
    ): Promise<void> {
        if (await this.isAlreadyProcessed(ctx, event.eventId)) return;
        await this.orderSyncService.applyCreate(event);
        await this.connection.withTransaction(ctx, txCtx =>
            this.tryMarkProcessed(txCtx, event.eventId),
        );
        this.logger.info(`Applied order.created [${event.payload.sourceOrderId}]`);
    }

    private async handleOrderUpdated(
        ctx: RequestContext,
        event: SyncEventByType<'order.updated'>,
    ): Promise<void> {
        if (await this.isAlreadyProcessed(ctx, event.eventId)) return;
        await this.orderSyncService.applyUpdate(event);
        await this.connection.withTransaction(ctx, txCtx =>
            this.tryMarkProcessed(txCtx, event.eventId),
        );
        this.logger.info(`Applied order.updated [${event.payload.sourceOrderId}]`);
    }

    private async handlePaymentRecorded(
        ctx: RequestContext,
        event: SyncEventByType<'payment.recorded'>,
    ): Promise<void> {
        if (await this.isAlreadyProcessed(ctx, event.eventId)) return;
        await this.orderSyncService.applyPaymentRecorded(event);
        await this.connection.withTransaction(ctx, txCtx =>
            this.tryMarkProcessed(txCtx, event.eventId),
        );
        this.logger.info(`Applied payment.recorded [${event.payload.sourceOrderId}]`);
    }
}
