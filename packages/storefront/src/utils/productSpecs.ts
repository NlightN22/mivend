interface SpecFacetValue {
    name: string;
    facet: { code: string; name: string };
}

const SHOWN_ELSEWHERE = new Set(['category', 'brand']);

export function facetSpecs(facetValues: SpecFacetValue[]): { label: string; value: string }[] {
    const byFacet = new Map<string, string[]>();
    for (const fv of facetValues) {
        if (SHOWN_ELSEWHERE.has(fv.facet.code)) continue;
        byFacet.set(fv.facet.name, [...(byFacet.get(fv.facet.name) ?? []), fv.name]);
    }
    return [...byFacet].map(([label, values]) => ({ label, value: values.join(', ') }));
}
