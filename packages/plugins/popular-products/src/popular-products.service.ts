import { Injectable } from '@nestjs/common';
import { OrderLine, Product, RequestContext, TransactionalConnection } from '@vendure/core';

import { IN_CHANNEL_SQL, StockScopedIdsService } from './stock-scoped-ids.service';

// Exclusion list must match myOrders in packages/plugins/erp-order/src/erp-order.resolver.ts;
// otherwise popularity ranking and the order history disagree on what counts as a sale.
const EXCLUDED_STATES = ['AddingItems', 'Cancelled'];

const DEFAULT_TAKE = 12;
const CANDIDATES = 500;
const RANKING_TTL_MS = 60_000;

@Injectable()
export class PopularProductsService {
    private cache = new Map<string, { at: number; ids: Promise<number[]> }>();

    constructor(
        private connection: TransactionalConnection,
        private scopedIds: StockScopedIdsService,
    ) {}

    // Returns ids only: the caller hydrates them via Vendure's `products` query,
    // so the product type is not duplicated here.
    async getPopularProductIds(ctx: RequestContext, take?: number): Promise<string[]> {
        const ranked = await this.rankedCandidates(ctx);
        if (ranked.length === 0) return [];
        const query = this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('product')
            .select('product.id', 'productId')
            .where('product.id IN (:...ranked)', { ranked })
            .orderBy('array_position(ARRAY[:...ranked]::int[], product.id)');
        return this.scopedIds.run(ctx, this.scopedIds.clampTake(take, DEFAULT_TAKE), query);
    }

    // The all-order-lines aggregate is stock-independent, so it is shared per channel for a short TTL.
    private rankedCandidates(ctx: RequestContext): Promise<number[]> {
        const key = String(ctx.channelId);
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < RANKING_TTL_MS) return hit.ids;
        const ids = this.loadRanking(ctx);
        this.cache.set(key, { at: Date.now(), ids });
        ids.catch(() => this.cache.delete(key));
        return ids;
    }

    private async loadRanking(ctx: RequestContext): Promise<number[]> {
        const rows = await this.connection
            .getRepository(ctx, OrderLine)
            .createQueryBuilder('line')
            .innerJoin('line.order', 'order')
            .innerJoin('line.productVariant', 'variant')
            .innerJoin('variant.product', 'product')
            .where('order.state NOT IN (:...excluded)', { excluded: EXCLUDED_STATES })
            .andWhere('product.deletedAt IS NULL')
            .andWhere('product.enabled = true')
            .andWhere(IN_CHANNEL_SQL, { channelId: ctx.channelId })
            .select('variant.productId', 'productId')
            .addSelect('SUM(line.quantity)', 'totalQty')
            .groupBy('variant.productId')
            .orderBy('"totalQty"', 'DESC')
            .addOrderBy('variant.productId', 'ASC')
            .limit(CANDIDATES)
            .getRawMany<{ productId: number }>();
        return rows.map(row => Number(row.productId));
    }
}
