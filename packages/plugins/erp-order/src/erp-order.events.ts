import { RequestContext, VendureEvent } from '@vendure/core';

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
        public readonly status: string,
        public readonly erpOrderId?: string,
    ) {
        super();
    }
}
