import { Injectable, Logger } from '@nestjs/common';
import {
    CollectionService,
    Facet,
    FacetService,
    FacetValue,
    FacetValueService,
    LanguageCode,
    RequestContext,
} from '@vendure/core';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCategoryHandler';
const CATEGORY_FACET_CODE = 'category';

// Mirrors erp-import's own CategoryHandler (facet value + collection per category, keyed by
// erpId/entityId as the facet value code) — same target shape, arriving over Kafka instead of
// the REST batch endpoint.
@Injectable()
export class CategoryStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly facetService: FacetService,
        private readonly facetValueService: FacetValueService,
        private readonly collectionService: CollectionService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        const name = String(payload.name ?? '');
        if (!name) {
            Logger.warn(`category ${entityId}: missing name, skipping`, loggerCtx);
            return;
        }
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission).
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        const isPrivate = !isActive || isDeleted;

        const facet = await this.ensureCategoryFacet(ctx);
        const facetValue = await this.ensureFacetValue(ctx, facet, entityId, name);
        await this.ensureCollection(ctx, entityId, name, String(facetValue.id), isPrivate);
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
        entityId: string,
        name: string,
    ): Promise<FacetValue> {
        const all = await this.facetValueService.findByFacetId(ctx, facet.id);
        const existing = all.find(v => v.code === entityId);
        if (existing) {
            return this.facetValueService.update(ctx, {
                id: existing.id,
                translations: [{ languageCode: LanguageCode.en, name }],
            });
        }
        return this.facetValueService.create(ctx, facet as never, {
            facetId: String(facet.id),
            code: entityId,
            translations: [{ languageCode: LanguageCode.en, name }],
        });
    }

    private async ensureCollection(
        ctx: RequestContext,
        entityId: string,
        name: string,
        facetValueId: string,
        isPrivate: boolean,
    ): Promise<void> {
        const slug = `cat-${entityId}`;
        const existing = await this.collectionService.findOneBySlug(ctx, slug);
        const filters = [
            {
                code: 'facet-value-filter',
                arguments: [
                    { name: 'facetValueIds', value: JSON.stringify([facetValueId]) },
                    { name: 'containsAny', value: 'false' },
                ],
            },
        ];
        if (existing) {
            await this.collectionService.update(ctx, {
                id: existing.id,
                isPrivate,
                translations: [{ languageCode: LanguageCode.en, name, slug, description: '' }],
                filters,
            });
            return;
        }
        await this.collectionService.create(ctx, {
            isPrivate,
            translations: [{ languageCode: LanguageCode.en, name, slug, description: '' }],
            filters,
        });
    }
}
