import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import { PROFORMA_INVOICE_STATUS_OPTIONS } from '../../api/proforma-invoices';

const col = (field: string): string => i18n.global.t(`proformaInvoices.list.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
// Widths: widest cell text + 32px, sum 1070 fits 1360px. No starts/ends-with on strings (no server regex).
// Filtering is the toolbar Filter builder (`filterType`); the search box covers number, customer and INN.
export function buildProformaInvoicesColumns(): AdvancedDataTableColumn[] {
    return [
        {
            field: 'number',
            header: col('number'),
            sortField: 'number',
            width: 190,
            priority: 10,
            minWidth: 190,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'],
            mobile: { primary: true },
        },
        {
            field: 'date',
            header: col('date'),
            sortField: 'createdAt',
            width: 130,
            priority: 6,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterField: 'createdAt',
        },
        {
            field: 'customer',
            header: col('customer'),
            sortField: 'customer',
            width: 210,
            priority: 9,
            minWidth: 170,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'],
        },
        {
            field: 'order',
            header: col('order'),
            width: 130,
            priority: 8,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'],
            filterField: 'orderCode',
        },
        {
            field: 'status',
            header: col('status'),
            sortField: 'status',
            width: 140,
            priority: 7,
            minWidth: 140,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: PROFORMA_INVOICE_STATUS_OPTIONS.filter(o => o.value),
            filterOperators: ['eq', 'notEq'],
            mobile: { badge: true },
        },
        {
            field: 'amount',
            header: col('amount'),
            sortField: 'amount',
            width: 150,
            priority: 5,
            minWidth: 150,
            align: 'end',
            filterConfig: NOT_FILTERED,
            filterType: 'number',
            filterScale: 100,
        },
        {
            field: 'dueDate',
            header: col('dueDate'),
            sortField: 'dueDate',
            width: 120,
            priority: 4,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            mobile: { hidden: true },
        },
    ];
}
