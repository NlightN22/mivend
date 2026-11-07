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
    CategoryFilterUpdate,
    CategoryVisibilityUpdate,
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

// Rewrites each category filter to its subtree's FacetValues and propagates hidden state; one
// lock per top-level subtree with writes (docs/category-hierarchy.md). Returns the writes made.
export async function recomputeCategoryTree(
    ctx: RequestContext,
    deps: CategoryTreeRecomputeDeps,
): Promise<number> {
    const unlocked = await planTree(ctx, deps);
    if (!unlocked) return 0;
    const nodeById = new Map(unlocked.nodes.map(n => [n.id, n]));
    const chunkRoots = [
        ...new Set(
            [...unlocked.filterUpdates, ...unlocked.visibilityUpdates].map(u =>
                topLevelRoot(u.id, nodeById),
            ),
        ),
    ];

    let writes = 0;
    for (const rootId of chunkRoots) {
        writes += await withAggregateLock(
            deps.connection,
            ctx,
            CATEGORY_TREE_LOCK,
            txCtx => recomputeLocked(txCtx, deps, rootId),
            CATEGORY_TREE_LOCK_OPTIONS,
        );
    }
    return writes;
}

async function recomputeLocked(
    ctx: RequestContext,
    deps: CategoryTreeRecomputeDeps,
    chunkRootId: string,
): Promise<number> {
    const plan = await planTree(ctx, deps);
    if (!plan) return 0;
    const { nodes, nativeIdByString, translationsById } = plan;
    const chunk = subtreeIds(chunkRootId, nodes);
    const filterUpdates = plan.filterUpdates.filter(u => chunk.has(u.id));
    const visibilityUpdates = plan.visibilityUpdates.filter(u => chunk.has(u.id));
    for (const update of filterUpdates) {
        await deps.collectionService.update(ctx, {
            id: nativeIdByString.get(update.id)!,
            translations: translationsById.get(update.id),
            filters: buildCategoryFacetFilter(update.facetValueIds),
        });
    }

    for (const update of visibilityUpdates) {
        await deps.collectionService.update(ctx, {
            id: nativeIdByString.get(update.id)!,
            translations: translationsById.get(update.id),
            isPrivate: update.isPrivate,
        });
    }
    return filterUpdates.length + visibilityUpdates.length;
}

interface TreePlan {
    nodes: CategoryCollectionNode[];
    nativeIdByString: Map<string, Collection['id']>;
    translationsById: Map<
        string,
        NonNullable<Parameters<CollectionService['update']>[1]['translations']>
    >;
    filterUpdates: CategoryFilterUpdate[];
    visibilityUpdates: CategoryVisibilityUpdate[];
}

async function planTree(
    ctx: RequestContext,
    deps: CategoryTreeRecomputeDeps,
): Promise<TreePlan | null> {
    const facet = await deps.facetService.findByCode(ctx, CATEGORY_FACET_CODE, LanguageCode.en);
    if (!facet) return null;
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
    return { nodes, nativeIdByString, translationsById, filterUpdates, visibilityUpdates };
}

function topLevelRoot(id: string, byId: ReadonlyMap<string, CategoryCollectionNode>): string {
    let current = id;
    const seen = new Set<string>([id]);
    for (;;) {
        const parent = byId.get(current)?.parentId;
        if (parent == null || seen.has(parent)) return current;
        const parentSlug = byId.get(parent)?.slug ?? '';
        if (categoryErpIdFromSlug(parentSlug) === undefined) return current;
        seen.add(parent);
        current = parent;
    }
}

function subtreeIds(rootId: string, nodes: CategoryCollectionNode[]): Set<string> {
    const childrenByParent = new Map<string, string[]>();
    for (const n of nodes) {
        if (n.parentId === null) continue;
        childrenByParent.set(n.parentId, [...(childrenByParent.get(n.parentId) ?? []), n.id]);
    }
    const seen = new Set<string>([rootId]);
    const stack = [rootId];
    while (stack.length > 0) {
        for (const child of childrenByParent.get(stack.pop()!) ?? []) {
            if (!seen.has(child)) {
                seen.add(child);
                stack.push(child);
            }
        }
    }
    return seen;
}
