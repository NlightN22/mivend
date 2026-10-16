import { ID } from '@vendure/common/lib/shared-types';
import { RequestContext, VendureEvent } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// Delivered to the ERP via plugin-sync's ReservationConsumer -> sync_outbox, not a shared transaction.
// plugin-reservation must never publish to RabbitMQ or the outbox directly (ownership rule).
export class ReservationConfirmedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly reservation: Reservation,
        public readonly orderCode: string,
    ) {
        super();
    }
}

// Once per order, after all line Reservation rows are written: warehouse/stock facts are fixed.
// Listeners re-derive the order's lines and warehouses themselves; do not publish per line.
export class OrderReservedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: ID,
        public readonly orderCode: string,
    ) {
        super();
    }
}

// Staff confirmed an order that already held active reservations: the release of a send hold.
export class OrderStaffConfirmedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly orderId: ID,
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
