import { i18n } from '../../i18n';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { PAYMENT_CHANNEL_OPTIONS, PAYMENT_STATUS_OPTIONS } from '../../api/payments';

const col = (field: string): string => i18n.global.t(`payments.list.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'] as const;

// Low-priority columns drop first on a narrow page; no starts/ends-with (the server has no regex).
// Filtering is the toolbar Filter builder; the search box covers number, customer and INN.
export function buildPaymentsColumns(): AdvancedDataTableColumn[] {
    return [
        {
            field: 'number',
            header: col('number'),
            sortField: 'number',
            width: 150,
            priority: 10,
            minWidth: 150,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
            mobile: { primary: true },
        },
        {
            field: 'date',
            header: col('date'),
            sortField: 'createdAt',
            width: 120,
            priority: 6,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            filterField: 'createdAt',
        },
        {
            field: 'customer',
            header: col('customer'),
            sortField: 'customer',
            width: 170,
            priority: 9,
            minWidth: 150,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
        },
        {
            field: 'proformaInvoice',
            header: col('proformaInvoice'),
            width: 175,
            priority: 4,
            minWidth: 175,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
            filterField: 'proformaInvoiceNumber',
        },
        {
            field: 'order',
            header: col('order'),
            width: 120,
            priority: 5,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
            filterField: 'orderCode',
        },
        {
            field: 'channel',
            header: col('channel'),
            sortField: 'channel',
            width: 160,
            priority: 3,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: PAYMENT_CHANNEL_OPTIONS.filter(o => o.value).map(o => ({ ...o })),
            filterOperators: ['eq', 'notEq'],
            mobile: { hidden: true },
        },
        {
            field: 'status',
            header: col('status'),
            sortField: 'status',
            width: 150,
            priority: 7,
            minWidth: 150,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: PAYMENT_STATUS_OPTIONS.filter(o => o.value).map(o => ({ ...o })),
            filterOperators: ['eq', 'notEq'],
            mobile: { badge: true },
        },
        {
            field: 'amount',
            header: col('amount'),
            sortField: 'amount',
            width: 140,
            priority: 8,
            minWidth: 140,
            align: 'end',
            filterConfig: NOT_FILTERED,
            filterType: 'number',
            filterScale: 100,
        },
    ];
}
