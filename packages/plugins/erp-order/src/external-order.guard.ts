import type { OrderProcess, OrderState } from '@vendure/core';

export const EXTERNAL_ORDER_READONLY_MESSAGE =
    'This order comes from the ERP and is managed there.';

export const externalOrderProcess: OrderProcess<OrderState> = {
    onTransitionStart(_fromState, _toState, { order }) {
        if (order.customFields?.isExternal === true) return EXTERNAL_ORDER_READONLY_MESSAGE;
    },
};
