import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { EventBus, TransactionalConnection } from '@vendure/core';
import { OrderReservedEvent } from '@mivend/plugin-reservation';
import { subscribeAndLog, withAggregateLock } from 'shared';

import { OrderSubmittedBuilder } from './order-submitted.builder';
import { OutboundGateway } from './outbound-gateway';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Reacts to OrderReservedEvent, after the reservation committed, so the outbox write cannot join
// its transaction (known gap, docs/integration-health.md). The gateway records every outcome.
@Injectable()
export class OrderSubmittedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly connection: TransactionalConnection,
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

    // Same `reserve-order:<id>` lock key as order-contract.service.ts's reserveOrder — closes the
    // check-then-insert race a concurrent re-confirm/redelivery would otherwise hit (issue #199).
    private async handle(event: OrderReservedEvent): Promise<void> {
        await withAggregateLock(
            this.connection,
            event.ctx,
            `reserve-order:${String(event.orderId)}`,
            txCtx =>
                this.gateway.enqueue({
                    eventType: 'order.confirmed',
                    subject: { orderId: String(event.orderId), orderCode: event.orderCode },
                    build: () => this.builder.build(txCtx, event.orderId, event.orderCode),
                }),
        );
    }
}
