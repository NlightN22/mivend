import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

const NOT_FILTERED = { type: 'none' } as const;

// The server list takes only search and the status chip (no builder conditions), so no column has a filterType;
// the search box matches the document number and customer names. Sortable only where the server sorts.
export const ERP_DISCOUNTS_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Discount #',
        sortField: 'documentNumber',
        width: 160,
        priority: 10,
        minWidth: 160,
        required: true,
        filterConfig: NOT_FILTERED,
        mobile: { primary: true },
    },
    {
        field: 'validFrom',
        header: 'Valid from',
        sortField: 'validFrom',
        width: 150,
        priority: 8,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'customer',
        header: 'Customer',
        width: 200,
        priority: 9,
        minWidth: 160,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'percent',
        header: 'Discount %',
        sortField: 'percent',
        width: 160,
        priority: 7,
        minWidth: 160,
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
        width: 120,
        priority: 5,
        minWidth: 110,
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
        width: 130,
        priority: 9,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
        mobile: { badge: true },
    },
];

// Price type is rarely set on ERP documents; the visible columns must fit 1360 px without a sideways scroll.
export const ERP_DISCOUNTS_HIDDEN_BY_DEFAULT = ['priceType'];
