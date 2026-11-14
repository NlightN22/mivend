import { i18n } from '../../i18n';
import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { customerSuggest } from '../../api/customersSuggest';
import type { FilterOption } from '@mivend/ui-kit/src/components/MvFilterBuilder/filterBuilderTypes';

export const UNASSIGNED = 'unassigned';

const col = (field: string): string => i18n.global.t(`customers.list.columns.${field}`);

const NOT_FILTERED = { type: 'none' } as const;
const TEXT_OPERATORS = ['contains', 'notContains', 'eq', 'notEq'] as const;
const NUMBER_OPERATORS = ['eq', 'gt', 'gte', 'lt', 'lte', 'between'] as const;
const TEXT_OR_EMPTY = [...TEXT_OPERATORS, 'isNull', 'notNull'] as const;

// The server computes these; the labels only name them.
export function innStatusOptions(): FilterOption[] {
    const t = i18n.global.t;
    return [
        { value: 'ok', label: t('customers.list.innStatusFilter.ok') },
        { value: 'missing', label: t('customers.list.innStatusFilter.missing') },
        { value: 'duplicate', label: t('customers.list.innStatusFilter.duplicate') },
    ];
}

export function readinessOptions(): FilterOption[] {
    const t = i18n.global.t;
    return ['ready', 'missing-data', 'inn-duplicate', 'erp-inactive', 'activated'].map(value => ({
        value,
        label: t(`customers.list.readiness.${value}`),
    }));
}

export interface CustomersColumnOptions {
    managers?: FilterOption[];
    branches?: FilterOption[];
}

// Group, INN status and portal access default to hidden via CUSTOMERS_DEFAULT_HIDDEN.
// Discounts live in another plugin and cannot be filtered here.
export function buildCustomersColumns(
    options: CustomersColumnOptions = {},
): AdvancedDataTableColumn[] {
    const withUnassigned = (list: FilterOption[] = []): FilterOption[] => [
        { value: UNASSIGNED, label: i18n.global.t('customers.list.unassigned') },
        ...list,
    ];
    return [
        {
            field: 'shortName',
            header: col('shortName'),
            sortField: 'shortName',
            width: 230,
            minWidth: 170,
            priority: 10,
            required: true,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterSuggest: customerSuggest('shortName'),
            filterOperators: [...TEXT_OPERATORS],
            mobile: { primary: true },
        },
        {
            field: 'inn',
            header: col('inn'),
            sortField: 'inn',
            width: 120,
            minWidth: 120,
            priority: 8,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterSuggest: customerSuggest('inn'),
            filterOperators: [...TEXT_OR_EMPTY],
        },
        {
            field: 'manager',
            header: col('manager'),
            sortField: 'managerErpId',
            width: 150,
            minWidth: 110,
            priority: 6,
            filterConfig: NOT_FILTERED,
            filterType: options.managers ? 'select' : undefined,
            filterField: 'managerErpId',
            filterOperators: ['eq', 'notEq'],
            filterOptions: withUnassigned(options.managers),
        },
        {
            field: 'branch',
            header: col('branch'),
            width: 130,
            minWidth: 100,
            priority: 4,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterField: 'branchId',
            filterOperators: ['eq', 'notEq'],
            filterOptions: withUnassigned(options.branches),
            mobile: { hidden: true },
        },
        {
            field: 'group',
            header: col('group'),
            width: 140,
            minWidth: 110,
            priority: 1,
            filterConfig: NOT_FILTERED,
            filterType: 'string',
            filterField: 'erpGroupLabel',
            filterOperators: [...TEXT_OR_EMPTY],
            mobile: { hidden: true },
        },
        {
            field: 'innStatus',
            header: col('innStatus'),
            width: 130,
            minWidth: 110,
            priority: 1,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOperators: ['eq', 'notEq'],
            filterOptions: innStatusOptions(),
            mobile: { hidden: true },
        },
        {
            field: 'readiness',
            header: col('readiness'),
            width: 150,
            minWidth: 120,
            priority: 1,
            filterConfig: NOT_FILTERED,
            filterType: 'select',
            filterOperators: ['eq', 'notEq'],
            filterOptions: readinessOptions(),
            mobile: { hidden: true },
        },
        {
            field: 'contact',
            header: col('contact'),
            width: 160,
            minWidth: 120,
            priority: 3,
            filterConfig: NOT_FILTERED,
            mobile: { hidden: true },
        },
        {
            field: 'creditLimit',
            header: col('creditLimit'),
            width: 120,
            minWidth: 110,
            priority: 5,
            align: 'end',
            sortField: 'creditLimit',
            filterConfig: NOT_FILTERED,
            filterType: 'number',
            filterOperators: [...NUMBER_OPERATORS],
            mobile: { hidden: true },
        },
        {
            field: 'creditBalance',
            header: col('creditBalance'),
            width: 160,
            minWidth: 150,
            priority: 7,
            sortField: 'creditBalance',
            filterConfig: NOT_FILTERED,
            filterType: 'number',
            filterOperators: [...NUMBER_OPERATORS],
        },
        {
            field: 'discounts',
            header: col('discounts'),
            width: 140,
            minWidth: 130,
            priority: 2,
            filterConfig: NOT_FILTERED,
            mobile: { hidden: true },
        },
        {
            field: 'lastOrder',
            header: col('lastOrder'),
            sortField: 'lastOrderAt',
            filterField: 'lastOrderAt',
            width: 110,
            minWidth: 100,
            priority: 4,
            filterConfig: NOT_FILTERED,
            filterType: 'date',
        },
        {
            field: 'isActive',
            header: col('isActive'),
            width: 110,
            minWidth: 110,
            priority: 9,
            filterConfig: NOT_FILTERED,
            filterType: 'boolean',
            mobile: { badge: true },
        },
    ];
}

export const CUSTOMERS_DEFAULT_HIDDEN = ['group', 'innStatus', 'readiness'];
