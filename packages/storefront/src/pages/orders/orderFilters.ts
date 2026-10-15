export interface StatusFilter {
    key: string;
    labelKey: string;
    groups: string[] | null;
}

export const DEFAULT_STATUS = 'active';
export const DEFAULT_SOURCE = 'mivend';

export const STATUS_FILTERS: StatusFilter[] = [
    {
        key: 'active',
        labelKey: 'orders.filters.active',
        groups: ['pending', 'confirmed', 'in_transit', 'rejected'],
    },
    { key: 'pending', labelKey: 'orders.filters.pending', groups: ['pending'] },
    { key: 'confirmed', labelKey: 'orders.filters.confirmed', groups: ['confirmed'] },
    { key: 'in_transit', labelKey: 'orders.filters.inTransit', groups: ['in_transit'] },
    { key: 'delivered', labelKey: 'orders.filters.delivered', groups: ['delivered'] },
    { key: 'cancelled', labelKey: 'orders.filters.cancelled', groups: ['cancelled'] },
    { key: 'all', labelKey: 'orders.filters.all', groups: null },
];

export const SOURCE_FILTERS = [
    { key: 'mivend', labelKey: 'orders.sources.mivend', isExternal: false },
    { key: 'erp', labelKey: 'orders.sources.erp', isExternal: true },
    { key: 'all', labelKey: 'orders.sources.all', isExternal: undefined },
];

export function statusGroups(key: string): string[] | null {
    return (STATUS_FILTERS.find(f => f.key === key) ?? STATUS_FILTERS[0]).groups;
}

export function sourceIsExternal(key: string): boolean | undefined {
    return SOURCE_FILTERS.find(f => f.key === key)?.isExternal;
}
