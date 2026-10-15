// Not via MissingDependencyError retry: a missing category must never block product creation.
// A later ProductChanged event or a manual resync corrects it, not a blocking retry loop.
import type { ID } from '@vendure/common/lib/shared-types';

export type CategoryFlagReason = 'absent' | 'not-found';

export interface CategoryFlag {
    reason: CategoryFlagReason;
    detail: string;
}

export interface CategoryResolution {
    facetValueId?: ID;
    flag?: CategoryFlag;
}

export function resolveCategoryFacetValueId(
    categoryId: string | undefined,
    facetValueIdByCategoryCode: ReadonlyMap<string, ID>,
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
