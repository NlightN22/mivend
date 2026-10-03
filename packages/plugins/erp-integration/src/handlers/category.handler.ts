import { Injectable, Logger } from '@nestjs/common';
import {
    CATEGORY_FACET_CODE,
    buildCategoryFacetFilter,
    categorySlug,
    collectFacetValueIds,
    resolveCategoryIsPrivate,
} from 'shared';
import type { ID } from '@vendure/common/lib/shared-types';
import {
    Collection,
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

interface CollectionInput {
    entityId: string;
    name: string | null;
    facetValueId: string;
    feedHidden: boolean;
    parentErpId: string | undefined;
    reparent: boolean;
    facetValueIdByCode: ReadonlyMap<string, string>;
}

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
        // A deletion tombstone (isDeleted:true) never carries a name — confirmed against real
        // staging-integration payloads (mivend.issue.84.88 follow-up). `name: null` still lets
        // an already-known category be hidden (isPrivate) below; only creating a brand-new
        // facet value/Collection still requires a real name (see ensureFacetValue/
        // ensureCollection — neither fabricates one).
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
            Logger.warn(
                `category ${entityId}: missing name and no existing facet value, skipping`,
                loggerCtx,
            );
            return;
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
        await this.ensureCollection(ctx, {
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

    // `name: null` only updates an already-found facet value's isActive-adjacent state via the
    // caller's later isPrivate write on the Collection — the facet value's own name translation
    // is left untouched rather than blanked. Creating a brand-new facet value still requires a
    // real name; the caller (apply) already guarantees that when `existing` is undefined.
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

    private async ensureCollection(ctx: RequestContext, input: CollectionInput): Promise<void> {
        const { entityId, name, facetValueId, feedHidden, parentErpId, reparent } = input;
        const slug = categorySlug(entityId);
        const existing = await this.collectionService.findOneBySlug(ctx, slug);
        if (!existing && !name) {
            Logger.warn(
                `category ${entityId}: missing name and no existing collection, skipping`,
                loggerCtx,
            );
            return;
        }
        const resolvedName = name ?? existing!.name;
        const translations = [
            { languageCode: LanguageCode.en, name: resolvedName, slug, description: '' },
        ];
        const parent = parentErpId
            ? await this.ensureParentCollection(ctx, parentErpId)
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
            return;
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
        if (reparent) await this.moveIfParentChanged(ctx, existing, parentId);
    }

    // `desiredParentId` undefined means top level (child of the root Collection).
    private async moveIfParentChanged(
        ctx: RequestContext,
        existing: Collection,
        desiredParentId: ID | undefined,
    ): Promise<void> {
        const breadcrumbs = await this.collectionService.getBreadcrumbs(ctx, existing);
        const currentParentId = breadcrumbs[breadcrumbs.length - 2]?.id;
        const targetParentId = desiredParentId ?? breadcrumbs[0]?.id;
        if (targetParentId === undefined || String(currentParentId) === String(targetParentId)) {
            return;
        }
        await this.collectionService.move(ctx, {
            collectionId: existing.id,
            parentId: targetParentId,
            index: 0,
        });
    }

    // A child can arrive before its parent: park it under a private placeholder that the
    // parent's own event later fills in, instead of waiting or flattening under the root.
    private async ensureParentCollection(
        ctx: RequestContext,
        parentErpId: string,
    ): Promise<{ id: ID; isPrivate: boolean }> {
        const slug = categorySlug(parentErpId);
        const found = await this.collectionService.findOneBySlug(ctx, slug);
        if (found) return { id: found.id, isPrivate: found.isPrivate };
        const created = await this.collectionService.create(ctx, {
            isPrivate: true,
            customFields: { feedHidden: true },
            translations: [
                { languageCode: LanguageCode.en, name: parentErpId, slug, description: '' },
            ],
            filters: [],
        });
        return { id: created.id, isPrivate: true };
    }
}
