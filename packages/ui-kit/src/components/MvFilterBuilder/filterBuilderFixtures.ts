import type { FilterColumn } from './filterBuilderTypes';

export const SAMPLE_COLUMNS: FilterColumn[] = [
    { key: 'code', label: 'Order #', type: 'string' },
    { key: 'total', label: 'Total', type: 'number' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'paid', label: 'Paid', type: 'boolean' },
    {
        key: 'state',
        label: 'Status',
        type: 'select',
        options: [
            { value: 'Shipped', label: 'Shipped' },
            { value: 'Delivered', label: 'Delivered' },
            { value: 'Cancelled', label: 'Cancelled' },
        ],
    },
    { key: 'customerId', label: 'Customer ID', type: 'id' },
];
