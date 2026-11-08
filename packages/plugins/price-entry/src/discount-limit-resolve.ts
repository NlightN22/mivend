import { ALL_PRODUCTS_SCOPE } from './discount-limit-scope';

export interface LimitRow {
    scopeKind: string;
    scopeRef: string;
    maxDiscountPercent: number;
}

// The deepest matching percent wins; no matching row = no limit (null).
export function resolveCeiling(
    rows: readonly LimitRow[],
    refsByKind: ReadonlyMap<string, ReadonlySet<string>>,
): number | null {
    let best: number | null = null;
    for (const row of rows) {
        const matches =
            row.scopeKind === ALL_PRODUCTS_SCOPE ||
            !!refsByKind.get(row.scopeKind)?.has(row.scopeRef);
        if (matches && (best === null || row.maxDiscountPercent > best))
            best = row.maxDiscountPercent;
    }
    return best;
}
