import { ALL_PRODUCTS_SCOPE } from './discount-limit-scope';

export interface LimitRow {
    scopeKind: string;
    scopeRef: string;
    maxDiscountPercent: number;
}

// The deepest matching percent wins; no matching row = 0%, so a manual deepening always needs approval.
export function resolveCeiling(
    rows: readonly LimitRow[],
    refsByKind: ReadonlyMap<string, ReadonlySet<string>>,
): number {
    let best = 0;
    for (const row of rows) {
        const matches =
            row.scopeKind === ALL_PRODUCTS_SCOPE ||
            !!refsByKind.get(row.scopeKind)?.has(row.scopeRef);
        if (matches && row.maxDiscountPercent > best) best = row.maxDiscountPercent;
    }
    return best;
}
