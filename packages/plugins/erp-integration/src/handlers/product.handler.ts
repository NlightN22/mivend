import { Injectable, Logger } from '@nestjs/common';
import {
    FacetService,
    FacetValueService,
    LanguageCode,
    ProductService,
    ProductVariantService,
    RequestContext,
    TaxCategoryService,
    TransactionalConnection,
} from '@vendure/core';

import { ProductTaxCodeFlagService } from '../product-tax-code-flag.service';
import { ProductCategoryFlagService } from '../product-category-flag.service';
import { ManufacturerService } from '../manufacturer.service';
import { ProductAncillaryDataService } from '../product-ancillary-data.service';
import { resolveVatCode } from '../vat-code-resolver';
import { resolveCategoryFacetValueId } from '../category-resolver';
import {
    extractBarcodes,
    extractManufacturerCodes,
    extractManufacturerId,
} from '../product-ancillary-fields';
import {
    findManufacturerNameFromAttributes,
    mapProductCharacteristics,
} from '../product-characteristics-mapper';
import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationProductHandler';

// TaxCategory list changes rarely (admin-configured), so a short TTL avoids a DB round-trip on
// every single ProductChanged event without risking a long-stale erpVatCode mapping.
const TAX_CATEGORY_CACHE_TTL_MS = 60_000;

// Same facet code CategoryStreamHandler owns/creates (category.handler.ts) — this handler only
// reads it, never creates a category facet or facet value itself.
const CATEGORY_FACET_CODE = 'category';

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
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
        private readonly productCategoryFlagService: ProductCategoryFlagService,
        private readonly manufacturerService: ManufacturerService,
        private readonly productAncillaryDataService: ProductAncillaryDataService,
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

        // issue #116: category_id -> the 'category' facet's FacetValue, assigned to the VARIANT
        // (see resolveCategoryFacetValueIdForProduct's own doc comment for why not the Product).
        const rawCategoryId =
            typeof payload.categoryId === 'string' && payload.categoryId !== ''
                ? payload.categoryId
                : undefined;
        const categoryFacetValueId = await this.resolveCategoryFacetValueIdForProduct(
            ctx,
            entityId,
            rawCategoryId,
        );

        // issue #116 Tier 2 — Manufacturer is a real entity (find-or-create by the 1C GUID,
        // name backfilled from the 'attributes' map's own 'Производитель' key), never a plain
        // string custom field (that field is a GUID, not a display name).
        const manufacturerExternalId = extractManufacturerId(payload);
        const manufacturerName = findManufacturerNameFromAttributes(payload);
        const manufacturerId = manufacturerExternalId
            ? String(
                  (
                      await this.manufacturerService.upsert(
                          ctx,
                          manufacturerExternalId,
                          manufacturerName,
                      )
                  ).id,
              )
            : undefined;

        const characteristicRows = mapProductCharacteristics(payload);
        const manufacturerCodeRows = extractManufacturerCodes(payload);
        const barcodes = extractBarcodes(payload);

        const existing = await this.connection.rawConnection
            .createQueryBuilder()
            .select('p.id', 'id')
            .from('product', 'p')
            .where('p."customFieldsExternalid" = :extId', { extId: entityId })
            .getRawOne<{ id: string }>();

        let productId: string;
        let variantId: string;

        if (existing) {
            productId = existing.id;
            await this.productService.update(ctx, {
                id: productId,
                enabled: isActive,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
                // Omit manufacturerId entirely when this event carries none — an update must
                // never clear an already-resolved manufacturer relation just because a later
                // event happens not to mention it (same non-destructive-absence philosophy as
                // ManufacturerService.upsert's own name backfill).
                ...(manufacturerId ? { customFields: { manufacturerId } } : {}),
            });
            const variants = await this.productVariantService.getVariantsByProductId(
                ctx,
                productId,
            );
            if (variants.items.length > 0) {
                variantId = String(variants.items[0].id);
                const facetValueIds = await this.mergeCategoryFacetValueId(
                    ctx,
                    variantId,
                    categoryFacetValueId,
                );
                await this.productVariantService.update(ctx, [
                    {
                        id: variantId,
                        enabled: isActive,
                        ...(taxCategoryId ? { taxCategoryId } : {}),
                        ...(facetValueIds ? { facetValueIds } : {}),
                    },
                ]);
            } else {
                variantId = await this.createDefaultVariant(
                    ctx,
                    productId,
                    sku,
                    name,
                    taxCategoryId,
                    categoryFacetValueId,
                );
            }
            Logger.verbose(`Updated product externalId=${entityId}`, loggerCtx);
        } else {
            const created = await this.productService.create(ctx, {
                enabled: isActive,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
                customFields: { externalId: entityId, manufacturerId },
            });
            productId = String(created.id);
            variantId = await this.createDefaultVariant(
                ctx,
                productId,
                sku,
                name,
                taxCategoryId,
                categoryFacetValueId,
            );
            Logger.verbose(`Created product externalId=${entityId}`, loggerCtx);
        }

        await this.productAncillaryDataService.replaceBarcodes(ctx, variantId, barcodes);
        await this.productAncillaryDataService.replaceCharacteristics(
            ctx,
            productId,
            characteristicRows,
        );
        await this.productAncillaryDataService.replaceManufacturerCodes(
            ctx,
            productId,
            manufacturerCodeRows,
        );
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

    // Resolves category_id to the 'category' facet's FacetValue id via the pure
    // resolveCategoryFacetValueId function, persisting a non-blocking review flag when
    // unresolved (absent, or not synced yet — issue #116). Returns undefined in both flagged
    // cases; the caller omits the category facet value entirely rather than blocking product
    // create/update — same non-blocking philosophy as resolveTaxCategoryId/issue #79.
    //
    // No caching here (unlike getTaxCategories): categories arrive continuously via Kafka, not
    // admin-configured-rarely like TaxCategory — a cache would risk exactly the out-of-order
    // "category just synced, product arrives right after" race this method exists to tolerate,
    // for no proven throughput benefit (see AGENTS.md — no speculative optimization).
    private async resolveCategoryFacetValueIdForProduct(
        ctx: RequestContext,
        entityId: string,
        rawCategoryId: string | undefined,
    ): Promise<string | undefined> {
        const facet = await this.facetService.findByCode(ctx, CATEGORY_FACET_CODE, LanguageCode.en);
        const facetValueIdByCategoryCode = new Map<string, string>();
        if (facet) {
            const values = await this.facetValueService.findByFacetId(ctx, facet.id);
            for (const value of values) {
                facetValueIdByCategoryCode.set(value.code, String(value.id));
            }
        }

        const resolution = resolveCategoryFacetValueId(rawCategoryId, facetValueIdByCategoryCode);

        if (resolution.flag) {
            Logger.warn(`product ${entityId}: category — ${resolution.flag.detail}`, loggerCtx);
            try {
                await this.productCategoryFlagService.report(
                    ctx,
                    entityId,
                    rawCategoryId ?? null,
                    resolution.flag,
                );
            } catch (err) {
                Logger.error(
                    `product ${entityId}: failed to persist category flag: ${err instanceof Error ? err.message : String(err)}`,
                    loggerCtx,
                );
            }
        }

        return resolution.facetValueId;
    }

    // On update, replaces only the variant's own category-facet slot — every other facet value
    // already on the variant (any future non-category use) survives untouched. Returns undefined
    // when there's nothing to change (no new category resolved AND the variant already has none),
    // so the caller can omit facetValueIds from the update input entirely rather than sending a
    // no-op empty array.
    private async mergeCategoryFacetValueId(
        ctx: RequestContext,
        variantId: string,
        categoryFacetValueId: string | undefined,
    ): Promise<string[] | undefined> {
        const variant = await this.productVariantService.findOne(ctx, variantId, ['facetValues']);
        const currentFacetValues = variant?.facetValues ?? [];
        const categoryFacet = await this.facetService.findByCode(
            ctx,
            CATEGORY_FACET_CODE,
            LanguageCode.en,
        );
        const nonCategoryFacetValueIds = categoryFacet
            ? currentFacetValues
                  .filter(fv => String(fv.facetId) !== String(categoryFacet.id))
                  .map(fv => String(fv.id))
            : currentFacetValues.map(fv => String(fv.id));

        if (
            !categoryFacetValueId &&
            nonCategoryFacetValueIds.length === currentFacetValues.length
        ) {
            // Nothing to change: no new category resolved, and the variant had no category facet
            // value to remove either.
            return undefined;
        }

        return categoryFacetValueId
            ? [...nonCategoryFacetValueIds, categoryFacetValueId]
            : nonCategoryFacetValueIds;
    }

    // A Product with zero variants can't be priced/stocked/ordered — one default variant per
    // product is this plugin's simplification until real multi-variant mapping is designed
    // (out of scope for issue #63). PriceStreamHandler/StockStreamHandler resolve the target
    // variant by productId -> this variant, since there is no ProductVariant.externalId
    // customField yet (single-variant-per-product assumption, matching erp-import's own).
    // Returns the created variant's id (needed by the caller to attach barcodes, issue #116).
    private async createDefaultVariant(
        ctx: RequestContext,
        productId: string,
        sku: string,
        name: string,
        taxCategoryId: string | undefined,
        categoryFacetValueId: string | undefined,
    ): Promise<string> {
        const [variant] = await this.productVariantService.create(ctx, [
            {
                productId,
                sku,
                translations: [{ languageCode: LanguageCode.en, name }],
                trackInventory: 'TRUE' as never,
                ...(taxCategoryId ? { taxCategoryId } : {}),
                ...(categoryFacetValueId ? { facetValueIds: [categoryFacetValueId] } : {}),
            },
        ]);
        return String(variant.id);
    }
}
