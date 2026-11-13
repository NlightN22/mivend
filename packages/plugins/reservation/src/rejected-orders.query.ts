import { Order, RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// One id-ordered slice: the caller releases it before reading the next, so a backlog drains in passes.
export async function readRejectedOrderIdBatch(
    connection: TransactionalConnection,
    ctx: RequestContext,
    rejectedCodes: string[],
    cutoff: Date,
    afterId: string | null,
    limit: number,
): Promise<string[]> {
    const query = connection
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
        .setParameter('active', 'active');
    if (afterId !== null) query.andWhere('o.id > :afterId', { afterId });
    const orders = await query.orderBy('o.id', 'ASC').take(limit).getMany();
    return orders.map(order => String(order.id));
}
