export interface StatusFilter {
    key: string;
    labelKey: string | null;
    label: string;
    groups: string[] | null;
    excludeFinal?: boolean;
}

export const DEFAULT_STATUS = 'active';
export const DEFAULT_SOURCE = 'mivend';

export interface StatusGroup {
    key: string;
    label: string;
}

const ACTIVE_FILTER: StatusFilter = {
    key: 'active',
    labelKey: 'orders.filters.active',
    label: 'active',
    groups: null,
    excludeFinal: true,
};
const ALL_FILTER: StatusFilter = {
    key: 'all',
    labelKey: 'orders.filters.all',
    label: 'all',
    groups: null,
};

const camelCase = (key: string): string => key.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

// One tab per dictionary group, in dictionary order; its label is the i18n entry when present.
export function buildStatusFilters(presentGroups: StatusGroup[]): StatusFilter[] {
    const tabs = presentGroups.map(g => ({
        key: g.key,
        labelKey: `orders.filters.${camelCase(g.key)}`,
        label: g.label,
        groups: [g.key],
    }));
    return [ACTIVE_FILTER, ...tabs, ALL_FILTER];
}

export const SOURCE_FILTERS = [
    { key: 'mivend', labelKey: 'orders.sources.mivend', isExternal: false },
    { key: 'erp', labelKey: 'orders.sources.erp', isExternal: true },
    { key: 'all', labelKey: 'orders.sources.all', isExternal: undefined },
];

export function resolveStatusFilter(filters: StatusFilter[], key: string): StatusFilter {
    return filters.find(f => f.key === key) ?? ACTIVE_FILTER;
}

export function sourceIsExternal(key: string): boolean | undefined {
    return SOURCE_FILTERS.find(f => f.key === key)?.isExternal;
}
