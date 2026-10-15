import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import {
    EventBus,
    OrderLineEvent,
    OrderStateTransitionEvent,
    RequestContextService,
} from '@vendure/core';
import { subscribeAndLog } from 'shared';

import { OrderCheckStaleService } from './order-check-stale.service';
import { OrderChecksService } from './order-checks.service';
import { loggerCtx } from './types';

@Injectable()
export class OrderChecksListener implements OnApplicationBootstrap {
    constructor(
        private eventBus: EventBus,
        private requestContextService: RequestContextService,
        private orderChecks: OrderChecksService,
        private stale: OrderCheckStaleService,
    ) {}

    onApplicationBootstrap(): void {
        // After commit and on a fresh context: a check outcome must never touch the customer's transition.
        subscribeAndLog(
            this.eventBus,
            OrderStateTransitionEvent,
            async event => {
                if (event.toState !== 'ArrangingPayment') return;
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.orderChecks.run(ctx, String(event.order.id), 'checkout');
            },
            loggerCtx,
        );
        // Only placed orders hold stored results; cart edits have nothing to flag.
        subscribeAndLog(
            this.eventBus,
            OrderLineEvent,
            async event => {
                if (event.order.active) return;
                const ctx = await this.requestContextService.create({ apiType: 'admin' });
                await this.stale.markOrder(ctx, String(event.order.id));
            },
            loggerCtx,
        );
    }
}
