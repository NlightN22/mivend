import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, VendureEvent } from '@vendure/core';

export type OrderLineEditKind = 'quantity' | 'remove' | 'split' | 'discount';

// Staff changed an order's lines before confirmation; published inside the edit transaction (#233).
export class OrderLinesEditedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: ID,
        public readonly kind: OrderLineEditKind,
    ) {
        super();
    }
}

// Staff changed a placed order's delivery method or point (#245); published after the edit commits.
export class OrderDeliveryEditedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: ID,
    ) {
        super();
    }
}
