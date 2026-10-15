import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import type { OrderReservationState } from './types';

const CLEARED_FAILURE = {
    reservationFailureReason: null,
    reservationFailureDetail: null,
    reservationFailedAt: null,
} as const;

// Not save(): it recomputes calculated fields and needs relations a narrow load lacks.
// Re-read after writing: transitionToState() saves its own stale order after publishing the event.
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
