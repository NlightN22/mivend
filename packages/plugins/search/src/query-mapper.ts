import type { SearchInput } from '@vendure/common/lib/generated-types';

export interface ResolveQueryRequest {
    query: string;
    limit?: number;
    offset?: number;
    availableOnly?: boolean;
}

// Pure mapping, unit-tested in isolation — Vendure's SearchInput.term/take/skip to
// search-service's POST /resolve-query request shape (query/limit/offset). See issue #69.
export function mapSearchInputToResolveQueryRequest(input: SearchInput): ResolveQueryRequest {
    return {
        query: input.term ?? '',
        limit: input.take ?? undefined,
        offset: input.skip ?? undefined,
    };
}
