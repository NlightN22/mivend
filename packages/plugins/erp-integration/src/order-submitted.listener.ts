import { Injectable, OnApplicationBootstrap, Inject } from '@nestjs/common';
import { EventBus } from '@vendure/core';
import { OrderReservedEvent } from '@mivend/plugin-reservation';
import { subscribeAndLog } from 'shared';

import { OrderSubmittedBuilder } from './order-submitted.builder';
import { OutboundGateway } from './outbound-gateway';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// Reacts to plugin-reservation's OrderReservedEvent (the reservation is already committed, so the
// outbox write cannot join its transaction — an accepted gap, see docs/integration-health.md).
// Every outcome, including a skip, is recorded by the gateway.
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
        await this.gateway.enqueue({
            eventType: 'order.submitted',
            subject: { orderId: String(event.orderId), orderCode: event.orderCode },
            build: () => this.builder.build(event.ctx, event.orderId, event.orderCode),
        });
    }
}
