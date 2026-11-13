import { RequestContext, TransactionalConnection } from '@vendure/core';

import { getRawManyBounded } from 'shared';

import { Reservation } from './entities/reservation.entity';
import { VARIANT_LOCATION_CEILING } from './reservation-read-ceiling';

// Summed in SQL: a popular variant can hold thousands of active reservations, which must not be hydrated.
export async function sumActiveReservations(
    connection: TransactionalConnection,
    ctx: RequestContext,
    variantIds: string[],
    locationIds: string[],
): Promise<Map<string, number>> {
    const sums = new Map<string, number>();
    if (variantIds.length === 0 || locationIds.length === 0) return sums;
    const query = connection
        .getRepository(ctx, Reservation)
        .createQueryBuilder('reservation')
        .select('reservation.productVariantId', 'productVariantId')
        .addSelect('reservation.stockLocationId', 'stockLocationId')
        .addSelect('COALESCE(SUM(reservation.quantity), 0)', 'total')
        .where('reservation.status = :status', { status: 'active' })
        .andWhere('reservation.productVariantId IN (:...variantIds)', { variantIds })
        .andWhere('reservation.stockLocationId IN (:...locationIds)', { locationIds })
        .groupBy('reservation.productVariantId')
        .addGroupBy('reservation.stockLocationId');
    const rows = await getRawManyBounded<{
        productVariantId: string;
        stockLocationId: string;
        total: string;
    }>(query, VARIANT_LOCATION_CEILING);
    for (const row of rows) {
        sums.set(`${row.productVariantId}:${row.stockLocationId}`, Number(row.total));
    }
    return sums;
}
