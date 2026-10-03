import { adminApi } from './client';
import { fetchAllCollections } from '../../../shared/src/collectionTree';
import {
    CategoryVisibilityCollectionsDocument,
    SetCategoryVisibilityOverrideDocument,
    type CategoryCollectionFieldsFragment,
} from './generated/graphql';

export type CategoryVisibilityCollection = CategoryCollectionFieldsFragment;

export async function fetchCategoryVisibilityCollections(): Promise<
    CategoryVisibilityCollection[]
> {
    return fetchAllCollections(async (skip, take) => {
        const result = await adminApi(CategoryVisibilityCollectionsDocument, { skip, take });
        return result.collections;
    });
}

export type HiddenReason = 'Manual override' | 'Hidden ancestor' | 'Own feed' | '';

export interface CategoryVisibilityInfo {
    depth: number;
    parentName: string;
    hiddenReason: HiddenReason;
}

// `feedHidden` is internal (not readable via the API), so "own feed" is inferred: hidden with
// a visible (or absent) parent. Depth 1 = top level; the root Collection is breadcrumbs[0].
export function describeCategoryVisibility(
    collections: CategoryVisibilityCollection[],
): Map<string, CategoryVisibilityInfo> {
    const byId = new Map(collections.map(c => [c.id, c]));
    const info = new Map<string, CategoryVisibilityInfo>();
    for (const c of collections) {
        const crumbs = c.breadcrumbs ?? [];
        const parentCrumb = crumbs.length > 2 ? crumbs[crumbs.length - 2] : null;
        const parent = parentCrumb ? byId.get(parentCrumb.id) : undefined;
        const override = c.customFields?.visibilityOverride;
        let hiddenReason: HiddenReason = '';
        if (c.isPrivate) {
            if (override === 'hidden') hiddenReason = 'Manual override';
            else hiddenReason = parent?.isPrivate ? 'Hidden ancestor' : 'Own feed';
        }
        info.set(c.id, {
            depth: Math.max(crumbs.length - 1, 1),
            parentName: parentCrumb?.name ?? '',
            hiddenReason,
        });
    }
    return info;
}

// null clears the override. The server recomputes the category tree after any override change
// (CategoryOverrideRecomputeListener), so descendants and a cleared override resolve there;
// isPrivate is also sent for 'hidden'/'visible' so the returned row is already correct (#90).
export async function setCategoryVisibilityOverride(
    id: string,
    visibilityOverride: string | null,
): Promise<CategoryVisibilityCollection> {
    // Collection.isPrivate is a non-nullable boolean column — Vendure's patchEntity treats an
    // explicit `null` variable as "set this field to null" (distinct from `undefined`, which it
    // leaves untouched), so clearing the override (visibilityOverride: null) must OMIT isPrivate
    // from the variables entirely rather than send null, or the save fails against the non-
    // nullable column instead of leaving isPrivate alone for the next feed event to set.
    const isPrivate =
        visibilityOverride === 'hidden'
            ? true
            : visibilityOverride === 'visible'
              ? false
              : undefined;
    const result = await adminApi(SetCategoryVisibilityOverrideDocument, {
        id,
        visibilityOverride,
        ...(isPrivate === undefined ? {} : { isPrivate }),
    });
    return result.updateCollection;
}
