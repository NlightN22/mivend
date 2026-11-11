// Filters with the URL's search applied, or null when it already matches (stops URL <-> state loops).
export function withUrlSearch<T extends { search: string }>(
    filters: T,
    urlSearch: unknown,
): T | null {
    const search = typeof urlSearch === 'string' ? urlSearch : '';
    return search === filters.search ? null : { ...filters, search };
}
