import { RequestContext, TransactionalConnection } from '@vendure/core';

import { Reservation } from './entities/reservation.entity';

// Summed in SQL: a popular variant can hold thousands of active reservations, which must not be hydrated.
export async function sumActiveReservations(
    connection: TransactionalConnection,
    ctx: RequestContext,
    variantIds: string[],
    locationIds: string[],
): Promise<Map<string, number>> {
    const sums = new Map<string, number>();
    if (variantIds.length === 0 || locationIds.length === 0) return sums;
    // unbounded-ok: one row per (variant, location) pair of the ids passed in
    const rows = await connection
        .getRepository(ctx, Reservation)
        .createQueryBuilder('reservation')
        .select('reservation.productVariantId', 'productVariantId')
        .addSelect('reservation.stockLocationId', 'stockLocationId')
        .addSelect('COALESCE(SUM(reservation.quantity), 0)', 'total')
        .where('reservation.status = :status', { status: 'active' })
        .andWhere('reservation.productVariantId IN (:...variantIds)', { variantIds })
        .andWhere('reservation.stockLocationId IN (:...locationIds)', { locationIds })
        .groupBy('reservation.productVariantId')
        .addGroupBy('reservation.stockLocationId')
        .getRawMany<{ productVariantId: string; stockLocationId: string; total: string }>();
    for (const row of rows) {
        sums.set(`${row.productVariantId}:${row.stockLocationId}`, Number(row.total));
    }
    return sums;
}
