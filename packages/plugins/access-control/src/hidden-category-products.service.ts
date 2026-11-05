import { Injectable } from '@nestjs/common';
import { Collection, ID, RequestContext, TransactionalConnection } from '@vendure/core';
import {
    CATEGORY_SLUG_PREFIX,
    HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL,
    excludeCategoryIdsFor,
    type HiddenCategoryRow,
    ctxQuery,
    productInHiddenCategorySql,
} from 'shared';

// A product is hidden from customers when its category's Collection is private (own override,
// feed, or a hidden ancestor). Read at query time, so nothing is denormalised or reindexed.
@Injectable()
export class HiddenCategoryProductsService {
    constructor(private connection: TransactionalConnection) {}

    async hiddenFacetValueIds(ctx: RequestContext): Promise<string[]> {
        const rows = await ctxQuery<Array<{ id: number | string }>>(
            this.connection,
            ctx,
            HIDDEN_CATEGORY_FACET_VALUE_IDS_SQL,
        );
        return rows.map(row => String(row.id));
    }

    // ERP ids sent to search-service as `excludeCategoryIds`; read per request, so a recompute applies at once.
    async hiddenCategoryErpIds(ctx: RequestContext): Promise<string[]> {
        const rows = await ctxQuery<HiddenCategoryRow[]>(
            this.connection,
            ctx,
            `SELECT col.id, col."parentId", ct.slug FROM collection col
             JOIN collection_translation ct ON ct."baseId" = col.id
             WHERE col."isPrivate" = true AND ct.slug LIKE '${CATEGORY_SLUG_PREFIX}%'`,
        );
        return excludeCategoryIdsFor(rows);
    }

    async hiddenProductIds(ctx: RequestContext, productIds: ID[]): Promise<Set<string>> {
        if (productIds.length === 0) return new Set();
        const rows = await ctxQuery<Array<{ id: number | string }>>(
            this.connection,
            ctx,
            `SELECT product.id FROM product WHERE product.id = ANY($1::int[]) AND ${productInHiddenCategorySql()}`,
            [productIds.map(Number)],
        );
        return new Set(rows.map(row => String(row.id)));
    }

    async isCategoryHidden(ctx: RequestContext, categoryErpId: string): Promise<boolean> {
        const hidden = await this.connection
            .getRepository(ctx, Collection)
            .createQueryBuilder('collection')
            .innerJoin('collection.translations', 'translations')
            .where('collection.isPrivate = :isPrivate', { isPrivate: true })
            .andWhere('translations.slug = :slug', {
                slug: `${CATEGORY_SLUG_PREFIX}${categoryErpId}`,
            })
            .getCount();
        return hidden > 0;
    }
}
