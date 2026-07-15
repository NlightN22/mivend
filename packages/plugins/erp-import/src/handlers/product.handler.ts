import { Injectable, Logger } from '@nestjs/common';
import {
    FacetService,
    FacetValueService,
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { ProductRecord } from '../types';

const loggerCtx = 'ErpProductHandler';
const CATEGORY_FACET_CODE = 'category';
const BRAND_FACET_CODE = 'brand';

@Injectable()
export class ProductHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly productService: ProductService,
        private readonly productVariantService: ProductVariantService,
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
    ) {}

    async upsert(ctx: RequestContext, record: ProductRecord): Promise<void> {
        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .innerJoin('product_translation', 'pt', 'pt."baseId" = p.id')
            .where('p."customFieldsExternalid" = :extId', { extId: record.externalId })
            .getRawOne<{ id: string }>();

        const priceInCents = Math.round(record.price * 100);
        const enabled = record.enabled ?? true;
        const onSale = record.onSale ?? false;
        const categoryIds = await this.resolveFacetValueIds(record.categoryCode);
        const brandId = await this.resolveOrCreateBrandFacetValue(ctx, record.brandCode);
        const facetValueIds = [...categoryIds, ...(brandId ? [brandId] : [])];

        if (existing) {
            await this.productService.update(ctx, {
                id: existing.id,
                enabled,
                facetValueIds,
                customFields: {
                    onSale,
                    ...(record.fullName !== undefined && { fullName: record.fullName }),
                },
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: record.name,
                        slug: record.slug,
                        description: record.description ?? '',
                    },
                ],
            });
            const variants = await this.productVariantService.getVariantsByProductId(
                ctx,
                existing.id,
            );
            if (variants.items.length > 0) {
                await this.productVariantService.update(ctx, [
                    {
                        id: variants.items[0].id,
                        enabled,
                        price: priceInCents,
                        customFields: {
                            weight: record.weight ?? null,
                            multiplicity: record.multiplicity ?? null,
                        },
                    },
                ]);
            }
            Logger.verbose(`Updated product externalId=${record.externalId}`, loggerCtx);
        } else {
            const product = await this.productService.create(ctx, {
                enabled,
                facetValueIds,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: record.name,
                        slug: record.slug,
                        description: record.description ?? '',
                    },
                ],
                customFields: {
                    externalId: record.externalId,
                    onSale,
                    fullName: record.fullName ?? '',
                },
            });
            await this.productVariantService.create(ctx, [
                {
                    productId: product.id,
                    sku: record.sku,
                    price: priceInCents,
                    stockOnHand: record.stockOnHand,
                    enabled,
                    customFields: { weight: record.weight ?? null },
                    translations: [{ languageCode: LanguageCode.en, name: record.name }],
                },
            ]);
            Logger.verbose(`Created product externalId=${record.externalId}`, loggerCtx);
        }
    }

    private async resolveOrCreateBrandFacetValue(
        ctx: RequestContext,
        brandCode: string | undefined,
    ): Promise<string | undefined> {
        if (!brandCode) return undefined;

        const existing = (await this.connection.rawConnection.query(
            `SELECT fv.id FROM facet_value fv
             INNER JOIN facet f ON f.id = fv."facetId"
             WHERE fv.code = $1 AND f.code = $2
             LIMIT 1`,
            [brandCode, BRAND_FACET_CODE],
        )) as Array<{ id: string }>;
        if (existing.length > 0) return String(existing[0].id);

        let facet = await this.facetService.findByCode(ctx, BRAND_FACET_CODE, LanguageCode.en);
        if (!facet) {
            facet = await this.facetService.create(ctx, {
                code: BRAND_FACET_CODE,
                isPrivate: false,
                translations: [{ languageCode: LanguageCode.en, name: 'Brand' }],
            });
        }

        const brandName = brandCode.charAt(0).toUpperCase() + brandCode.slice(1);
        const fv = await this.facetValueService.create(ctx, facet as never, {
            facetId: String(facet.id),
            code: brandCode,
            translations: [{ languageCode: LanguageCode.en, name: brandName }],
        });
        return String(fv.id);
    }

    private async resolveFacetValueIds(categoryCode: string | undefined): Promise<string[]> {
        if (!categoryCode) return [];
        const rows = (await this.connection.rawConnection.query(
            `SELECT fv.id FROM facet_value fv
             INNER JOIN facet f ON f.id = fv."facetId"
             WHERE fv.code = $1 AND f.code = $2
             LIMIT 1`,
            [categoryCode, CATEGORY_FACET_CODE],
        )) as Array<{ id: string }>;
        return rows.length > 0 ? [String(rows[0].id)] : [];
    }
}
