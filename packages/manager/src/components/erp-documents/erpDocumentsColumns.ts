import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { tr } from '../../utils/lazyLabels';
import type { ErpDocumentKind } from '../../api/erpDocumentKinds';

const col = (field: string): string => tr(`erpDocuments.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'] as const;

// Number first, date second; the number is also what the toolbar search box finds. Contract, organization
// and comment start hidden. The product names are display only (the server has no product filter).
export const ERP_DOCUMENT_COLUMNS: AdvancedDataTableColumn[] = [
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
        filterOperators: [...TEXT_OPERATORS],
        mobile: { primary: true },
    },
    {
        field: 'date',
        get header() {
            return col('date');
        },
        sortField: 'date',
        width: 110,
        priority: 8,
        minWidth: 100,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
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
        filterOperators: [...TEXT_OPERATORS],
    },
    {
        field: 'order',
        get header() {
            return col('order');
        },
        width: 130,
        priority: 7,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        filterField: 'orderCode',
    },
    {
        field: 'products',
        get header() {
            return col('products');
        },
        width: 240,
        priority: 5,
        minWidth: 160,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'contract',
        get header() {
            return col('contract');
        },
        width: 150,
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
        field: 'comment',
        get header() {
            return col('comment');
        },
        width: 220,
        priority: 1,
        minWidth: 140,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        mobile: { hidden: true },
    },
    {
        field: 'amount',
        get header() {
            return col('amount');
        },
        sortField: 'amount',
        width: 150,
        priority: 11,
        minWidth: 140,
        align: 'end',
        filterConfig: NOT_FILTERED,
        filterType: 'number',
        filterScale: 100,
    },
];

export const ERP_DOCUMENT_DEFAULT_HIDDEN = ['contract', 'organization', 'comment'];

// Order corrections carry no contract; the server has no such filter for them either.
export function erpDocumentColumns(kind: ErpDocumentKind): AdvancedDataTableColumn[] {
    return kind === 'orderCorrection'
        ? ERP_DOCUMENT_COLUMNS.filter(c => c.field !== 'contract')
        : ERP_DOCUMENT_COLUMNS;
}
