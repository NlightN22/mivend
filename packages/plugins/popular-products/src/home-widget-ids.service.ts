import { Injectable } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';

import { StockScopedIdsService } from './stock-scoped-ids.service';

const DEFAULT_TAKE = 12;
const DEFAULT_SALE_TAKE = 40;
const DEFAULT_SINCE_DAYS = 7;
const MAX_SINCE_DAYS = 365;

// "New" is the ERP creation date when the ERP sent one, else the moment mivend first stored the product.
export const NEW_DATE_SQL = 'COALESCE(product."customFieldsErpcreatedat", product."createdAt")';

@Injectable()
export class HomeWidgetIdsService {
    constructor(
        private connection: TransactionalConnection,
        private scopedIds: StockScopedIdsService,
    ) {}

    newArrivalProductIds(
        ctx: RequestContext,
        take?: number | null,
        sinceDays?: number | null,
    ): Promise<string[]> {
        const days = Math.min(Math.max(sinceDays ?? DEFAULT_SINCE_DAYS, 1), MAX_SINCE_DAYS);
        const query = this.visibleProducts(ctx)
            .andWhere(`${NEW_DATE_SQL} >= now() - make_interval(days => :days)`, { days })
            .orderBy(NEW_DATE_SQL, 'DESC')
            .addOrderBy('product.id', 'DESC');
        return this.scopedIds.run(ctx, this.scopedIds.clampTake(take, DEFAULT_TAKE), query);
    }

    saleProductIds(ctx: RequestContext, take?: number | null): Promise<string[]> {
        const query = this.visibleProducts(ctx)
            .andWhere('product."customFieldsOnsale" = true')
            .orderBy('product.id', 'ASC');
        return this.scopedIds.run(ctx, this.scopedIds.clampTake(take, DEFAULT_SALE_TAKE), query);
    }

    private visibleProducts(ctx: RequestContext): SelectQueryBuilder<Product> {
        return this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('product')
            .select('product.id', 'productId')
            .where('product.deletedAt IS NULL')
            .andWhere('product.enabled = true');
    }
}
