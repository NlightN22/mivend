import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

const NOT_FILTERED = { type: 'none' } as const;

// The server list takes only search and the status chip (no builder conditions), so no column has a filterType;
// the search box matches the document number and customer names. Sortable only where the server sorts.
export const ERP_DISCOUNTS_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Discount #',
        sortField: 'documentNumber',
        width: 140,
        priority: 10,
        minWidth: 140,
        required: true,
        filterConfig: NOT_FILTERED,
        mobile: { primary: true },
    },
    {
        field: 'validFrom',
        header: 'Valid from',
        sortField: 'validFrom',
        width: 120,
        priority: 8,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'customer',
        header: 'Customer',
        width: 220,
        priority: 9,
        minWidth: 160,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'percent',
        header: 'Discount %',
        sortField: 'percent',
        width: 130,
        priority: 7,
        minWidth: 130,
        align: 'end',
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'priceType',
        header: 'Price type',
        width: 140,
        priority: 4,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'products',
        header: 'Products',
        width: 130,
        priority: 5,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'validTo',
        header: 'Valid to',
        sortField: 'validTo',
        width: 140,
        priority: 6,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        priority: 9,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
        mobile: { badge: true },
    },
];
