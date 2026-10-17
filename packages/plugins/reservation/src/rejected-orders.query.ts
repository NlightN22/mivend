import { Order } from '@vendure/core';
import type { EntityManager } from 'typeorm';

import { Reservation } from './entities/reservation.entity';

export function findRejectedOrdersWithActiveReserve(
    manager: EntityManager,
    rejectedCodes: string[],
    cutoff: Date,
): Promise<Order[]> {
    return manager
        .getRepository(Order)
        .createQueryBuilder('o')
        .where('o.customFields.erpStatus IN (:...codes)', { codes: rejectedCodes })
        .andWhere('o.customFields.erpStatusAt <= :cutoff', { cutoff })
        .andWhere(qb => {
            const sub = qb
                .subQuery()
                .select('1')
                .from(Reservation, 'r')
                .where('r.status = :active')
                .andWhere('r.orderId = CAST(o.id AS varchar)')
                .getQuery();
            return `EXISTS ${sub}`;
        })
        .setParameter('active', 'active')
        .getMany();
}
