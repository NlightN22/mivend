import { Injectable, Logger } from '@nestjs/common';
import { GlobalFlag } from '@vendure/common/lib/generated-types';
import {
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { ProductRecord } from '../types';

const loggerCtx = 'ErpProductHandler';

@Injectable()
export class ProductHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly productService: ProductService,
        private readonly productVariantService: ProductVariantService,
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

        if (existing) {
            await this.productService.update(ctx, {
                id: existing.id,
                enabled,
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
                        trackInventory: GlobalFlag.TRUE,
                    },
                ]);
            }
            Logger.verbose(`Updated product externalId=${record.externalId}`, loggerCtx);
        } else {
            const product = await this.productService.create(ctx, {
                enabled,
                translations: [
                    {
                        languageCode: LanguageCode.en,
                        name: record.name,
                        slug: record.slug,
                        description: record.description ?? '',
                    },
                ],
                customFields: { externalId: record.externalId },
            });
            await this.productVariantService.create(ctx, [
                {
                    productId: product.id,
                    sku: record.sku,
                    price: priceInCents,
                    stockOnHand: record.stockOnHand,
                    enabled,
                    translations: [{ languageCode: LanguageCode.en, name: record.name }],
                },
            ]);
            Logger.verbose(`Created product externalId=${record.externalId}`, loggerCtx);
        }
    }
}
