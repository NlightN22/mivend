import type { FilterChip } from '@mivend/ui-kit';

export const TYPE_CHIPS: FilterChip[] = [
    { key: 'all', label: 'All' },
    { key: 'sale', label: 'Sales' },
    { key: 'payment', label: 'Payments' },
    { key: 'return', label: 'Returns' },
    { key: 'correction', label: 'Corrections' },
    { key: 'bonus', label: 'Bonuses' },
    { key: 'overdue', label: 'Overdue', variant: 'danger' },
];

export const PERIOD_PRESETS = [
    { key: 'all', label: 'All time' },
    { key: 'last30', label: 'Last 30 days' },
    { key: 'last90', label: 'Last 90 days' },
    { key: 'thisMonth', label: 'This month' },
    { key: 'prevMonth', label: 'Previous month' },
    { key: 'custom', label: 'Custom range' },
];
