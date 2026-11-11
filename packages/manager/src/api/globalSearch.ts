import { adminApi } from './client';
import { GlobalSearchDocument, type GlobalSearchQuery } from './generated/graphql';

export type SearchGroup = GlobalSearchQuery['globalSearch'][number];
export type SearchHit = SearchGroup['items'][number];

export const GLOBAL_SEARCH_LIMIT_PER_KIND = 5;

export async function fetchGlobalSearch(term: string): Promise<SearchGroup[]> {
    const result = await adminApi(GlobalSearchDocument, {
        term,
        limitPerKind: GLOBAL_SEARCH_LIMIT_PER_KIND,
    });
    return result.globalSearch;
}
