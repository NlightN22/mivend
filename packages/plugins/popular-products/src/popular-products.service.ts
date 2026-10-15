import { Injectable } from '@nestjs/common';
import { OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';

// Exclusion list must match myOrders in packages/plugins/erp-order/src/erp-order.resolver.ts;
// otherwise popularity ranking and the order history disagree on what counts as a sale.
const EXCLUDED_STATES = ['AddingItems', 'Cancelled'];

const DEFAULT_TAKE = 12;
const MAX_TAKE = 50;

@Injectable()
export class PopularProductsService {
    constructor(private connection: TransactionalConnection) {}

    // Returns ids only: the caller hydrates them via Vendure's `products` query,
    // so the product type is not duplicated here.
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
