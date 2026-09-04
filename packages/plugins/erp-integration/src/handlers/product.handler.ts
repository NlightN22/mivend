import { Injectable, Logger } from '@nestjs/common';
import {
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationProductHandler';

// Applies Integration Service's `product` stream (ProductChanged). Deliberately reuses the same
// lookup shape as erp-import's ProductHandler (match by `customFieldsExternalid`) rather than a
// second, competing external-id scheme — both are "the ERP's product id", just arriving over two
// different transports during the migration window (issue #62's own framing: erp-import's fate
// is a separate, deferred decision, not something this plugin needs to resolve).
//
// ProductChanged has no `organizationId` field at all (issue #63) — the customFields.organizationId
// shortcut (issue #62 design point 5) is populated by a different, unrelated path and is left
// untouched here.
@Injectable()
export class ProductStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly productService: ProductService,
        private readonly productVariantService: ProductVariantService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const sku = String(payload.sku ?? '');
        const name = String(payload.name ?? '');
        if (!sku || !name) {
            Logger.warn(`product ${entityId}: missing sku/name, skipping`, loggerCtx);
            return;
        }

        const isActive = payload.isActive !== false;

        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :extId', { extId: entityId })
            .getRawOne<{ id: string }>();

        if (existing) {
            await this.productService.update(ctx, {
                id: existing.id,
                enabled: isActive,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
            });
            const variants = await this.productVariantService.getVariantsByProductId(
                ctx,
                existing.id,
            );
            if (variants.items.length > 0) {
                await this.productVariantService.update(ctx, [
                    { id: variants.items[0].id, enabled: isActive },
                ]);
            } else {
                await this.createDefaultVariant(ctx, existing.id, sku, name);
            }
            Logger.verbose(`Updated product externalId=${entityId}`, loggerCtx);
            return;
        }

        const created = await this.productService.create(ctx, {
            enabled: isActive,
            translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
            customFields: { externalId: entityId },
        });
        await this.createDefaultVariant(ctx, String(created.id), sku, name);
        Logger.verbose(`Created product externalId=${entityId}`, loggerCtx);
    }

    // A Product with zero variants can't be priced/stocked/ordered — one default variant per
    // product is this plugin's simplification until real multi-variant mapping is designed
    // (out of scope for issue #63). PriceStreamHandler/StockStreamHandler resolve the target
    // variant by productId -> this variant, since there is no ProductVariant.externalId
    // customField yet (single-variant-per-product assumption, matching erp-import's own).
    private async createDefaultVariant(
        ctx: RequestContext,
        productId: string,
        sku: string,
        name: string,
    ): Promise<void> {
        await this.productVariantService.create(ctx, [
            {
                productId,
                sku,
                translations: [{ languageCode: LanguageCode.en, name }],
                trackInventory: 'TRUE' as never,
            },
        ]);
    }
}
