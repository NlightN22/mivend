import { Logger } from '@vendure/core';
import type { SearchInput } from '@vendure/common/lib/generated-types';

import { loggerCtx } from './types';

export interface ResolveQueryRequest {
    query: string;
    limit?: number;
    offset?: number;
    availableOnly?: boolean;
}

export interface MapSearchInputResult {
    request: ResolveQueryRequest;
    // True when the incoming SearchInput carried a collection/facet-value/sort field that
    // search-service cannot honor and that was therefore dropped rather than sent. The caller
    // (ExternalSearchService) surfaces this so a category/faceted-filter page degrades to an
    // unfiltered free-text result instead of hard-failing the whole request — see the
    // audit-history note below for why this is a deliberate degrade, not a silent drop.
    unsupportedFiltersDropped: boolean;
}

// search-service's POST /resolve-query has no concept of collection/facet-value filtering or
// sorting (issue #69 — it's a free-text discovery endpoint only: query/limit/offset/
// availableOnly).
//
// Audit history (mivend.audit.70), both real findings, in tension with each other:
//   - round 1/2: silently dropping these fields returns an unfiltered global result set instead
//     of the expected filtered one — flagged as a correctness gap.
//   - round 3: throwing on them (this file's first fix) turns that into a hard, unhandled
//     shop-api error the instant any real storefront visitor applies a facet filter under
//     SEARCH_BACKEND=external — a production availability regression, worse than the original gap,
//     since useProductList.ts sends facetValueFilters on every catalog request once any filter is
//     selected and neither the resolver nor the storefront currently has a fallback path for that.
// Resolution: degrade, don't crash — drop the unsupported fields and run a plain free-text
// query, but log loudly server-side (Logger.warn) every time this happens so the gap stays
// visible to operators/monitoring instead of being silently invisible again. Storefront
// category/faceted-filter browsing against the external backend still needs its own follow-up
// design (hiding/disabling those controls under SEARCH_BACKEND=external, or a future
// search-service capability) — this is a stopgap that keeps the endpoint available, not a fix
// for the underlying feature gap.
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

// Vendure's SearchInput.term/take/skip -> search-service's POST /resolve-query request shape
// (query/limit/offset). See issue #69.
export function mapSearchInputToResolveQueryRequest(input: SearchInput): MapSearchInputResult {
    const unsupportedFiltersDropped = hasUnsupportedFilter(input);
    if (unsupportedFiltersDropped) {
        Logger.warn(
            'search-service (SEARCH_BACKEND=external) does not support collection/facet ' +
                'filtering or sorting — ignoring these SearchInput fields and running a plain ' +
                'free-text query instead. See issue #69/mivend.audit.70, query-mapper.ts.',
            loggerCtx,
        );
    }

    return {
        request: {
            query: input.term ?? '',
            limit: input.take ?? undefined,
            offset: input.skip ?? undefined,
        },
        unsupportedFiltersDropped,
    };
}
