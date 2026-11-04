export interface SearchWithCodeMatches<T> {
    items: T[];
    skuMatches?: { items: T[] } | null;
}

// An exact article lands in skuMatches, not in the full-text items (#307).
export function hitsOf<T>(search: SearchWithCodeMatches<T>): T[] {
    return [...(search.skuMatches?.items ?? []), ...search.items];
}
