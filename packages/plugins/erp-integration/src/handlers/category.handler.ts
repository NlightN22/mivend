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

        const facet = await this.ensureCategoryFacet(ctx);
        const existingFacetValue = await this.findFacetValue(ctx, facet, entityId);
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
        await this.ensureCollection(ctx, entityId, name, String(facetValue.id), isPrivate);
    }

    // A non-null visibilityOverride (issue #90) is a manual decision that must survive the next
    // feed recompute — it wins over isActive/isDeleted on every update, never on the create path
    // (a category seen for the first time has no override to read yet, so the feed applies
    // unchanged, matching the acceptance criteria's no-regression requirement).
    private resolveIsPrivate(
        feedIsPrivate: boolean,
        existing: { customFields?: { visibilityOverride?: string | null } } | undefined,
    ): boolean {
        const override = existing?.customFields?.visibilityOverride;
        if (override === 'hidden') return true;
        if (override === 'visible') return false;
        return feedIsPrivate;
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

    private async findFacetValue(
        ctx: RequestContext,
        facet: { id: string | number },
        entityId: string,
    ): Promise<FacetValue | undefined> {
        const all = await this.facetValueService.findByFacetId(ctx, facet.id);
        return all.find(v => v.code === entityId);
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

    private async ensureCollection(
        ctx: RequestContext,
        entityId: string,
        name: string | null,
        facetValueId: string,
        isPrivate: boolean,
    ): Promise<void> {
        const slug = `cat-${entityId}`;
        const existing = await this.collectionService.findOneBySlug(ctx, slug);
        if (!existing && !name) {
            Logger.warn(
                `category ${entityId}: missing name and no existing collection, skipping`,
                loggerCtx,
            );
            return;
        }
        const resolvedIsPrivate = this.resolveIsPrivate(isPrivate, existing as never);
        const resolvedName = name ?? existing!.name;
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
                isPrivate: resolvedIsPrivate,
                translations: [
                    { languageCode: LanguageCode.en, name: resolvedName, slug, description: '' },
                ],
                filters,
            });
            return;
        }
        await this.collectionService.create(ctx, {
            isPrivate: resolvedIsPrivate,
            translations: [
                { languageCode: LanguageCode.en, name: resolvedName, slug, description: '' },
            ],
            filters,
        });
    }
}
