import { Injectable } from '@nestjs/common';
import { OrderLine, RequestContext, TransactionalConnection } from '@vendure/core';

import { StockScopedIdsService } from './stock-scoped-ids.service';

// Exclusion list must match myOrders in packages/plugins/erp-order/src/erp-order.resolver.ts;
// otherwise popularity ranking and the order history disagree on what counts as a sale.
const EXCLUDED_STATES = ['AddingItems', 'Cancelled'];

const DEFAULT_TAKE = 12;

@Injectable()
export class PopularProductsService {
    constructor(
        private connection: TransactionalConnection,
        private scopedIds: StockScopedIdsService,
    ) {}

    // Returns ids only: the caller hydrates them via Vendure's `products` query,
    // so the product type is not duplicated here.
    async getPopularProductIds(ctx: RequestContext, take?: number): Promise<string[]> {
        const query = this.connection
            .getRepository(ctx, OrderLine)
            .createQueryBuilder('line')
            .innerJoin('line.order', 'order')
            .innerJoin('line.productVariant', 'variant')
            .innerJoin('variant.product', 'product')
            .where('order.state NOT IN (:...excluded)', { excluded: EXCLUDED_STATES })
            .andWhere('product.deletedAt IS NULL')
            .andWhere('product.enabled = true')
            .select('variant.productId', 'productId')
            .addSelect('SUM(line.quantity)', 'totalQty')
            .groupBy('variant.productId')
            .orderBy('"totalQty"', 'DESC')
            .addOrderBy('variant.productId', 'ASC');
        return this.scopedIds.run(ctx, this.scopedIds.clampTake(take, DEFAULT_TAKE), query);
    }
}
