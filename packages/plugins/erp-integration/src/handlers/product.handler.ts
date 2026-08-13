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

// Applies Integration Service's `product` stream. Deliberately reuses the same lookup shape as
// erp-import's ProductHandler (match by `customFieldsExternalid`) rather than a second, competing
// external-id scheme — both are "the ERP's product id", just arriving over two different
// transports during the migration window (issue #62's own framing: erp-import's fate is a
// separate, deferred decision, not something this plugin needs to resolve).
//
// Organization/Warehouse mapping is the current customFields.organizationId shortcut only (issue
// #62 design point 5) — no Seller/Channel/StockLocation migration here, by design.
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

        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :extId', { extId: entityId })
            .getRawOne<{ id: string }>();

        const enabled = payload.enabled !== false;
        const organizationId =
            typeof payload.organizationId === 'number' ? payload.organizationId : null;

        if (existing) {
            await this.productService.update(ctx, {
                id: existing.id,
                enabled,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
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
                        customFields: { organizationId },
                    },
                ]);
            }
            Logger.verbose(`Updated product externalId=${entityId}`, loggerCtx);
            return;
        }

        await this.productService.create(ctx, {
            enabled,
            translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
            customFields: { externalId: entityId },
        });
        Logger.verbose(`Created product externalId=${entityId}`, loggerCtx);
    }
}
