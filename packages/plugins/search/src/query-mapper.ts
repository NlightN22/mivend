import type { SearchInput } from '@vendure/common/lib/generated-types';

export interface ResolveQueryRequest {
    query: string;
    limit?: number;
    offset?: number;
    availableOnly?: boolean;
}

// search-service's POST /resolve-query has no concept of collection/facet-value filtering or
// sorting (issue #69 — it's a free-text discovery endpoint only: query/limit/offset/
// availableOnly). Silently dropping these SearchInput fields would make a category or
// faceted-filter page return an unfiltered global result set under SEARCH_BACKEND=external
// (audit finding, mivend.audit.70) — fail loud instead, so this surfaces during
// integration/testing rather than as silently wrong search results in production. Storefront
// category/facet browsing against the external backend needs its own follow-up design, not a
// silent no-op here.
function hasUnsupportedFilter(input: SearchInput): boolean {
    return Boolean(
        input.collectionId ||
        (input.collectionIds && input.collectionIds.length > 0) ||
        input.collectionSlug ||
        (input.collectionSlugs && input.collectionSlugs.length > 0) ||
        (input.facetValueFilters && input.facetValueFilters.length > 0) ||
        (input.facetValueIds && input.facetValueIds.length > 0) ||
        input.groupByProduct ||
        input.sort,
    );
}

// Pure mapping, unit-tested in isolation — Vendure's SearchInput.term/take/skip to
// search-service's POST /resolve-query request shape (query/limit/offset). See issue #69.
export function mapSearchInputToResolveQueryRequest(input: SearchInput): ResolveQueryRequest {
    if (hasUnsupportedFilter(input)) {
        throw new Error(
            'search-service (SEARCH_BACKEND=external) does not support collection/facet ' +
                'filtering or sorting — this SearchInput field is not honored by the external ' +
                'search backend. See issue #69/query-mapper.ts.',
        );
    }

    return {
        query: input.term ?? '',
        limit: input.take ?? undefined,
        offset: input.skip ?? undefined,
    };
}
