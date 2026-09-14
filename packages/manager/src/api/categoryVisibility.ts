import { adminApi } from './client';
import {
    CategoryVisibilityCollectionsDocument,
    SetCategoryVisibilityOverrideDocument,
    type CategoryCollectionFieldsFragment,
} from './generated/graphql';

export type CategoryVisibilityCollection = CategoryCollectionFieldsFragment;

export async function fetchCategoryVisibilityCollections(): Promise<
    CategoryVisibilityCollection[]
> {
    const result = await adminApi(CategoryVisibilityCollectionsDocument);
    return result.collections.items;
}

// visibilityOverride: null clears the override (back to Auto/feed-driven — the next Kafka
// category event recomputes isPrivate from the feed, but nothing changes it immediately here),
// 'hidden'/'visible' forces it AND applies isPrivate right away (mirrors
// CategoryStreamHandler.resolveIsPrivate so setting an override doesn't wait for the next feed
// event to take visible effect). See Collection.customFields.visibilityOverride in
// apps/server/vendure-config.ts (issue #90).
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
