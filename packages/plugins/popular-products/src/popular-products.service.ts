import { Injectable } from '@nestjs/common';
import { OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';

// Orders that never left the cart stage, or were cancelled, don't count as a
// "sale" for popularity ranking — same exclusion list as
// packages/plugins/erp-order/src/erp-order.resolver.ts's myOrders.
const EXCLUDED_STATES = ['AddingItems', 'Cancelled'];

const DEFAULT_TAKE = 12;
const MAX_TAKE = 50;

@Injectable()
export class PopularProductsService {
    constructor(private connection: TransactionalConnection) {}

    // Ranks products by total quantity sold across all non-cart, non-cancelled
    // orders. Returns product ids only (ranked) — the caller fetches full
    // display data via Vendure's own `products` query, reusing that type
    // instead of duplicating it here.
    async getPopularProductIds(ctx: RequestContext, take?: number): Promise<string[]> {
        const limit = Math.min(take ?? DEFAULT_TAKE, MAX_TAKE);
        const rows = await this.connection
            .getRepository(ctx, OrderLine)
            .createQueryBuilder('line')
            .innerJoin('line.order', 'order')
            .innerJoin('line.productVariant', 'variant')
            .where('order.state NOT IN (:...excluded)', { excluded: EXCLUDED_STATES })
            .select('variant.productId', 'productId')
            .addSelect('SUM(line.quantity)', 'totalQty')
            .groupBy('variant.productId')
            .orderBy('"totalQty"', 'DESC')
            .limit(limit)
            .getRawMany<{ productId: string; totalQty: string }>();

        return rows.map(row => String(row.productId));
    }
}
