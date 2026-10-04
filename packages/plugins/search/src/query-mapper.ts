import { Logger } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import type { ResolvedSearchFilters } from './search-filter-resolver.service';
import { loggerCtx } from './types';

export interface ResolveQueryRequest {
    query: string;
    categoryId?: string;
    filters?: { manufacturer: string[] };
    sort?: 'relevance' | 'name';
    limit?: number;
    offset?: number;
    availableOnly?: boolean;
}

export function hasBrowseCriteria(request: ResolveQueryRequest): boolean {
    return Boolean(request.query || request.categoryId || request.filters?.manufacturer.length);
}

// search-service has no price sort (prices are per-customer, resolved in mivend) and no
// descending name sort; those degrade to relevance with a warning.
function mapSort(input: SearchInput): 'relevance' | 'name' {
    if (input.sort?.name === 'ASC') return 'name';
    if (input.sort && Object.keys(input.sort).length > 0) {
        Logger.warn('unsupported search sort ignored, using relevance', loggerCtx);
    }
    return 'relevance';
}

export function mapSearchInputToResolveQueryRequest(
    input: SearchInput,
    resolved: ResolvedSearchFilters,
): ResolveQueryRequest {
    return {
        query: input.term ?? '',
        ...(resolved.categoryId ? { categoryId: resolved.categoryId } : {}),
        ...(resolved.manufacturer.length > 0
            ? { filters: { manufacturer: resolved.manufacturer } }
            : {}),
        sort: mapSort(input),
        limit: input.take ?? undefined,
        offset: input.skip ?? undefined,
    };
}
