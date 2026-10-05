import type { FacetGroup } from '../../../shared/src/catalogFacets';

const COUNT_ORDERED_FACETS = new Set(['manufacturer']);

export function orderFacetGroups(groups: FacetGroup[]): FacetGroup[] {
    return groups.map(group =>
        COUNT_ORDERED_FACETS.has(group.code)
            ? {
                  ...group,
                  values: [...group.values].sort(
                      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
                  ),
              }
            : group,
    );
}
