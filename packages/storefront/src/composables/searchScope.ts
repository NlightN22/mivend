import { findCategoryPath, type CollectionNode } from '../../../shared/src/collectionTree';

export interface SearchLocation {
    path: string;
    query: Record<string, string>;
}

export function buildSearchLocation(
    term: string,
    collectionSlug: string | undefined,
): SearchLocation {
    const query: Record<string, string> = {};
    if (term) query.q = term;
    if (collectionSlug) query.collection = collectionSlug;
    return { path: '/catalog', query };
}

// Emptying the field must drop the term from the URL, or later navigation (e.g. picking a
// category) re-applies the stale query. Null = nothing to do.
export function clearedSearchLocation(
    inputValue: string,
    urlTerm: string | undefined,
    collectionSlug: string | undefined,
): SearchLocation | null {
    if (inputValue || !urlTerm) return null;
    return buildSearchLocation('', collectionSlug);
}

export function resolveScopeLabel(
    collections: CollectionNode[],
    slug: string | undefined,
): string | undefined {
    if (!slug) return undefined;
    return findCategoryPath(collections, slug).at(-1)?.name;
}
