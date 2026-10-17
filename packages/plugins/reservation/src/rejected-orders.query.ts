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
        .andWhere(
            `EXISTS (${manager
                .getRepository(Reservation)
                .createQueryBuilder('r')
                .select('1')
                .where('r.status = :active')
                .andWhere('r.orderId = CAST(o.id AS varchar)')
                .getQuery()})`,
        )
        .setParameter('active', 'active')
        .getMany();
}
