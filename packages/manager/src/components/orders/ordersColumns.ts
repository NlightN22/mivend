import type { AdvancedDataTableColumn } from '@mivend/ui-kit';
import {
    ORDER_STATE_OPTIONS,
    ORDER_STATE_BADGE_VARIANT,
    ORDER_RESERVATION_STATE_OPTIONS,
    ORDER_RESERVATION_STATE_BADGE_VARIANT,
} from '../../api/orders';

const NON_BLANK_STATES = ORDER_STATE_OPTIONS.filter(o => o.value);
const NON_BLANK_RESERVATIONS = ORDER_RESERVATION_STATE_OPTIONS.filter(o => o.value);

export const ALL_COLUMNS: AdvancedDataTableColumn[] = [
    {
        field: 'code',
        header: 'Order #',
        sortField: 'code',
        width: 120,
        required: true,
        filterConfig: { type: 'text', placeholder: 'Order, company, INN or phone contains…' },
        mobile: { primary: true },
    },
    {
        field: 'date',
        header: 'Date created',
        sortField: 'createdAt',
        width: 125,
        filterConfig: { type: 'date-range' },
    },
    // customer, branch and attention have no server-side filter; the search box covers the customer.
    { field: 'customer', header: 'Customer', width: 200, filterConfig: { type: 'none' } },
    {
        field: 'manager',
        header: 'Manager',
        width: 130,
        filterConfig: { type: 'enum', placeholder: 'Any manager', options: [] },
    },
    {
        field: 'state',
        header: 'Status',
        sortField: 'state',
        width: 190,
        filterConfig: {
            type: 'status',
            multiple: true,
            placeholder: 'All statuses',
            options: NON_BLANK_STATES.map(o => ({
                ...o,
                variant: ORDER_STATE_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { badge: true },
    },
    {
        field: 'total',
        header: 'Total',
        sortField: 'totalWithTax',
        width: 110,
        filterConfig: { type: 'amount-range', currencyCode: '' },
    },
    {
        field: 'placedBy',
        header: 'Placed by',
        width: 130,
        filterConfig: { type: 'enum', placeholder: 'Anyone', options: [] },
        mobile: { hidden: true },
    },
    {
        field: 'reservationState',
        header: 'Reservation',
        width: 160,
        filterConfig: {
            type: 'status',
            placeholder: 'Any reservation state',
            options: NON_BLANK_RESERVATIONS.map(o => ({
                ...o,
                variant: ORDER_RESERVATION_STATE_BADGE_VARIANT[o.value] ?? 'neutral',
            })),
        },
        mobile: { hidden: true },
    },
    {
        field: 'branch',
        header: 'Branch',
        width: 140,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
    {
        field: 'attention',
        header: 'Attention',
        width: 170,
        filterConfig: { type: 'none' },
        mobile: { hidden: true },
    },
];

// Opens without these; the column settings bring them back.
export const DEFAULT_HIDDEN_COLUMNS = ['reservationState', 'branch', 'attention'];
