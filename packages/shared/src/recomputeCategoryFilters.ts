import {
    Collection,
    CollectionService,
    FacetService,
    FacetValueService,
    LanguageCode,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';

import {
    CATEGORY_FACET_CODE,
    CategoryCollectionNode,
    buildCategoryFacetFilter,
    parseFacetValueIds,
    planCategoryFilterUpdates,
} from './categoryCollectionFilter';

export interface CategoryFilterRecomputeDeps {
    connection: TransactionalConnection;
    collectionService: CollectionService;
    facetService: FacetService;
    facetValueService: FacetValueService;
}

// Rewrites each category Collection's filter to "any FacetValue in its subtree"; writes only
// where the id set changed. Returns the number of Collections updated.
export async function recomputeCategoryFilters(
    ctx: RequestContext,
    deps: CategoryFilterRecomputeDeps,
): Promise<number> {
    const facet = await deps.facetService.findByCode(ctx, CATEGORY_FACET_CODE, LanguageCode.en);
    if (!facet) return 0;
    const facetValues = await deps.facetValueService.findByFacetId(ctx, facet.id);
    const facetValueIdByCode = new Map(facetValues.map(v => [v.code, String(v.id)]));

    const collections = await deps.connection
        .getRepository(ctx, Collection)
        .find({ relations: ['translations'] });
    const nodes: CategoryCollectionNode[] = collections.map(c => ({
        id: String(c.id),
        parentId: c.parentId == null ? null : String(c.parentId),
        slug: c.translations[0]?.slug ?? '',
        filterFacetValueIds: parseFacetValueIds(c.filters ?? []),
    }));

    const updates = planCategoryFilterUpdates(nodes, facetValueIdByCode);
    for (const update of updates) {
        await deps.collectionService.update(ctx, {
            id: update.id,
            filters: buildCategoryFacetFilter(update.facetValueIds),
        });
    }
    return updates.length;
}
