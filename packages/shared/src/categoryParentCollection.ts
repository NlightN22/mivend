import { Collection, CollectionService, ID, LanguageCode, RequestContext } from '@vendure/core';

import { categorySlug } from './categoryCollectionFilter';

// A child can arrive before its parent: park it under a private placeholder that the parent's
// own event later fills in, instead of waiting or flattening under the root.
export async function ensureParentCategoryCollection(
    ctx: RequestContext,
    collectionService: CollectionService,
    parentErpId: string,
): Promise<{ id: ID; isPrivate: boolean }> {
    const slug = categorySlug(parentErpId);
    const found = await collectionService.findOneBySlug(ctx, slug);
    if (found) return { id: found.id, isPrivate: found.isPrivate };
    const created = await collectionService.create(ctx, {
        isPrivate: true,
        customFields: { feedHidden: true },
        translations: [{ languageCode: LanguageCode.en, name: parentErpId, slug, description: '' }],
        filters: [],
    });
    return { id: created.id, isPrivate: true };
}

// `desiredParentId` undefined means top level (child of the root Collection).
export async function moveCategoryIfParentChanged(
    ctx: RequestContext,
    collectionService: CollectionService,
    existing: Collection,
    desiredParentId: ID | undefined,
): Promise<void> {
    const breadcrumbs = await collectionService.getBreadcrumbs(ctx, existing);
    const currentParentId = breadcrumbs[breadcrumbs.length - 2]?.id;
    const targetParentId = desiredParentId ?? breadcrumbs[0]?.id;
    if (targetParentId === undefined || String(currentParentId) === String(targetParentId)) return;
    await collectionService.move(ctx, {
        collectionId: existing.id,
        parentId: targetParentId,
        index: 0,
    });
}
