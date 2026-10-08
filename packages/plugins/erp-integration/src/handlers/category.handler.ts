import { Injectable, Logger } from '@nestjs/common';
import {
    CATEGORY_FACET_CODE,
    buildCategoryFacetFilter,
    categorySlug,
    collectFacetValueIds,
    ensureParentCategoryCollection,
    moveCategoryIfParentChanged,
    resolveCategoryIsPrivate,
} from 'shared';
import {
    CollectionService,
    Facet,
    FacetService,
    FacetValue,
    FacetValueService,
    LanguageCode,
    RequestContext,
} from '@vendure/core';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationCategoryHandler';

interface CollectionInput {
    entityId: string;
    name: string | null;
    facetValueId: string;
    feedHidden: boolean;
    parentErpId: string | undefined;
    reparent: boolean;
    facetValueIdByCode: ReadonlyMap<string, string>;
}

// CategoryChanged: entity_id (FacetValue code, Collection slug), name, parent_id, is_active and
// is_deleted are consumed; version drives the inbox guard; event_id/occurred_at/updated_at are
// envelope-only. Design: docs/category-hierarchy.md; status row: docs/ai/erp-streams-map.md.
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
    ): Promise<InboundOutcome> {
        // A deletion tombstone carries no name; it still hides a known category, but never creates one.
        const name = payload.name ? String(payload.name) : null;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission).
        const isActive = payload.isActive === true;
        const isDeleted = payload.isDeleted === true;
        const isPrivate = !isActive || isDeleted;
        let parentErpId = payload.parentId ? String(payload.parentId) : undefined;
        if (parentErpId === entityId) {
            Logger.warn(`category ${entityId}: parent_id points to itself, ignoring`, loggerCtx);
            parentErpId = undefined;
        }

        const facet = await this.ensureCategoryFacet(ctx);
        const facetValues = await this.facetValueService.findByFacetId(ctx, facet.id);
        const existingFacetValue = facetValues.find(v => v.code === entityId);
        if (!existingFacetValue && !name) {
            return inboundNoop(
                `category ${entityId}: missing name and no existing facet value, skipping`,
            );
        }
        const facetValue = await this.ensureFacetValue(
            ctx,
            facet,
            entityId,
            name,
            existingFacetValue,
        );
        const facetValueIdByCode = new Map(facetValues.map(v => [v.code, String(v.id)]));
        facetValueIdByCode.set(entityId, String(facetValue.id));
        return this.ensureCollection(ctx, {
            entityId,
            name,
            facetValueId: String(facetValue.id),
            feedHidden: isPrivate,
            // A tombstone carries no hierarchy; it must not move the category to the top level.
            parentErpId: isDeleted ? undefined : parentErpId,
            reparent: !isDeleted,
            facetValueIdByCode,
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

    // A null name leaves an existing facet value's name untouched; apply() guarantees a name on create.
    private async ensureFacetValue(
        ctx: RequestContext,
        facet: Facet,
        entityId: string,
        name: string | null,
        existing: FacetValue | undefined,
    ): Promise<FacetValue> {
        if (existing) {
            if (!name) return existing;
            return this.facetValueService.update(ctx, {
                id: existing.id,
                translations: [{ languageCode: LanguageCode.en, name }],
            });
        }
        return this.facetValueService.create(ctx, facet as never, {
            facetId: String(facet.id),
            code: entityId,
            // Guaranteed non-null here — apply() only reaches this branch (no existing facet
            // value) when name is present.
            translations: [{ languageCode: LanguageCode.en, name: name as string }],
        });
    }

    private async ensureCollection(
        ctx: RequestContext,
        input: CollectionInput,
    ): Promise<InboundOutcome> {
        const { entityId, name, facetValueId, feedHidden, parentErpId, reparent } = input;
        const slug = categorySlug(entityId);
        const existing = await this.collectionService.findOneBySlug(ctx, slug);
        if (!existing && !name) {
            return inboundNoop(
                `category ${entityId}: missing name and no existing collection, skipping`,
            );
        }
        const resolvedName = name ?? existing!.name;
        const translations = [
            { languageCode: LanguageCode.en, name: resolvedName, slug, description: '' },
        ];
        const parent = parentErpId
            ? await ensureParentCategoryCollection(ctx, this.collectionService, parentErpId)
            : undefined;
        const parentId = parent?.id;
        // The manual override (issue #90) wins over the feed and over a hidden parent; a first-seen
        // category has none to read yet.
        const override = (existing as { customFields?: { visibilityOverride?: string | null } })
            ?.customFields?.visibilityOverride;
        const resolvedIsPrivate = resolveCategoryIsPrivate(
            feedHidden,
            override,
            parent?.isPrivate ?? false,
        );
        const customFields = { feedHidden };

        if (!existing) {
            await this.collectionService.create(ctx, {
                parentId,
                isPrivate: resolvedIsPrivate,
                translations,
                filters: buildCategoryFacetFilter([facetValueId]),
                customFields,
            });
            return inboundApplied();
        }

        const descendants = await this.collectionService.getDescendants(ctx, existing.id);
        const facetValueIds = collectFacetValueIds(
            facetValueId,
            descendants.map(d => d.slug),
            input.facetValueIdByCode,
        );
        await this.collectionService.update(ctx, {
            id: existing.id,
            isPrivate: resolvedIsPrivate,
            translations,
            filters: buildCategoryFacetFilter(facetValueIds),
            customFields,
        });
        if (reparent) {
            await moveCategoryIfParentChanged(ctx, this.collectionService, existing, parentId);
        }
        return inboundApplied();
    }
}
