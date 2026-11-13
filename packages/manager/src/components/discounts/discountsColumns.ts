import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { i18n } from '../../i18n';
import { DISCOUNT_STATUS_OPTIONS } from '../../api/discounts';

const col = (field: string): string => i18n.global.t(`discounts.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'] as const;

// Low-priority columns drop first on a narrow page; no starts/ends-with (the server has no regex).
// Filtering is the toolbar Filter builder; the search box covers number, price type, group and customer.
export function buildDiscountsColumns(): AdvancedDataTableColumn[] {
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
            width: 190,
            priority: 9,
            minWidth: 150,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
        },
        {
            field: 'scope',
            header: col('scope'),
            width: 150,
            priority: 9,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
        },
        {
            field: 'priceType',
            header: col('priceType'),
            sortField: 'priceType',
            width: 150,
            priority: 5,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            // Options are the caller's allowed price types, filled by the table once they load.
            filterType: 'select',
            filterOptions: [],
            filterOperators: ['eq', 'notEq'],
        },
        {
            field: 'productGroup',
            header: col('productGroup'),
            sortField: 'productGroup',
            width: 150,
            priority: 4,
            minWidth: 130,
            filterConfig: NOT_FILTERED,
            // Text until the table loads the facet values and turns it into a select.
            filterType: 'string',
            filterOperators: [...TEXT_OPERATORS],
        },
        {
            field: 'percent',
            header: col('percent'),
            sortField: 'percent',
            width: 110,
            priority: 8,
            minWidth: 110,
            align: 'end',
            filterConfig: NOT_FILTERED,
            filterType: 'number',
        },
        {
            field: 'validFrom',
            header: col('validFrom'),
            sortField: 'validFrom',
            width: 120,
            priority: 2,
            minWidth: 120,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
            mobile: { hidden: true },
        },
        {
            field: 'validTo',
            header: col('validTo'),
            sortField: 'validTo',
            width: 140,
            priority: 7,
            minWidth: 140,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
        },
        {
            field: 'status',
            header: col('status'),
            sortField: 'status',
            width: 160,
            priority: 7,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOptions: DISCOUNT_STATUS_OPTIONS.map(o => ({ ...o })),
            filterOperators: ['eq', 'notEq'],
            mobile: { badge: true },
        },
        {
            field: 'justification',
            header: col('justification'),
            width: 200,
            priority: 1,
            minWidth: 160,
            filterConfig: NOT_FILTERED,
            mobile: { hidden: true },
        },
    ];
}

// Not on screen until the person turns them on in the column settings.
export const DISCOUNTS_HIDDEN_BY_DEFAULT = ['validFrom', 'justification'];
