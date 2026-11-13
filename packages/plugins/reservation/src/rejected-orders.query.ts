import { Order, RequestContext, TransactionalConnection } from '@vendure/core';
import { readAllByKeyset } from 'shared';

import { Reservation } from './entities/reservation.entity';

// Unlocked candidate list: each order is re-validated under its locks before anything is released.
export async function findRejectedOrderIdsWithActiveReserve(
    connection: TransactionalConnection,
    ctx: RequestContext,
    rejectedCodes: string[],
    cutoff: Date,
): Promise<string[]> {
    const orders = await readAllByKeyset<{ id: number }>((afterId, limit) =>
        connection
            .getRepository(ctx, Order)
            .createQueryBuilder('o')
            .where('o.customFields.erpStatus IN (:...codes)', { codes: rejectedCodes })
            .andWhere('o.customFields.erpStatusAt <= :cutoff', { cutoff })
            .andWhere(
                `EXISTS (${connection
                    .getRepository(ctx, Reservation)
                    .createQueryBuilder('r')
                    .select('1')
                    .where('r.status = :active')
                    .andWhere('r.orderId = CAST(o.id AS varchar)')
                    .getQuery()})`,
            )
            .setParameter('active', 'active')
            .andWhere('o.id > :afterId', { afterId: afterId ?? 0 })
            .orderBy('o.id', 'ASC')
            .take(limit)
            .getMany(),
    );
    return orders.map(order => String(order.id));
}
