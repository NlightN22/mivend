export interface StatusFilter {
    key: string;
    labelKey: string | null;
    label: string;
    groups: string[] | null;
    excludeGroups?: string[];
}

export const DEFAULT_STATUS = 'active';
export const DEFAULT_SOURCE = 'mivend';

const FINAL_GROUPS = ['delivered', 'cancelled'];
const GROUP_LABEL_KEYS: Record<string, string> = {
    pending: 'orders.filters.pending',
    confirmed: 'orders.filters.confirmed',
    in_transit: 'orders.filters.inTransit',
    delivered: 'orders.filters.delivered',
    cancelled: 'orders.filters.cancelled',
};
const TAB_ORDER = Object.keys(GROUP_LABEL_KEYS);

const ACTIVE_FILTER: StatusFilter = {
    key: 'active',
    labelKey: 'orders.filters.active',
    label: 'active',
    groups: null,
    excludeGroups: FINAL_GROUPS,
};
const ALL_FILTER: StatusFilter = {
    key: 'all',
    labelKey: 'orders.filters.all',
    label: 'all',
    groups: null,
};

// Rejected orders live in Active and All only, not under a tab of their own.
export function buildStatusFilters(presentGroups: string[]): StatusFilter[] {
    const known = TAB_ORDER.filter(g => presentGroups.includes(g));
    const unknown = presentGroups.filter(g => !TAB_ORDER.includes(g) && g !== 'rejected');
    const tabs = [...known, ...unknown].map(g => ({
        key: g,
        labelKey: GROUP_LABEL_KEYS[g] ?? null,
        label: g,
        groups: [g],
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
