import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { tr } from '../../utils/lazyLabels';
import { ORDER_STATE_OPTIONS, ORDER_RESERVATION_STATE_OPTIONS } from '../../api/orders';

const NON_BLANK_STATES = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);
const NOT_FILTERED = { type: 'none' } as const;

// The code column omits starts/ends-with: the server has no regex operator.
// Widths are the widest realistic cell text + 32px padding; sum 1080 fits a 1360px page (1088px table).
// Filtering is the toolbar Filter builder (`filterType`); the search box covers order, company, INN
// and phone. Customer, branch and attention have no server-side filter.
const COLUMNS: Omit<AdvancedDataTableColumn, 'header'>[] = [
    {
        field: 'code',
        sortField: 'code',
        width: 140,
        priority: 10,
        minWidth: 140,
        required: true,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        filterOperators: ['contains', 'notContains', 'eq', 'notEq', 'isNull', 'notNull'],
        mobile: { primary: true },
    },
    {
        field: 'date',
        sortField: 'createdAt',
        width: 130,
        priority: 7,
        minWidth: 130,
        filterConfig: NOT_FILTERED,
        filterType: 'date',
        filterField: 'createdAt',
    },
    {
        field: 'customer',
        width: 200,
        priority: 9,
        minWidth: 170,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'manager',
        width: 130,
        minWidth: 100,
        priority: 6,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        filterOperators: ['eq'],
    },
    {
        field: 'state',
        sortField: 'state',
        width: 180,
        priority: 5,
        minWidth: 180,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        mobile: { badge: true },
    },
    {
        field: 'total',
        sortField: 'totalWithTax',
        width: 180,
        priority: 8,
        minWidth: 180,
        filterConfig: NOT_FILTERED,
        filterType: 'number',
        filterField: 'totalWithTax',
        filterScale: 100,
    },
    {
        field: 'placedBy',
        width: 120,
        minWidth: 100,
        priority: 4,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        filterField: 'placedByAdministratorId',
        filterOperators: ['eq', 'notEq'],
        mobile: { hidden: true },
    },
    {
        field: 'reservationState',
        width: 160,
        priority: 3,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        mobile: { hidden: true },
    },
    {
        field: 'branch',
        width: 140,
        priority: 2,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'attention',
        width: 170,
        priority: 1,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
];

const LAZY_OPTIONS: Record<string, () => { value: string; label: string }[]> = {
    state: () => NON_BLANK_STATES.map(o => ({ value: o.value, label: o.label })),
    reservationState: () => NON_BLANK_RESERVATIONS.map(o => ({ value: o.value, label: o.label })),
};

// Headers and option labels resolve on read, so the table follows a language switch.
export const ALL_COLUMNS: AdvancedDataTableColumn[] = COLUMNS.map(column => {
    const lazy = Object.defineProperty({ ...column }, 'header', {
        enumerable: true,
        get: () => tr(`orders.columns.${column.field}`),
    }) as AdvancedDataTableColumn;
    const options = LAZY_OPTIONS[column.field];
    if (options) Object.defineProperty(lazy, 'filterOptions', { enumerable: true, get: options });
    return lazy;
});

// Opens without these; the column settings bring them back.
export const DEFAULT_HIDDEN_COLUMNS = ['reservationState', 'branch', 'attention'];
