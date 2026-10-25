// proto3 JSON omits empty lists and default values; the two selection modes are the contract's closed pair.
export function parseSelectionMode(value: unknown): 'list' | 'filter' | null {
    return value === 'list' || value === 'filter' ? value : null;
}

export function parseSelectionFilter(value: unknown): unknown[] | null {
    return Array.isArray(value) && value.length > 0 ? value : null;
}

export function stringList(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String) : [];
}
