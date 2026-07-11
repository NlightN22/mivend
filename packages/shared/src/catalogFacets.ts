export interface FacetGroup {
    code: string;
    name: string;
    values: { id: string; code: string; name: string; count: number }[];
}

export interface FacetValue {
    id: string;
    code: string;
    name: string;
    facet: { code: string; name: string };
}

export interface EsFacetValueResult {
    facetValue: FacetValue;
    count: number;
}

// Values from the same facet group → OR (Castrol OR Lukoil)
// Values from different facet groups → AND (brand=Castrol AND category=Engine Oils)
export function buildFacetValueFilters(
    ids: string[],
    facetGroups: FacetGroup[],
): { or: string[] }[] {
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    const groups: string[][] = [];
    const covered = new Set<string>();
    for (const group of facetGroups) {
        const groupIds = group.values.map(v => v.id).filter(id => idSet.has(id));
        if (groupIds.length > 0) {
            groups.push(groupIds);
            groupIds.forEach(id => covered.add(id));
        }
    }
    const uncovered = ids.filter(id => !covered.has(id));
    if (uncovered.length > 0) groups.push(uncovered);
    return groups.map(g => ({ or: g }));
}

export function buildFacetGroups(facetValues: EsFacetValueResult[]): FacetGroup[] {
    const groupMap = new Map<string, FacetGroup>();
    for (const { facetValue, count } of facetValues) {
        const { code, name } = facetValue.facet;
        if (!groupMap.has(code)) groupMap.set(code, { code, name, values: [] });
        groupMap.get(code)!.values.push({
            id: facetValue.id,
            code: facetValue.code,
            name: facetValue.name,
            count,
        });
    }
    return [...groupMap.values()].map(g => ({
        ...g,
        values: g.values.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
