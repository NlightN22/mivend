import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import type { ID, RequestContext } from '@vendure/core';
import { OrderReservedEvent } from '@mivend/plugin-reservation';
import { subscribeAndLog } from 'shared';

import { OrderSubmittedBuilder } from './order-submitted.builder';
import { OutboundGateway } from './outbound-gateway';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Reacts to OrderReservedEvent, after the reservation committed, so the outbox write cannot join
// its transaction; OrderSubmittedReconciler re-drives a crash in between. The gateway records every outcome.
@Injectable()
export class OrderSubmittedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly gateway: OutboundGateway,
        private readonly builder: OrderSubmittedBuilder,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        subscribeAndLog(
            this.eventBus,
            OrderReservedEvent,
            event => this.handle(event),
            OrderSubmittedListener.name,
        );
    }

    private async handle(event: OrderReservedEvent): Promise<void> {
        await this.enqueueConfirmed(event.ctx, event.orderId, event.orderCode);
    }

    // Same `reserve-order:<id>` lock key as order-contract.service.ts's reserveOrder — closes the
    // check-then-insert race a concurrent re-confirm/redelivery would otherwise hit (issue #199).
    async enqueueConfirmed(ctx: RequestContext, orderId: ID, orderCode: string): Promise<void> {
        await this.gateway.enqueue(ctx, {
            eventType: 'order.confirmed',
            subject: { orderId: String(orderId), orderCode },
            lockKey: `reserve-order:${String(orderId)}`,
            build: txCtx => this.builder.build(txCtx, orderId, orderCode),
        });
    }
}
