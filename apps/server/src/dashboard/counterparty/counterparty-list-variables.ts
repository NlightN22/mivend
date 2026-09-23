export interface CounterpartyListFilterInput {
    search?: string;
    status?: 'active' | 'inactive';
    managerErpId?: string;
}

interface ListPageFilter {
    __search?: string;
    _and?: Array<Record<string, unknown>>;
}

// ListPage sends faceted filters as arrays, Boolean facets as `{ eq }` and the funnel text filter
// as `{ contains }` — CounterpartyListOptions takes plain scalars, so all three are unwrapped.
function unwrapFacet(filter: ListPageFilter | undefined, id: string): unknown {
    const raw = filter?._and?.find(f => id in f)?.[id];
    if (Array.isArray(raw)) return raw[0];
    if (raw && typeof raw === 'object') {
        if ('eq' in raw) return (raw as { eq: unknown }).eq;
        if ('contains' in raw) return (raw as { contains: unknown }).contains;
    }
    return raw;
}

export function toCounterpartyListFilter(
    filter: ListPageFilter | undefined,
): CounterpartyListFilterInput {
    const status = unwrapFacet(filter, 'isActive') as 'active' | 'inactive' | undefined;
    const managerErpId = unwrapFacet(filter, 'managerErpId') as string | undefined;
    return {
        search: filter?.__search || undefined,
        status: status || undefined,
        managerErpId: managerErpId || undefined,
    };
}

// Offered only once the whole visible page is selected and the filter matches more than that.
export function shouldOfferAllMatching(
    allPageRowsSelected: boolean,
    selectedCount: number,
    totalMatching: number,
): boolean {
    return allPageRowsSelected && totalMatching > selectedCount;
}
