import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { tr } from '../../utils/lazyLabels';
import { settlementSuggest } from '../../api/settlementsSuggest';

const col = (field: string): string => tr(`settlements.list.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
export const TEXT_OPERATORS = [
    'contains',
    'notContains',
    'eq',
    'notEq',
    'isNull',
    'notNull',
] as const;

// Organization and Proforma invoice start hidden (SETTLEMENTS_DEFAULT_HIDDEN). Low-priority columns drop first on a narrow page; no starts/ends-with (the server has no regex).
// Filtering is the toolbar Filter builder; the search box covers number, customer, INN and orders.
export const SETTLEMENTS_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        get header() {
            return col('number');
        },
        sortField: 'number',
        width: 130,
        priority: 10,
        minWidth: 130,
        required: true,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterSuggest: settlementSuggest('number'),
        filterOperators: [...TEXT_OPERATORS],
        mobile: { primary: true },
    },
    {
        field: 'date',
        get header() {
            return col('date');
        },
        sortField: 'date',
        width: 100,
        priority: 6,
        minWidth: 100,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
    },
    {
        field: 'type',
        get header() {
            return col('type');
        },
        sortField: 'typeLabel',
        width: 170,
        priority: 8,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        filterField: 'typeLabel',
        mobile: { badge: true },
    },
    {
        field: 'customer',
        get header() {
            return col('customer');
        },
        sortField: 'customer',
        width: 200,
        priority: 9,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterSuggest: settlementSuggest('customer'),
        filterOperators: [...TEXT_OPERATORS],
    },
    {
        field: 'contract',
        get header() {
            return col('contract');
        },
        width: 130,
        priority: 3,
        minWidth: 110,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        mobile: { hidden: true },
    },
    {
        field: 'organization',
        get header() {
            return col('organization');
        },
        width: 200,
        priority: 2,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        mobile: { hidden: true },
    },
    {
        field: 'order',
        get header() {
            return col('order');
        },
        width: 130,
        priority: 5,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        filterField: 'orderCode',
    },
    {
        field: 'proformaInvoice',
        get header() {
            return col('proformaInvoice');
        },
        width: 140,
        priority: 4,
        minWidth: 140,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        filterField: 'proformaInvoiceNumber',
        mobile: { hidden: true },
    },
    {
        field: 'amount',
        get header() {
            return col('amount');
        },
        sortField: 'amount',
        width: 160,
        priority: 11,
        minWidth: 160,
        align: 'end',
        filterConfig: NOT_FILTERED,
        filterType: 'number',
        filterScale: 100,
    },
];

export const SETTLEMENTS_DEFAULT_HIDDEN = ['organization', 'proformaInvoice'];
