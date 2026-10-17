import type { Injector, OrderProcess, OrderState } from '@vendure/core';

import { ProformaInvoiceOrderCancelService } from './proforma-invoice-order-cancel.service';

let service: ProformaInvoiceOrderCancelService;

// Runs in the cancel's transaction on every path into Cancelled; it never refuses the cancel.
export const proformaInvoiceCancelProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        service = injector.get(ProformaInvoiceOrderCancelService);
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'Cancelled') return;
        await service.closeForCancelledOrder(ctx, Number(order.id));
    },
};
