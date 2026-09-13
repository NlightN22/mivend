import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, VendureEvent } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// Consumed by plugin-sync's ReservationConsumer, which writes these to sync_outbox for
// delivery to 1C — see docs/order-flow.md "1C integration — outbox, not a shared transaction".
// plugin-reservation never touches RabbitMQ/the outbox directly (see the internal-sync-rules skill's ownership rule).
export class ReservationConfirmedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly reservation: Reservation,
        public readonly orderCode: string,
    ) {
        super();
    }
}

// mivend#85: one signal per ORDER (unlike ReservationConfirmedEvent above, published once per
// Reservation/line) — erp-integration's OrderSubmittedListener needs to react once per order,
// re-derive the whole order's lines/warehouses itself, and fan out from there. Published once,
// after every line's Reservation row for the order is written — this is this project's real
// "the order's warehouse/stock facts are now fixed" moment (see docs/order-flow.md's two-stage
// reservation model), replacing plugin-erp-order's OrderReadyForErpEvent as this listener's
// trigger since that fired before any warehouse could be known at all.
export class OrderReservedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: ID,
        public readonly orderCode: string,
    ) {
        super();
    }
}

export class ReservationReleasedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly reservation: Reservation,
        public readonly orderCode: string,
    ) {
        super();
    }
}
