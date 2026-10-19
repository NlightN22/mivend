import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
    EventBus,
    RequestContext,
    RequestContextService,
    TransactionalConnection,
} from '@vendure/core';
import { SyncEventSchema, assertNever } from 'shared';
import type { SyncEventByType } from 'shared';

import { OrderSyncService } from '../order-sync.service';
import { SyncProcessedEvent } from '../entities/sync-processed-event.entity';
import { RabbitMQService } from '../rabbitmq.service';
import { SyncLogger } from '../sync-logger';
import { SYNC_PLUGIN_OPTIONS } from '../types';
import type { SyncPluginOptions } from '../types';
import { BranchKassaPaymentEvent } from '../erp-payment.events';

// Only order and payment events reach Central from branches; branches never publish admin/product.
// Payment may come from a branch that holds only a replica of the order (see architecture.md).
@Injectable()
export class CentralConsumer implements OnModuleInit {
    constructor(
        private readonly rabbitmq: RabbitMQService,
        private readonly connection: TransactionalConnection,
        @Inject(SYNC_PLUGIN_OPTIONS) private readonly options: SyncPluginOptions,
        private readonly logger: SyncLogger,
        private readonly orderSyncService: OrderSyncService,
        private readonly eventBus: EventBus,
        private readonly requestContextService: RequestContextService,
    ) {}

    async onModuleInit(): Promise<void> {
        if (this.options.instanceType !== 'central') return;
        const queueName = `sync.${this.options.instanceId}`;
        // Bind to the literal 'central', not instanceId, which may differ (e.g. 'hub' in dev/test).
        // Branches hardcode the same 'central' token when addressing the single hub.
        await this.rabbitmq.subscribe(queueName, '#.central', raw => this.handleRaw(raw));
        this.logger.info(`CentralConsumer subscribed to ${queueName}`);
    }

    private async handleRaw(raw: unknown): Promise<void> {
        const event = SyncEventSchema.parse(raw);

        // Defense-in-depth, not load-bearing — see ProductConsumer's identical guard.
        if (event.sourceInstanceId === this.options.instanceId) return;
        const ctx = await this.requestContextService.create({ apiType: 'admin' });

        switch (event.eventType) {
            case 'order.created':
                await this.handleOrderCreated(ctx, event);
                break;
            case 'order.updated':
                await this.handleOrderUpdated(ctx, event);
                break;
            case 'payment.recorded':
                await this.handlePaymentRecorded(ctx, event);
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

    // Same reasoning as ProductConsumer's identical pair — a plain existence check, not the
    // atomic insert tryMarkProcessed does, since apply happens before mark here (see below).
    private async isAlreadyProcessed(ctx: RequestContext, eventId: string): Promise<boolean> {
        const existing = await this.connection
            .getRepository(ctx, SyncProcessedEvent)
            .findOne({ where: { eventId } });
        return !!existing;
    }

    // applyUpdate throws on a missing local replica so the message is retried with backoff,
    // not dropped when it races order.created delivery. Mark only after a successful apply.
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
        if (
            event.payload.proformaInvoiceId !== undefined &&
            event.payload.organizationId !== undefined &&
            event.payload.outcome !== undefined
        ) {
            // Publishes only — the risky work (payProformaInvoice) happens later, in
            // plugin-acquiring's inbox worker (the external-integration-rules skill).
            this.eventBus.publish(
                new BranchKassaPaymentEvent(
                    ctx,
                    event.payload.proformaInvoiceId,
                    event.payload.organizationId,
                    event.payload.outcome,
                    event.eventId,
                    event.payload.rrn,
                ),
            );
        }
        await this.connection.withTransaction(ctx, txCtx =>
            this.tryMarkProcessed(txCtx, event.eventId),
        );
        this.logger.info(`Applied payment.recorded [${event.payload.sourceOrderId}]`);
    }
}
