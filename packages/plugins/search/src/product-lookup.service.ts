import { Injectable } from '@nestjs/common';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';
import { andProductInStock } from '@mivend/plugin-reservation';

// Resolves a search-service partOrProductId back to a Vendure Product + its single/default
// variant, mirroring erp-integration's product/price handler productId->variant join pattern
// (Product.customFields.externalId, single-variant-per-product assumption) via Vendure's own
// repository API rather than duplicating erp-integration's raw SQL. See issue #69 — this mapping
// is UNVERIFIED against real overlapping data (no reachable shared dataset at implementation
// time); products with no matching externalId are silently skipped by the caller.
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
        if (!includeDisabled) query.andWhere('product.enabled = true');
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
            .andWhere(
                'EXISTS (SELECT 1 FROM product_variant v WHERE v."productId" = product.id AND v."deletedAt" IS NULL AND v.enabled = true)',
            );
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

    // Picks the product's sellable default variant for a search result — the single-variant-
    // per-product assumption also used by erp-integration's price/price-type handlers, but
    // excluding a disabled variant entirely rather than falling back to it (audit finding,
    // mivend.audit.70: an unpublished/disabled variant must never surface as a search result).
    pickDefaultVariant(product: Product): Product['variants'][number] | undefined {
        return product.variants.find(v => v.enabled);
    }
}
