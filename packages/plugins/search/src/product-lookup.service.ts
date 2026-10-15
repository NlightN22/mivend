import { Injectable } from '@nestjs/common';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import { andProductInStock } from '@mivend/plugin-reservation';

import { variantExistsSql } from './variant-exists-sql';

// Mirrors erp-integration's productId->variant join via Vendure's repository API, not its raw SQL.
// Unverified on real data: products without a matching externalId are skipped by the caller.
@Injectable()
export class ProductLookupService {
    constructor(private connection: TransactionalConnection) {}

    async findByExternalIds(
        ctx: RequestContext,
        externalIds: string[],
        includeDisabled = false,
    ): Promise<Map<string, Product>> {
        const found = new Map<string, Product>();
        if (externalIds.length === 0) return found;

        const query = this.connection
            .getRepository(ctx, Product)
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translations')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variants')
            .leftJoinAndSelect('variants.translations', 'variantTranslations')
            .leftJoinAndSelect('variants.featuredAsset', 'variantFeaturedAsset')
            .innerJoin('product.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('product.customFields.externalId IN (:...externalIds)', { externalIds })
            .andWhere('product.deletedAt IS NULL');
        if (!includeDisabled) {
            query.andWhere('product.enabled = true').andWhere(variantExistsSql(true));
        }
        const products = await query.getMany();

        for (const product of products) {
            const externalId = (product.customFields as { externalId?: string | null }).externalId;
            if (externalId) found.set(externalId, product);
        }
        return found;
    }

    // Local catalog page for requests with no query/category/filter, which search-service rejects:
    // one paginated id query (count included), then one load of just that page.
    async browse(
        ctx: RequestContext,
        options: {
            skip: number;
            take: number;
            sortByName: 'ASC' | 'DESC' | null;
            inStockWarehouseErpIds?: string[];
        },
        includeDisabled = false,
    ): Promise<{ products: Product[]; total: number }> {
        const repo = this.connection.getRepository(ctx, Product);
        const pageQuery = repo
            .createQueryBuilder('product')
            .select('product.id', 'id')
            .innerJoin('product.channels', 'channel', 'channel.id = :channelId', {
                channelId: ctx.channelId,
            })
            .where('product.deletedAt IS NULL')
            .andWhere(variantExistsSql(!includeDisabled));
        if (!includeDisabled) pageQuery.andWhere('product.enabled = true');
        if (options.inStockWarehouseErpIds) {
            andProductInStock(pageQuery, options.inStockWarehouseErpIds);
        }
        if (options.sortByName) {
            pageQuery
                .innerJoin('product.translations', 'sortT', 'sortT.languageCode = :lang', {
                    lang: ctx.languageCode,
                })
                .orderBy('sortT.name', options.sortByName);
        } else {
            pageQuery.orderBy('product.id', 'ASC');
        }
        const total = await pageQuery.getCount();
        const rows = await pageQuery
            .addOrderBy('product.id', 'ASC')
            .offset(options.skip)
            .limit(options.take)
            .getRawMany<{ id: string }>();
        const ids = rows.map(r => r.id);
        if (ids.length === 0) return { products: [], total };

        const loaded = await repo
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.translations', 'translations')
            .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
            .leftJoinAndSelect('product.variants', 'variants')
            .leftJoinAndSelect('variants.translations', 'variantTranslations')
            .leftJoinAndSelect('variants.featuredAsset', 'variantFeaturedAsset')
            .whereInIds(ids)
            .getMany();
        const byId = new Map(loaded.map(p => [String(p.id), p]));
        return {
            products: ids.flatMap(id => byId.get(String(id)) ?? []),
            total,
        };
    }

    // Single-variant-per-product assumption, shared with erp-integration's price handlers.
    // A disabled variant must be excluded outright, never used as a fallback in search results.
    pickDefaultVariant(product: Product): Product['variants'][number] | undefined {
        return product.variants.find(v => v.enabled);
    }
}
