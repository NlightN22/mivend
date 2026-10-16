import { ID, RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// A staff confirmation of an already reserved order is the release of a send hold: stamp the
// reservations with the actor. Returns whether any row changed, so a repeat confirm stays a no-op.
export async function stampStaffConfirmation(
    connection: TransactionalConnection,
    ctx: RequestContext,
    orderId: ID,
    administratorId: ID,
): Promise<boolean> {
    const result = await connection
        .getRepository(ctx, Reservation)
        .createQueryBuilder()
        .update()
        .set({ confirmedByAdministratorId: String(administratorId) })
        .where('orderId = :orderId AND status = :status AND confirmedByAdministratorId IS NULL', {
            orderId: String(orderId),
            status: 'active',
        })
        .execute();
    return (result.affected ?? 0) > 0;
}
