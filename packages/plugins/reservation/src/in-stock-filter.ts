import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// Raw-SQL twin of ReservationAvailabilityService.getAvailableToPromiseBatch: keep the two in sync.
// Expects the product alias `product` and the :warehouseErpIds parameter.
export const IN_STOCK_SQL = `EXISTS (
    SELECT 1 FROM product_variant iv
    JOIN stock_level sl ON sl."productVariantId" = iv.id
    JOIN stock_location loc ON loc.id = sl."stockLocationId"
    WHERE iv."productId" = product.id AND iv."deletedAt" IS NULL AND iv.enabled = true
    AND loc."customFieldsWarehouseerpid" IN (:...warehouseErpIds)
    AND LEAST(
        sl."stockOnHand" - sl."stockAllocated" - COALESCE((
            SELECT SUM(r.quantity) FROM reservation r
            WHERE r."productVariantId" = CAST(iv.id AS varchar)
            AND r."stockLocationId" = CAST(loc.id AS varchar) AND r.status = 'active'), 0),
        COALESCE(sl."customFieldsErpavailablequantity", 2147483647)
    ) > 0
)`;

export function andProductInStock<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    warehouseErpIds: string[],
): SelectQueryBuilder<T> {
    return query.andWhere(IN_STOCK_SQL, { warehouseErpIds });
}
