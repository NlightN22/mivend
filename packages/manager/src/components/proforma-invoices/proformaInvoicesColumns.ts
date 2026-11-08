import type { AdvancedDataTableColumn } from '@mivend/ui-kit';

const NOT_FILTERED = { type: 'none' } as const;

// Widths: widest realistic cell text + 32px; sum 1070 fits a 1360px page.
// The server orders newest first and filters only by status and search, so nothing is sortable.
export const PROFORMA_INVOICES_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        header: 'Proforma invoice #',
        width: 190,
        priority: 10,
        minWidth: 190,
        required: true,
        filterConfig: NOT_FILTERED,
        mobile: { primary: true },
    },
    {
        field: 'date',
        header: 'Date',
        width: 130,
        priority: 6,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'customer',
        header: 'Customer',
        width: 210,
        priority: 9,
        minWidth: 170,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'order',
        header: 'Order',
        width: 130,
        priority: 8,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'status',
        header: 'Status',
        width: 140,
        priority: 7,
        minWidth: 140,
        filterConfig: NOT_FILTERED,
        mobile: { badge: true },
    },
    {
        field: 'amount',
        header: 'Amount',
        width: 150,
        priority: 5,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'dueDate',
        header: 'Due',
        width: 120,
        priority: 4,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
];
