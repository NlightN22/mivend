import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { tr } from '../../utils/lazyLabels';

const col = (field: string): string => tr(`erpDocuments.powerOfAttorney.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'] as const;

// Number first; it is also what the toolbar search box finds, with the holder and the customer.
export const POWER_OF_ATTORNEY_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'number',
        get header() {
            return col('number');
        },
        sortField: 'number',
        width: 130,
        priority: 10,
        minWidth: 120,
        required: true,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        mobile: { primary: true },
    },
    {
        field: 'holder',
        get header() {
            return col('holder');
        },
        sortField: 'holder',
        width: 200,
        priority: 9,
        minWidth: 140,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
    },
    {
        field: 'validFrom',
        get header() {
            return col('validFrom');
        },
        sortField: 'validFrom',
        width: 120,
        priority: 6,
        minWidth: 110,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
    },
    {
        field: 'validUntil',
        get header() {
            return col('validUntil');
        },
        sortField: 'validUntil',
        width: 120,
        priority: 8,
        minWidth: 110,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
    },
    {
        field: 'status',
        get header() {
            return col('status');
        },
        width: 150,
        priority: 7,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [
            {
                value: 'active',
                get label() {
                    return tr('erpDocuments.powerOfAttorney.status.active');
                },
            },
            {
                value: 'expired',
                get label() {
                    return tr('erpDocuments.powerOfAttorney.status.expired');
                },
            },
        ],
        filterOperators: ['eq', 'notEq'],
        mobile: { badge: true },
    },
    {
        field: 'customer',
        get header() {
            return col('customer');
        },
        sortField: 'customer',
        width: 200,
        priority: 5,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
    },
    {
        field: 'contract',
        get header() {
            return col('contract');
        },
        width: 180,
        priority: 4,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: [...TEXT_OPERATORS],
        mobile: { hidden: true },
    },
    {
        field: 'scan',
        get header() {
            return col('scan');
        },
        width: 130,
        priority: 3,
        minWidth: 110,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
];
