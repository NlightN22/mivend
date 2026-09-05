import { Injectable } from '@nestjs/common';
import { Product, RequestContext, TransactionalConnection } from '@vendure/core';

// Resolves a search-service partOrProductId back to a Vendure Product + its single/default
// variant, mirroring erp-integration's product/price handler productId->variant join pattern
// (Product.customFields.externalId, single-variant-per-product assumption) via Vendure's own
// repository API rather than duplicating erp-integration's raw SQL. See issue #69 — this mapping
// is UNVERIFIED against real overlapping data (no reachable shared dataset at implementation
// time); products with no matching externalId are silently skipped by the caller.
@Injectable()
export class ProductLookupService {
    constructor(private connection: TransactionalConnection) {}

    async findByExternalId(ctx: RequestContext, externalId: string): Promise<Product | null> {
        const repo = this.connection.getRepository(ctx, Product);
        // Scoped by ctx.channelId (audit finding, mivend.audit.70): Vendure's own
        // ElasticsearchPlugin/core SearchResolver always filters by channel, so the external
        // backend must match that contract even though this deployment currently runs a single
        // channel — never assume "only one channel exists today" stays true.
        return (
            repo
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.translations', 'translations')
                .leftJoinAndSelect('product.featuredAsset', 'featuredAsset')
                .leftJoinAndSelect('product.variants', 'variants')
                .leftJoinAndSelect('variants.translations', 'variantTranslations')
                .leftJoinAndSelect('variants.featuredAsset', 'variantFeaturedAsset')
                .innerJoin('product.channels', 'channel', 'channel.id = :channelId', {
                    channelId: ctx.channelId,
                })
                // Dot-path entity property, not the raw physical column name (audit finding,
                // mivend.audit.70) — TypeORM's QueryBuilder resolves `alias.customFields.propName`
                // to the actual embedded column itself; this is Vendure core's own documented
                // pattern for querying custom fields via QueryBuilder (see
                // @vendure/core's ActiveOrderStrategy JSDoc example:
                // `.where('order.customFields.orderToken = :orderToken', ...)`), unlike
                // erp-integration's raw `rawConnection.createQueryBuilder()` usage elsewhere, which
                // operates below TypeORM's entity-metadata layer and does need the literal column
                // name — the two are different APIs, not two valid spellings of the same thing.
                .where('product.customFields.externalId = :externalId', { externalId })
                .getOne()
        );
    }

    // Picks the product's sellable default variant for a search result — the single-variant-
    // per-product assumption also used by erp-integration's price/price-type handlers, but
    // excluding a disabled variant entirely rather than falling back to it (audit finding,
    // mivend.audit.70: an unpublished/disabled variant must never surface as a search result).
    pickDefaultVariant(product: Product): Product['variants'][number] | undefined {
        return product.variants.find(v => v.enabled);
    }
}
