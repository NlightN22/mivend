import { Injectable, Logger } from '@nestjs/common';
import {
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContext,
    TaxCategoryService,
    TransactionalConnection,
} from '@vendure/core';

import { ProductTaxCodeFlagService } from '../product-tax-code-flag.service';
import { resolveVatCode } from '../vat-code-resolver';
import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationProductHandler';

// TaxCategory list changes rarely (admin-configured), so a short TTL avoids a DB round-trip on
// every single ProductChanged event without risking a long-stale erpVatCode mapping.
const TAX_CATEGORY_CACHE_TTL_MS = 60_000;

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
        private readonly taxCategoryService: TaxCategoryService,
        private readonly productTaxCodeFlagService: ProductTaxCodeFlagService,
    ) {}

    private taxCategoriesCache?: {
        items: Awaited<ReturnType<TaxCategoryService['findAll']>>['items'];
        expiresAt: number;
    };

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

        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission).
        const isActive = payload.isActive === true;
        // `vatCode` isn't in @nlightn22/event-contracts' ProductChangedSchema yet (verified
        // against 0.13.0's product_changed_pb.d.ts — no VAT field at all; tracked as issue #113).
        // Reading it here anyway, defensively: until that contract is extended this always
        // resolves via the 'unset' branch below, which is exactly the intended non-blocking
        // fallback (issue #79), not a bug — the moment the contract gains the field, real codes
        // flow through with no further changes needed here.
        const rawVatCode = String(payload.vatCode ?? '');
        const taxCategoryId = await this.resolveTaxCategoryId(ctx, entityId, rawVatCode);

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
                    {
                        id: variants.items[0].id,
                        enabled: isActive,
                        ...(taxCategoryId ? { taxCategoryId } : {}),
                    },
                ]);
            } else {
                await this.createDefaultVariant(ctx, existing.id, sku, name, taxCategoryId);
            }
            Logger.verbose(`Updated product externalId=${entityId}`, loggerCtx);
            return;
        }

        const created = await this.productService.create(ctx, {
            enabled: isActive,
            translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
            customFields: { externalId: entityId },
        });
        await this.createDefaultVariant(ctx, String(created.id), sku, name, taxCategoryId);
        Logger.verbose(`Created product externalId=${entityId}`, loggerCtx);
    }

    private async getTaxCategories(
        ctx: RequestContext,
    ): Promise<Awaited<ReturnType<TaxCategoryService['findAll']>>['items']> {
        if (this.taxCategoriesCache && this.taxCategoriesCache.expiresAt > Date.now()) {
            return this.taxCategoriesCache.items;
        }
        const taxCategories = await this.taxCategoryService.findAll(ctx);
        this.taxCategoriesCache = {
            items: taxCategories.items,
            expiresAt: Date.now() + TAX_CATEGORY_CACHE_TTL_MS,
        };
        return taxCategories.items;
    }

    // Resolves the raw VAT code to a TaxCategory id via the pure resolveVatCode function,
    // persisting a non-blocking review flag when the resolution isn't a clean match (issue #79).
    // Returns undefined only when there is no default TaxCategory configured at all yet (a
    // completely unconfigured environment) — in that case the variant create/update below omits
    // taxCategoryId entirely, same as this handler's pre-#79 behavior.
    private async resolveTaxCategoryId(
        ctx: RequestContext,
        entityId: string,
        rawVatCode: string,
    ): Promise<string | undefined> {
        const taxCategoryItems = await this.getTaxCategories(ctx);
        const defaultTaxCategory = taxCategoryItems.find(tc => tc.isDefault);
        if (!defaultTaxCategory) {
            Logger.warn(
                `product ${entityId}: no default TaxCategory configured, leaving taxCategoryId unset`,
                loggerCtx,
            );
            return undefined;
        }

        const taxCategoryIdByErpVatCode = new Map(
            taxCategoryItems
                .filter(tc => !!tc.customFields.erpVatCode)
                .map(tc => [tc.customFields.erpVatCode as string, String(tc.id)]),
        );

        const resolution = resolveVatCode(
            rawVatCode,
            taxCategoryIdByErpVatCode,
            String(defaultTaxCategory.id),
        );

        if (resolution.flag) {
            Logger.log(
                `product ${entityId}: VAT code '${rawVatCode}' — ${resolution.flag.detail}`,
                loggerCtx,
            );
            try {
                await this.productTaxCodeFlagService.report(
                    ctx,
                    entityId,
                    rawVatCode,
                    resolution.flag,
                );
            } catch (err) {
                // Flagging is a review aid, not part of the import contract (issue #79) —
                // losing a flag row must never block product create/update.
                Logger.error(
                    `product ${entityId}: failed to persist VAT code flag: ${err instanceof Error ? err.message : String(err)}`,
                    loggerCtx,
                );
            }
        }

        return resolution.taxCategoryId;
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
        taxCategoryId: string | undefined,
    ): Promise<void> {
        await this.productVariantService.create(ctx, [
            {
                productId,
                sku,
                translations: [{ languageCode: LanguageCode.en, name }],
                trackInventory: 'TRUE' as never,
                ...(taxCategoryId ? { taxCategoryId } : {}),
            },
        ]);
    }
}
