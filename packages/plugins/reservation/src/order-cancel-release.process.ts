import type { Injector, OrderProcess, OrderState } from '@vendure/core';
import { TransactionalConnection } from '@vendure/core';
import { withOrderCancelLocks } from 'shared';

import { ReservationService } from './reservation.service';

let connection: TransactionalConnection;
let reservations: ReservationService;

// Any path into Cancelled (Dashboard, ERP, mivend cancel) releases reservations in its transaction;
// releaseReservations only flips active rows, so a path that already released them is a no-op.
export const orderCancelReleaseProcess: OrderProcess<OrderState> = {
    init(injector: Injector) {
        connection = injector.get(TransactionalConnection);
        reservations = injector.get(ReservationService);
    },
    // Before core's first order save, so a path that skipped withOrderCancelLocks keeps the lock order.
    async onTransitionStart(_fromState, toState, { ctx, order }) {
        if (toState !== 'Cancelled') return;
        await withOrderCancelLocks(connection, ctx, order.id, async () => undefined);
    },
    async onTransitionEnd(_fromState, toState, { ctx, order }) {
        if (toState !== 'Cancelled') return;
        const released = await reservations.releaseReservations(ctx, order.id);
        // Core saves this in-memory order right after the hook; keep the stored state.
        if (released > 0) {
            order.customFields = { ...order.customFields, reservationState: 'RELEASED' };
        }
    },
};
