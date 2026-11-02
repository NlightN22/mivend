import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { StockLevelService, andProductInStock } from '@mivend/plugin-reservation';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';

const OVERFETCH = 3;
const MAX_TAKE = 50;

// Shared by the home widgets: ids come back in the request channel and in stock at the viewer's
// branch warehouses, with spare ids because the following `products` call drops hidden categories.
export const IN_CHANNEL_SQL = `EXISTS (
    SELECT 1 FROM product_channels_channel pc
    WHERE pc."productId" = product.id AND pc."channelId" = :channelId
)`;

// Same rule as the catalog: a variant whose category collection is private is hidden. Membership
// rows can lag, so the category facet value is matched to the collection by slug instead.
export const NOT_IN_PRIVATE_CATEGORY_SQL = `NOT EXISTS (
    SELECT 1 FROM product_variant pv
    JOIN product_variant_facet_values_facet_value pvf ON pvf."productVariantId" = pv.id
    JOIN facet_value fv ON fv.id = pvf."facetValueId"
    JOIN facet f ON f.id = fv."facetId" AND f.code = 'category'
    JOIN collection_translation ct ON ct.slug = 'cat-' || fv.code
    JOIN collection col ON col.id = ct."baseId" AND col."isPrivate" = true
    WHERE pv."productId" = product.id
)`;

@Injectable()
export class StockScopedIdsService {
    constructor(private stockLevelService: StockLevelService) {}

    clampTake(take: number | null | undefined, fallback: number): number {
        return Math.min(Math.max(take ?? fallback, 1), MAX_TAKE);
    }

    async run<T extends ObjectLiteral>(
        ctx: RequestContext,
        take: number,
        query: SelectQueryBuilder<T>,
    ): Promise<string[]> {
        const warehouseErpIds = await this.stockLevelService.getViewerWarehouseErpIds(ctx);
        if (warehouseErpIds.length === 0) return [];
        const rows = await andProductInStock(
            query
                .andWhere(IN_CHANNEL_SQL, { channelId: ctx.channelId })
                .andWhere(NOT_IN_PRIVATE_CATEGORY_SQL),
            warehouseErpIds,
        )
            .limit(take * OVERFETCH)
            .getRawMany<{ productId: string }>();
        return rows.map(row => String(row.productId));
    }
}
