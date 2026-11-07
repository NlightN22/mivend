export interface LimitRow {
    roleCode: string;
    groupRef: string;
    maxDiscountPercent: number;
}

// Per role a group row beats the all-products row; across roles the most permissive wins. No row = no limit (null).
export function resolveCeiling(
    rows: readonly LimitRow[],
    roleCodes: readonly string[],
    groupRefs: ReadonlySet<string>,
): number | null {
    let best: number | null = null;
    for (const role of roleCodes) {
        const own = rows.filter(r => r.roleCode === role);
        const grouped = own.filter(r => r.groupRef !== '' && groupRefs.has(r.groupRef));
        const pool = grouped.length > 0 ? grouped : own.filter(r => r.groupRef === '');
        for (const row of pool) {
            if (best === null || row.maxDiscountPercent > best) best = row.maxDiscountPercent;
        }
    }
    return best;
}
