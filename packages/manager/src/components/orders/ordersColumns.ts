import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import { ORDER_STATE_OPTIONS, ORDER_RESERVATION_STATE_OPTIONS } from '../../api/orders';

const NON_BLANK_STATES = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);
const NOT_FILTERED = { type: 'none' } as const;

// Filtering is the toolbar Filter builder (`filterType`); the search box covers order, company, INN
// and phone. Customer, branch and attention have no server-side filter.
export const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'code',
        header: 'Order #',
        sortField: 'code',
        width: 150,
        priority: 10,
        minWidth: 150,
        required: true,
        filterConfig: NOT_FILTERED,
        filterType: 'string',
        mobile: { primary: true },
    },
    {
        field: 'date',
        header: 'Date',
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
        header: 'Customer',
        width: 230,
        priority: 9,
        minWidth: 230,
        filterConfig: NOT_FILTERED,
    },
    {
        field: 'manager',
        header: 'Manager',
        width: 135,
        priority: 6,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: [],
        filterOperators: ['eq'],
    },
    {
        field: 'state',
        header: 'Status',
        sortField: 'state',
        width: 175,
        priority: 5,
        minWidth: 120,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: NON_BLANK_STATES.map(o => ({ value: o.value, label: o.label })),
        mobile: { badge: true },
    },
    {
        field: 'total',
        header: 'Total',
        sortField: 'totalWithTax',
        width: 150,
        priority: 8,
        minWidth: 150,
        filterConfig: NOT_FILTERED,
        filterType: 'number',
        filterField: 'totalWithTax',
        filterScale: 100,
    },
    {
        field: 'placedBy',
        header: 'Placed by',
        width: 150,
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
        header: 'Reservation',
        width: 160,
        priority: 3,
        filterConfig: NOT_FILTERED,
        filterType: 'select',
        filterOptions: NON_BLANK_RESERVATIONS.map(o => ({ value: o.value, label: o.label })),
        mobile: { hidden: true },
    },
    {
        field: 'branch',
        header: 'Branch',
        width: 140,
        priority: 2,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
    {
        field: 'attention',
        header: 'Attention',
        width: 170,
        priority: 1,
        filterConfig: NOT_FILTERED,
        mobile: { hidden: true },
    },
];

// Opens without these; the column settings bring them back.
export const DEFAULT_HIDDEN_COLUMNS = ['reservationState', 'branch', 'attention'];
