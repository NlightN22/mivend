import { ID, RequestContext, StockLevel, TransactionalConnection } from '@vendure/core';

import { freeQuantity } from './free-stock';
import { Reservation } from './entities/reservation.entity';

// Locks every StockLevel of the given variants and locations in ascending id order, so two orders with the
// same variants in a different line order cannot deadlock; the per-line picks below then re-lock held rows.
export async function lockStockLevelsInOrder(
    connection: TransactionalConnection,
    ctx: RequestContext,
    productVariantIds: ID[],
    locationIds: string[],
): Promise<void> {
    if (productVariantIds.length === 0 || locationIds.length === 0) return;
    await connection
        .getRepository(ctx, StockLevel)
        .createQueryBuilder('stockLevel')
        .setLock('pessimistic_write')
        .where('stockLevel.productVariantId IN (:...variantIds)', { variantIds: productVariantIds })
        .andWhere('stockLevel.stockLocationId IN (:...locationIds)', { locationIds })
        .orderBy('stockLevel.id', 'ASC')
        .getMany();
}

// `held`: quantities per location of this variant already picked by the caller but not yet saved.
// Locks each candidate StockLevel FOR UPDATE so concurrent reservations serialize before reading free stock.
export async function pickLocationWithMostFreeStock(
    connection: TransactionalConnection,
    ctx: RequestContext,
    productVariantId: ID,
    candidateLocationIds: string[],
    options: { lock: boolean; held?: Map<string, number> } = { lock: true },
): Promise<{ stockLocationId: string; available: number }> {
    let best = { stockLocationId: candidateLocationIds[0], available: -Infinity };
    for (const locationId of candidateLocationIds) {
        const query = connection.getRepository(ctx, StockLevel).createQueryBuilder('stockLevel');
        if (options.lock) query.setLock('pessimistic_write');
        const stockLevel = await query
            .where('stockLevel.productVariantId = :variantId', { variantId: productVariantId })
            .andWhere('stockLevel.stockLocationId = :stockLocationId', {
                stockLocationId: locationId,
            })
            .getOne();
        const reserved = await connection.getRepository(ctx, Reservation).find({
            where: {
                productVariantId: String(productVariantId),
                stockLocationId: locationId,
                status: 'active',
            },
        });
        const available = freeQuantity(
            stockLevel?.stockOnHand ?? 0,
            stockLevel?.stockAllocated ?? 0,
            reserved.reduce((sum, r) => sum + r.quantity, 0) + (options.held?.get(locationId) ?? 0),
            stockLevel?.customFields?.erpAvailableQuantity,
        );
        if (available > best.available) best = { stockLocationId: locationId, available };
    }
    return best;
}
