import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import type { OrderReservationState } from './types';

const CLEARED_FAILURE = {
    reservationFailureReason: null,
    reservationFailureDetail: null,
    reservationFailedAt: null,
} as const;

// Not save(): it recomputes calculated fields and needs relations a narrow load lacks. Writes only
// the state keys; the row lock the update takes blocks any other writer of the order until commit.
export async function writeOrderReservationState(
    connection: TransactionalConnection,
    ctx: RequestContext,
    order: Order,
    state: OrderReservationState,
): Promise<void> {
    await connection.getRepository(ctx, Order).update(order.id, {
        customFields: {
            reservationState: state,
            ...(state === 'RESERVED' ? CLEARED_FAILURE : {}),
        },
    });
}
