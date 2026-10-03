import { Injectable, Logger } from '@nestjs/common';
import {
    CollectionService,
    Facet,
    FacetService,
    FacetValue,
    FacetValueService,
    LanguageCode,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import {
    CATEGORY_FACET_CODE,
    buildCategoryFacetFilter,
    categorySlug,
    recomputeCategoryFilters,
} from 'shared';
import type { CategoryRecord } from '../types';

const loggerCtx = 'CategoryHandler';

@Injectable()
export class CategoryHandler {
    constructor(
        private readonly connection: TransactionalConnection,
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
        private readonly collectionService: CollectionService,
    ) {}

    async upsert(ctx: RequestContext, record: CategoryRecord): Promise<void> {
        const facet = await this.ensureCategoryFacet(ctx);
        const facetValue = await this.ensureFacetValue(ctx, facet, record);
        await this.ensureCollection(ctx, record, String(facetValue.id));
    }

    // Called once after a batch containing categories, so parents list their whole subtree.
    async recomputeFilters(ctx: RequestContext): Promise<void> {
        await recomputeCategoryFilters(ctx, {
            connection: this.connection,
            collectionService: this.collectionService,
            facetService: this.facetService,
            facetValueService: this.facetValueService,
        });
    }

    private async ensureCategoryFacet(ctx: RequestContext): Promise<Facet> {
        const existing = await this.facetService.findByCode(
            ctx,
            CATEGORY_FACET_CODE,
            LanguageCode.en,
        );
        if (existing) return existing;
        return this.facetService.create(ctx, {
            code: CATEGORY_FACET_CODE,
            isPrivate: false,
            translations: [{ languageCode: LanguageCode.en, name: 'Category' }],
        });
    }

    private async ensureFacetValue(
        ctx: RequestContext,
        facet: { id: string | number },
        record: CategoryRecord,
    ): Promise<FacetValue> {
        const all = await this.facetValueService.findByFacetId(ctx, facet.id);
        const existing = all.find(v => v.code === record.erpId);

        if (existing) {
            return this.facetValueService.update(ctx, {
                id: existing.id,
                translations: [{ languageCode: LanguageCode.en, name: record.name }],
            });
        }

        return this.facetValueService.create(ctx, facet as never, {
            facetId: String(facet.id),
            code: record.erpId,
            translations: [{ languageCode: LanguageCode.en, name: record.name }],
        });
    }

    private async ensureCollection(
        ctx: RequestContext,
        record: CategoryRecord,
        facetValueId: string,
    ): Promise<void> {
        const slug = categorySlug(record.erpId);
        const existing = await this.collectionService.findOneBySlug(ctx, slug);

        const filters = buildCategoryFacetFilter([facetValueId]);

        if (existing) {
            await this.collectionService.update(ctx, {
                id: existing.id,
                translations: [
                    { languageCode: LanguageCode.en, name: record.name, slug, description: '' },
                ],
                filters,
            });
            Logger.verbose(`Updated collection erpId=${record.erpId}`, loggerCtx);
            return;
        }

        const parentId = record.parentErpId
            ? await this.findCollectionIdByErpId(ctx, record.parentErpId)
            : undefined;

        await this.collectionService.create(ctx, {
            parentId: parentId ?? undefined,
            isPrivate: false,
            translations: [
                { languageCode: LanguageCode.en, name: record.name, slug, description: '' },
            ],
            filters,
        });
        Logger.verbose(`Created collection erpId=${record.erpId}`, loggerCtx);
    }

    private async findCollectionIdByErpId(
        ctx: RequestContext,
        erpId: string,
    ): Promise<string | undefined> {
        const col = await this.collectionService.findOneBySlug(ctx, categorySlug(erpId));
        return col ? String(col.id) : undefined;
    }
}
