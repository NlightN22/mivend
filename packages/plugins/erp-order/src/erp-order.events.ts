import { RequestContext, VendureEvent } from '@vendure/core';
import type { ErpOrderStatus } from './types';

export class OrderReadyForErpEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: string,
        public readonly orderCode: string,
    ) {
        super();
    }
}

export class ErpOrderStatusEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderCode: string,
        public readonly status: ErpOrderStatus,
        public readonly erpOrderId?: string,
    ) {
        super();
    }
}
