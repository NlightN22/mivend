import { Injectable, Logger } from '@nestjs/common';
import { ctxQuery, withAggregateLock, withSavepoint } from 'shared';
import type { ID } from '@vendure/common/lib/shared-types';
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
import { CharacteristicFacetService } from '../characteristic-facet.service';
import { ProductAncillaryDataService } from '../product-ancillary-data.service';
import { TaxCategoryAutoCreateService } from '../tax-category-auto-create.service';
import { resolveVatCode } from '../vat-code-resolver';
import { resolveCategoryFacetValueId } from '../category-resolver';
import {
    extractBarcodes,
    extractErpCreatedAt,
    extractManufacturerCodes,
    extractOptionalString,
    extractManufacturerId,
} from '../product-ancillary-fields';
import { mapProductCharacteristics } from '../product-characteristics-mapper';
import { MissingDependencyError } from '../types';
import { UnitLookupService } from '../unit-lookup.service';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationProductHandler';

// TaxCategory list changes rarely (admin-configured), so a short TTL avoids a DB round-trip on
// every single ProductChanged event without risking a long-stale erpVatCode mapping.
const TAX_CATEGORY_CACHE_TTL_MS = 60_000;

// Short (unlike TaxCategory's 60s) since categories arrive continuously via Kafka — a cache-miss
// forced refresh (see getCategoryFacet) covers the rest of the out-of-order window for free.
const CATEGORY_FACET_CACHE_TTL_MS = 5_000;

// Same facet code CategoryStreamHandler owns/creates (category.handler.ts) — this handler only
// reads it, never creates a category facet or facet value itself.
const CATEGORY_FACET_CODE = 'category';

const EMPTY_ERP_REF = '00000000-0000-0000-0000-000000000000';

// Same customFieldsExternalid lookup as erp-import's ProductHandler (same ERP id, migration window).
// ProductChanged has no organizationId; customFields.organizationId is set elsewhere, don't touch.
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
        private readonly characteristicFacetService: CharacteristicFacetService,
        private readonly taxCategoryAutoCreateService: TaxCategoryAutoCreateService,
        private readonly unitLookupService: UnitLookupService,
    ) {}

    private taxCategoriesCache?: {
        items: Awaited<ReturnType<TaxCategoryService['findAll']>>['items'];
        expiresAt: number;
    };

    private categoryFacetCache?: {
        facetId: ID | undefined;
        valueIdByCode: Map<string, ID>;
        expiresAt: number;
    };

    // Serialized per unit with UnitStreamHandler: a unit that arrives between this product's unit
    // lookup and its variant write would otherwise refresh no variant and leave the new one unfilled.
    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const unitId = extractDefaultSalesUnitId(payload);
        if (!unitId) return this.applyProduct(ctx, entityId, payload);
        return withAggregateLock(this.connection, ctx, `unit:${unitId}`, txCtx =>
            this.applyProduct(txCtx, entityId, payload),
        );
    }

    private async applyProduct(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
        const sku = String(payload.sku ?? '');
        const name = String(payload.name ?? '');
        if (!sku || !name) {
            return inboundNoop(`product ${entityId}: missing sku/name, skipping`);
        }

        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission).
        const isActive = payload.isActive === true;
        // vatCode is not in ProductChangedSchema yet, so this always takes the 'unset' fallback for now.
        // Read defensively; real codes start flowing once the contract adds the field, no change needed.
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

        // issue #116 Tier 2 — Manufacturer is a real entity referenced by the ERP GUID (never a plain
        // string); its name arrives only on the manufacturer stream.
        const manufacturerExternalId = extractManufacturerId(payload);
        const manufacturerId = manufacturerExternalId
            ? String(
                  (await this.manufacturerService.ensureReference(ctx, manufacturerExternalId)).id,
              )
            : undefined;

        // Issue #103: packaging/weight/volume fields, keyed off defaultSalesUnitId — see
        // resolveUnitFields and docs/ai/erp-streams-map.md's `unit` row.
        const unitFields = await this.resolveUnitFields(ctx, payload);

        const characteristicRows = mapProductCharacteristics(payload);
        const manufacturerCodeRows = extractManufacturerCodes(payload);
        const manufacturerPartNumber = extractOptionalString(payload, 'manufacturerPartNumber');
        const fullName = extractOptionalString(payload, 'fullName');
        const erpCreatedAt = extractErpCreatedAt(payload);
        const optionalCustomFields = {
            ...(manufacturerId ? { manufacturerId } : {}),
            ...(erpCreatedAt ? { erpCreatedAt } : {}),
            ...(manufacturerPartNumber ? { manufacturerPartNumber } : {}),
            ...(fullName ? { fullName } : {}),
        };
        const barcodes = extractBarcodes(payload);

        const [existing] = await ctxQuery<Array<{ id: string }>>(
            this.connection,
            ctx,
            `SELECT p.id FROM product p WHERE p."customFieldsExternalid" = $1`,
            [entityId],
        );

        let productId: string;
        let variantId: string;

        if (existing) {
            productId = existing.id;
            await this.productService.update(ctx, {
                id: productId,
                enabled: isActive,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
                // The manufacturer relation is omitted when unset (key must be ${field.name}Id); the
                // text fields are full state, so absent clears them (#259).
                customFields: {
                    ...optionalCustomFields,
                    manufacturerPartNumber: manufacturerPartNumber ?? null,
                    fullName: fullName ?? null,
                },
            });
            const variants = await this.productVariantService.getVariantsByProductId(
                ctx,
                productId,
            );
            if (variants.items.length > 0) {
                const [variant] = variants.items;
                variantId = String(variant.id);
                const facetValueIds = await this.mergeCategoryFacetValueId(
                    ctx,
                    variant.id,
                    categoryFacetValueId,
                );
                // Raw Vendure IDs: a stringified id makes TypeORM's many-to-many save treat the
                // variant as new under numeric IDs (INSERT without sku, #144).
                await this.productVariantService.update(ctx, [
                    {
                        id: variant.id,
                        enabled: isActive,
                        ...(taxCategoryId ? { taxCategoryId } : {}),
                        ...(facetValueIds ? { facetValueIds } : {}),
                        customFields: {
                            defaultSalesUnitId: unitFields?.defaultSalesUnitId ?? null,
                            unitRatioToBase: unitFields?.unitRatioToBase ?? null,
                            unitName: unitFields?.unitName ?? null,
                            unitWeightKg: unitFields?.unitWeightKg ?? null,
                            unitVolumeM3: unitFields?.unitVolumeM3 ?? null,
                        },
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
                    unitFields,
                );
            }
            Logger.verbose(`Updated product externalId=${entityId}`, loggerCtx);
        } else {
            const created = await this.productService.create(ctx, {
                enabled: isActive,
                translations: [{ languageCode: LanguageCode.en, name, slug: sku, description: '' }],
                customFields: { externalId: entityId, ...optionalCustomFields },
            });
            productId = String(created.id);
            variantId = await this.createDefaultVariant(
                ctx,
                productId,
                sku,
                name,
                taxCategoryId,
                categoryFacetValueId,
                unitFields,
            );
            Logger.verbose(`Created product externalId=${entityId}`, loggerCtx);
        }

        await this.productAncillaryDataService.replaceBarcodes(ctx, variantId, barcodes);
        await this.productAncillaryDataService.replaceCharacteristics(
            ctx,
            productId,
            characteristicRows,
        );
        await this.characteristicFacetService.ensureValues(ctx, characteristicRows);
        await this.productAncillaryDataService.replaceManufacturerCodes(
            ctx,
            productId,
            manufacturerCodeRows,
        );
        if (unitFields?.unitMissing) {
            const reason = `product ${entityId} saved without unit fields: unit ${unitFields.defaultSalesUnitId} not received yet (soft link, filled when the unit arrives)`;
            Logger.verbose(reason, loggerCtx);
            return inboundNoop(reason);
        }
        return inboundApplied();
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

    // Only unset/legacy codes need the default TaxCategory; everything else goes through resolveVatCode.
    // Unclean resolutions set a non-blocking review flag instead of failing the product write.
    private async resolveTaxCategoryId(
        ctx: RequestContext,
        entityId: string,
        rawVatCode: string,
    ): Promise<string> {
        const taxCategoryItems = await this.getTaxCategories(ctx);
        let defaultTaxCategoryId = taxCategoryItems.find(tc => tc.isDefault)?.id;
        if (!defaultTaxCategoryId) {
            defaultTaxCategoryId = (await this.taxCategoryAutoCreateService.ensureDefault(ctx))?.id;
            this.taxCategoriesCache = undefined;
        }

        const taxCategoryIdByErpVatCode = new Map(
            taxCategoryItems
                .filter(tc => !!tc.customFields.erpVatCode)
                .map(tc => [tc.customFields.erpVatCode as string, String(tc.id)]),
        );

        const resolution = resolveVatCode(
            rawVatCode,
            taxCategoryIdByErpVatCode,
            defaultTaxCategoryId ? String(defaultTaxCategoryId) : undefined,
        );

        if (resolution.kind === 'missing-default') {
            throw new MissingDependencyError(
                `product ${entityId}: VAT code '${rawVatCode}' (${resolution.reason}) needs a default TaxCategory — set defaultVatCode`,
            );
        }

        if (resolution.kind === 'auto-create') {
            // Unmapped but valid codes are created on the spot, not flagged for review.
            // Invalidate the TaxCategory cache after create, or a same-batch duplicate code is created twice.
            const created = await this.taxCategoryAutoCreateService.findOrCreate(
                ctx,
                resolution.erpVatCode,
                resolution.rawCode,
            );
            this.taxCategoriesCache = undefined;
            return String(created.id);
        }

        if (resolution.flag) {
            const flag = resolution.flag;
            Logger.log(
                `product ${entityId}: VAT code '${rawVatCode}' — ${resolution.flag.detail}`,
                loggerCtx,
            );
            try {
                await this.inSavepoint(ctx, txCtx =>
                    this.productTaxCodeFlagService.report(txCtx, entityId, rawVatCode, flag),
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

    // A failed flag write rolls back only itself, so the surrounding inbox transaction stays usable.
    private inSavepoint<T>(
        ctx: RequestContext,
        work: (txCtx: RequestContext) => Promise<T>,
    ): Promise<T> {
        return this.connection.withTransaction(ctx, txCtx =>
            withSavepoint(this.connection, txCtx, () => work(txCtx)),
        );
    }

    // Cached behind CATEGORY_FACET_CACHE_TTL_MS; forceRefresh bypasses a stale hit on demand.
    private async getCategoryFacet(
        ctx: RequestContext,
        forceRefresh = false,
    ): Promise<{ facetId: ID | undefined; valueIdByCode: Map<string, ID> }> {
        if (
            !forceRefresh &&
            this.categoryFacetCache &&
            this.categoryFacetCache.expiresAt > Date.now()
        ) {
            const { facetId, valueIdByCode } = this.categoryFacetCache;
            return { facetId, valueIdByCode };
        }

        const facet = await this.facetService.findByCode(ctx, CATEGORY_FACET_CODE, LanguageCode.en);
        const valueIdByCode = new Map<string, ID>();
        if (facet) {
            const values = await this.facetValueService.findByFacetId(ctx, facet.id);
            for (const value of values) {
                valueIdByCode.set(value.code, value.id);
            }
        }

        this.categoryFacetCache = {
            facetId: facet?.id,
            valueIdByCode,
            expiresAt: Date.now() + CATEGORY_FACET_CACHE_TTL_MS,
        };
        return { facetId: facet?.id, valueIdByCode };
    }

    // Returns undefined when absent or not yet synced; the caller omits the facet instead of blocking.
    // The flag is non-blocking, so product create/update never fails on a missing category facet value.
    private async resolveCategoryFacetValueIdForProduct(
        ctx: RequestContext,
        entityId: string,
        rawCategoryId: string | undefined,
    ): Promise<ID | undefined> {
        const { valueIdByCode: facetValueIdByCategoryCode } = await this.getCategoryFacet(ctx);

        let resolution = resolveCategoryFacetValueId(rawCategoryId, facetValueIdByCategoryCode);
        // A cache miss for a real category id might just mean the category synced after the
        // cache filled (#149 audit LOW) — one forced re-read closes that window for free.
        if (resolution.flag?.reason === 'not-found') {
            const { valueIdByCode: freshValueIdByCategoryCode } = await this.getCategoryFacet(
                ctx,
                true,
            );
            resolution = resolveCategoryFacetValueId(rawCategoryId, freshValueIdByCategoryCode);
        }

        if (resolution.flag) {
            const flag = resolution.flag;
            Logger.warn(`product ${entityId}: category — ${resolution.flag.detail}`, loggerCtx);
            try {
                await this.inSavepoint(ctx, txCtx =>
                    this.productCategoryFlagService.report(
                        txCtx,
                        entityId,
                        rawCategoryId ?? null,
                        flag,
                    ),
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

    // Replaces only the category-facet slot; other facet values on the variant are preserved.
    // Returns undefined on no-op so the caller omits facetValueIds instead of sending an empty array.
    private async mergeCategoryFacetValueId(
        ctx: RequestContext,
        variantId: ID,
        categoryFacetValueId: ID | undefined,
    ): Promise<ID[] | undefined> {
        const variant = await this.productVariantService.findOne(ctx, variantId, ['facetValues']);
        const currentFacetValues = variant?.facetValues ?? [];
        const { facetId: categoryFacetId } = await this.getCategoryFacet(ctx);
        const nonCategoryFacetValueIds = categoryFacetId
            ? currentFacetValues
                  .filter(fv => String(fv.facetId) !== String(categoryFacetId))
                  .map(fv => fv.id)
            : currentFacetValues.map(fv => fv.id);

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

    // Price/Stock handlers look up the variant by productId; no ProductVariant.externalId exists yet.
    // One variant per product is a temporary simplification until multi-variant mapping is designed.
    private async createDefaultVariant(
        ctx: RequestContext,
        productId: string,
        sku: string,
        name: string,
        taxCategoryId: string | undefined,
        categoryFacetValueId: ID | undefined,
        unitFields: ResolvedUnitFields | null,
    ): Promise<string> {
        const [variant] = await this.productVariantService.create(ctx, [
            {
                productId,
                sku,
                translations: [{ languageCode: LanguageCode.en, name }],
                trackInventory: 'TRUE' as never,
                ...(taxCategoryId ? { taxCategoryId } : {}),
                ...(categoryFacetValueId ? { facetValueIds: [categoryFacetValueId] } : {}),
                customFields: {
                    defaultSalesUnitId: unitFields?.defaultSalesUnitId ?? null,
                    unitRatioToBase: unitFields?.unitRatioToBase ?? null,
                    unitName: unitFields?.unitName ?? null,
                    unitWeightKg: unitFields?.unitWeightKg ?? null,
                    unitVolumeM3: unitFields?.unitVolumeM3 ?? null,
                },
            },
        ]);
        return String(variant.id);
    }

    // The id is kept as a join key even when the unit has not arrived yet; unit fields stay null.
    // UnitStreamHandler fills the unit fields later when the unit arrives.
    private async resolveUnitFields(
        ctx: RequestContext,
        payload: Record<string, unknown>,
    ): Promise<ResolvedUnitFields | null> {
        const defaultSalesUnitId = extractDefaultSalesUnitId(payload);
        if (!defaultSalesUnitId) {
            return null;
        }

        const unit = await this.unitLookupService.findByEntityId(ctx, defaultSalesUnitId);
        if (!unit) {
            return {
                defaultSalesUnitId,
                unitRatioToBase: null,
                unitName: null,
                unitWeightKg: null,
                unitVolumeM3: null,
                unitMissing: true,
            };
        }

        return {
            defaultSalesUnitId,
            unitRatioToBase: unit.ratioToBase,
            unitName: unit.name,
            unitWeightKg: unit.weightKg,
            unitVolumeM3: unit.volumeM3,
            unitMissing: false,
        };
    }
}

function extractDefaultSalesUnitId(payload: Record<string, unknown>): string | undefined {
    const id = payload.defaultSalesUnitId;
    return typeof id === 'string' && id !== '' && id !== EMPTY_ERP_REF ? id : undefined;
}

interface ResolvedUnitFields {
    defaultSalesUnitId: string;
    unitMissing: boolean;
    unitRatioToBase: number | null;
    unitName: string | null;
    unitWeightKg: number | null;
    unitVolumeM3: number | null;
}
