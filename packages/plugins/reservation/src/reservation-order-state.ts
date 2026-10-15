import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import type { OrderReservationState } from './types';

const CLEARED_FAILURE = {
    reservationFailureReason: null,
    reservationFailureDetail: null,
    reservationFailedAt: null,
} as const;

// Writes only the changed keys via repo.update(): .save(order) recomputes calculated fields and needs
// relations a narrow load lacks. The write is re-verified because Vendure's transitionToState()
// saves its own stale order object after publishing the event (docs/order-flow.md "Order state write").
export async function writeOrderReservationState(
    connection: TransactionalConnection,
    ctx: RequestContext,
    order: Order,
    state: OrderReservationState,
): Promise<void> {
    const repo = connection.getRepository(ctx, Order);
    const stateFields = {
        reservationState: state,
        ...(state === 'RESERVED' ? CLEARED_FAILURE : {}),
    };
    await repo.update(order.id, { customFields: stateFields });

    for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        const current = await repo.findOne({ where: { id: order.id } });
        if (current?.customFields?.reservationState === state) return;
        await repo.update(order.id, { customFields: stateFields });
    }
}
