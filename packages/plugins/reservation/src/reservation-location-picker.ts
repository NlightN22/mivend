import { ID, RequestContext, StockLevel, TransactionalConnection } from '@vendure/core';

import { freeQuantity } from './free-stock';
import { Reservation } from './entities/reservation.entity';

// Locks each candidate StockLevel FOR UPDATE so concurrent reservations serialize before reading free stock.
export async function pickLocationWithMostFreeStock(
    connection: TransactionalConnection,
    ctx: RequestContext,
    productVariantId: ID,
    candidateLocationIds: string[],
): Promise<{ stockLocationId: string; available: number }> {
    let best = { stockLocationId: candidateLocationIds[0], available: -Infinity };
    for (const locationId of candidateLocationIds) {
        const stockLevel = await connection
            .getRepository(ctx, StockLevel)
            .createQueryBuilder('stockLevel')
            .setLock('pessimistic_write')
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
            reserved.reduce((sum, r) => sum + r.quantity, 0),
            stockLevel?.customFields?.erpAvailableQuantity,
        );
        if (available > best.available) best = { stockLocationId: locationId, available };
    }
    return best;
}
