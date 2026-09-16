// Pure resolution of a product's `category_id` (ProductChanged) to the 'category' facet's
// FacetValue id, plus an optional non-blocking review flag — same shape as vat-code-resolver.ts
// (issue #79's precedent). No I/O here; the caller (ProductStreamHandler) looks up the facet
// value map beforehand.
//
// Deliberately NOT routed through MissingDependencyError's retry-with-backoff path (see
// external-integration-rules skill / types.ts) even though "category not synced yet" is exactly
// the cross-topic-ordering race that error exists for — issue #116's own explicit decision:
// category resolution must never block product creation, and a later ProductChanged event (or a
// manual resync) is what corrects it, not a blocking retry loop.

export type CategoryFlagReason = 'absent' | 'not-found';

export interface CategoryFlag {
    reason: CategoryFlagReason;
    detail: string;
}

export interface CategoryResolution {
    facetValueId?: string;
    flag?: CategoryFlag;
}

export function resolveCategoryFacetValueId(
    categoryId: string | undefined,
    facetValueIdByCategoryCode: ReadonlyMap<string, string>,
): CategoryResolution {
    if (!categoryId) {
        return {
            flag: { reason: 'absent', detail: 'No category_id on product, review' },
        };
    }

    const facetValueId = facetValueIdByCategoryCode.get(categoryId);
    if (!facetValueId) {
        return {
            flag: {
                reason: 'not-found',
                detail: `Category '${categoryId}' not synced yet (or unknown), review`,
            },
        };
    }

    return { facetValueId };
}
