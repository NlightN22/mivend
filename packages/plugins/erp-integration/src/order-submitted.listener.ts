import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { EventBus, Order, TransactionalConnection } from '@vendure/core';
import { OrderReadyForErpEvent } from '@mivend/plugin-erp-order';
import { subscribeAndLog } from 'shared';

import { IntegrationOutboxService } from './integration-outbox.service';
import type { OrderSubmittedPayload } from './schemas/order-submitted.schema';
import { ERP_INTEGRATION_PLUGIN_OPTIONS } from './types';
import type { ErpIntegrationPluginOptions } from './types';

// OrderReadyForErpEvent already exists as this codebase's own "order was just placed, ERP-facing
// side needs to know" signal (see plugin-erp-order's ErpOrderService.onOrderPlaced) — reused here
// rather than adding a second listener on OrderStateTransitionEvent for the same moment.
@Injectable()
export class OrderSubmittedListener implements OnApplicationBootstrap {
    constructor(
        private readonly eventBus: EventBus,
        private readonly dataSource: DataSource,
        private readonly connection: TransactionalConnection,
        private readonly outboxService: IntegrationOutboxService,
        @Inject(ERP_INTEGRATION_PLUGIN_OPTIONS)
        private readonly options: ErpIntegrationPluginOptions,
    ) {}

    onApplicationBootstrap(): void {
        if (this.options.instanceType !== 'central') return;

        subscribeAndLog(
            this.eventBus,
            OrderReadyForErpEvent,
            event => this.handle(event),
            OrderSubmittedListener.name,
        );
    }

    private async handle(event: OrderReadyForErpEvent): Promise<void> {
        const order = await this.connection
            .getRepository(event.ctx, Order)
            .findOne({ where: { id: event.orderId } });
        if (!order) return;

        const organizationId = order.customFields?.organizationId;
        if (!organizationId) {
            // No organization resolved yet for this order — nothing to report to Integration
            // Service about. Not an error: matches ErpOrderService.onOrderPlaced's own tolerance
            // for a missing trading point/branch at placement time.
            return;
        }

        const payload: OrderSubmittedPayload = {
            eventId: randomUUID(),
            orderId: event.orderId,
            orderCode: event.orderCode,
            organizationId: String(organizationId),
            submittedAt: new Date().toISOString(),
            totalWithTax: order.totalWithTax,
            currencyCode: order.currencyCode,
        };

        // Deliberate, documented deviation from AGENTS.md sync rule #1's letter ("outbox write
        // in the same DB transaction as the business data"): the Order write already committed
        // via Vendure core before OrderReadyForErpEvent fires — there is no open transaction left
        // to join. The rule's actual intent (no window where business data exists without a
        // corresponding outbox record, or vice versa) is not achievable here for the same reason
        // it isn't for plugin-sync's own EventBus-triggered outbox writes (see
        // outbox-atomicity.int.test.ts's doc comment there): the write happens in its own
        // transaction, is at-least-once (a crash between commit and event delivery means this
        // handler may simply never run for that order — no retry mechanism re-fires
        // OrderReadyForErpEvent), and is a known, accepted gap shared with the rest of this
        // codebase's EventBus-reactive outbox producers, not something this plugin introduces
        // new. A stronger guarantee would require moving this write inside
        // ErpOrderService.onOrderPlaced's own transaction (a cross-plugin coupling this issue's
        // milestone scope deliberately avoided) or a periodic reconciliation sweep — neither
        // implemented here.
        await this.dataSource.transaction(async em => {
            await this.outboxService.writeToOutbox(em, {
                eventId: payload.eventId,
                eventType: 'order.submitted',
                payload: payload as unknown as Record<string, unknown>,
            });
        });
    }
}
