import {
    Collection,
    CollectionService,
    FacetService,
    FacetValueService,
    LanguageCode,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import { withAggregateLock } from './aggregate-lock';
import {
    CATEGORY_FACET_CODE,
    CategoryCollectionNode,
    buildCategoryFacetFilter,
    categoryErpIdFromSlug,
    parseFacetValueIds,
    planCategoryFilterUpdates,
    planCategoryVisibilityUpdates,
} from './categoryCollectionFilter';

export interface CategoryTreeRecomputeDeps {
    connection: TransactionalConnection;
    collectionService: CollectionService;
    facetService: FacetService;
    facetValueService: FacetValueService;
}

interface CategoryCustomFields {
    feedHidden?: boolean;
    visibilityOverride?: string | null;
}

export const CATEGORY_TREE_LOCK = 'category-tree';
// Waiters hold a pool connection, so they give up fast and the caller retries (docs/category-hierarchy.md).
export const CATEGORY_TREE_LOCK_WAIT_MS = 60_000;
export const CATEGORY_TREE_LOCK_IDLE_MS = 60_000;
export const CATEGORY_TREE_LOCK_SLOW_HOLD_MS = 60_000;
export const CATEGORY_TREE_LOCK_OPTIONS = {
    lockTimeoutMs: CATEGORY_TREE_LOCK_WAIT_MS,
    idleTimeoutMs: CATEGORY_TREE_LOCK_IDLE_MS,
    slowHoldWarnMs: CATEGORY_TREE_LOCK_SLOW_HOLD_MS,
};

// Rewrites each category Collection's filter to "any FacetValue in its subtree" and propagates
// hidden state down the tree; writes only what changed. Returns the number of writes.
export function recomputeCategoryTree(
    ctx: RequestContext,
    deps: CategoryTreeRecomputeDeps,
): Promise<number> {
    return withAggregateLock(
        deps.connection,
        ctx,
        CATEGORY_TREE_LOCK,
        txCtx => recomputeLocked(txCtx, deps),
        CATEGORY_TREE_LOCK_OPTIONS,
    );
}

async function recomputeLocked(
    ctx: RequestContext,
    deps: CategoryTreeRecomputeDeps,
): Promise<number> {
    const facet = await deps.facetService.findByCode(ctx, CATEGORY_FACET_CODE, LanguageCode.en);
    if (!facet) return 0;
    const facetValues = await deps.facetValueService.findByFacetId(ctx, facet.id);
    const facetValueIdByCode = new Map(facetValues.map(v => [v.code, String(v.id)]));

    const collections = await deps.connection
        .getRepository(ctx, Collection)
        .find({ relations: ['translations'] });
    // Vendure's update inserts a new row instead of updating without `translations` and a native id.
    const nativeIdByString = new Map(collections.map(c => [String(c.id), c.id]));
    const translationsById = new Map(
        collections.map(c => [
            String(c.id),
            c.translations.map(t => ({
                languageCode: t.languageCode,
                name: t.name,
                slug: t.slug,
                description: t.description,
            })),
        ]),
    );
    const customFields = (c: Collection): CategoryCustomFields =>
        (c.customFields ?? {}) as CategoryCustomFields;
    const nodes: CategoryCollectionNode[] = collections.map(c => ({
        id: String(c.id),
        parentId: c.parentId == null ? null : String(c.parentId),
        slug: c.translations[0]?.slug ?? '',
        filterFacetValueIds: parseFacetValueIds(c.filters ?? []),
    }));

    const filterUpdates = planCategoryFilterUpdates(nodes, facetValueIdByCode);
    for (const update of filterUpdates) {
        await deps.collectionService.update(ctx, {
            id: nativeIdByString.get(update.id)!,
            translations: translationsById.get(update.id),
            filters: buildCategoryFacetFilter(update.facetValueIds),
        });
    }

    // A category with no FacetValue of its own is a placeholder and always hidden.
    const isPlaceholder = (slug: string): boolean => {
        const code = categoryErpIdFromSlug(slug);
        return code !== undefined && !facetValueIdByCode.has(code);
    };
    const visibilityUpdates = planCategoryVisibilityUpdates(
        collections.map(c => ({
            id: String(c.id),
            parentId: c.parentId == null ? null : String(c.parentId),
            slug: c.translations[0]?.slug ?? '',
            feedHidden:
                customFields(c).feedHidden === true || isPlaceholder(c.translations[0]?.slug ?? ''),
            visibilityOverride: customFields(c).visibilityOverride ?? null,
            isPrivate: c.isPrivate,
        })),
    );
    for (const update of visibilityUpdates) {
        await deps.collectionService.update(ctx, {
            id: nativeIdByString.get(update.id)!,
            translations: translationsById.get(update.id),
            isPrivate: update.isPrivate,
        });
    }
    return filterUpdates.length + visibilityUpdates.length;
}
