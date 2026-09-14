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
    const isPrivate =
        visibilityOverride === 'hidden' ? true : visibilityOverride === 'visible' ? false : null;
    const result = await adminApi(SetCategoryVisibilityOverrideDocument, {
        id,
        visibilityOverride,
        isPrivate,
    });
    return result.updateCollection;
}
