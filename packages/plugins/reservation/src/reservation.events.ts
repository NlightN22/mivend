import { RequestContext, VendureEvent } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// Consumed by plugin-sync's ReservationConsumer, which writes these to sync_outbox for
// delivery to 1C — see docs/order-flow.md "1C integration — outbox, not a shared transaction".
// plugin-reservation never touches RabbitMQ/the outbox directly (see AGENTS.md sync rules).
export class ReservationConfirmedEvent extends VendureEvent {
    constructor(
        public readonly ctx: RequestContext,
        public readonly reservation: Reservation,
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
