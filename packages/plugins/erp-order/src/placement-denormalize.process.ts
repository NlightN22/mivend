import type { Injector, OrderProcess, OrderState } from '@vendure/core';

import { ErpOrderService } from './erp-order.service';

let erpOrders: ErpOrderService;

// Core saves the order after onTransitionEnd, so the assigned customFields persist in the same transaction.
export const placementDenormalizeProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        erpOrders = injector.get(ErpOrderService);
    },
    async onTransitionStart(fromState, toState, { ctx, order }) {
        if (fromState !== 'AddingItems' && fromState !== 'Draft') return;
        if (toState !== 'ArrangingPayment') return;
        return (await erpOrders.findUnroutableReason(ctx, order)) ?? undefined;
    },
    async onTransitionEnd(fromState, _toState, { ctx, order }) {
        if (fromState !== 'AddingItems' && fromState !== 'Draft') return;
        await erpOrders.denormalizePlacement(ctx, order);
    },
};
