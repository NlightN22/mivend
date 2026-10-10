import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { OrderCancellationPortRegistry } from '@mivend/plugin-reservation';
import type {
    CancelRequestSubject,
    CancelSubmission,
    OrderCancellationPort,
} from '@mivend/plugin-reservation';

import { buildCancelRequested } from './order-cancel-requested.builder';
import { OutboundGateway } from './outbound-gateway';

// erp-integration's side of plugin-reservation's cancellation port: reads and edits the outbox
// state of the order's confirmed event and publishes cancel-requested through the gateway.
@Injectable()
export class OrderCancellationAdapter implements OrderCancellationPort, OnApplicationBootstrap {
    constructor(
        private readonly gateway: OutboundGateway,
        private readonly registry: OrderCancellationPortRegistry,
    ) {}

    onApplicationBootstrap(): void {
        this.registry.register(this);
    }

    async submissionState(_ctx: RequestContext, orderId: string): Promise<CancelSubmission> {
        const statuses = await this.gateway.confirmedStatusesForOrder(orderId);
        if (statuses.includes('published')) return 'sent';
        return statuses.length > 0 ? 'pending' : 'none';
    }

    async skipPendingSubmission(
        _ctx: RequestContext,
        orderId: string,
        reason: string,
    ): Promise<boolean> {
        const skipped = await this.gateway.skipWaitingConfirmed(orderId, reason);
        return skipped > 0;
    }

    async requestCancel(_ctx: RequestContext, subject: CancelRequestSubject): Promise<void> {
        if (await this.gateway.hasActiveEntry('order.cancel-requested', subject.orderUuid)) return;
        await this.gateway.enqueue({
            eventType: 'order.cancel-requested',
            subject: { orderUuid: subject.orderUuid, orderId: subject.orderId },
            build: async () => buildCancelRequested(subject.orderUuid),
        });
    }
}
