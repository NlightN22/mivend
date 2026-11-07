import { describe, it, expect } from 'vitest';
import { BLANK_ORDERS_FILTERS, type OrdersListFilters } from '../../api/orders-list';
import { ORDERS_URL_DEFAULTS, fromUrlState, toUrlState } from '../../composables/ordersListUrl';
import {
    listFiltersToTable,
    sortFromState,
    sortToState,
    tableFiltersToList,
} from '../../components/orders/ordersTableFilters';
import { toOrderRows } from '../../components/orders/ordersListRows';
import type { OrderListItem } from '../../api/orders';

describe('orders list URL state', () => {
    it('round-trips filters, sort and page size', () => {
        const filters: OrdersListFilters = {
            ...BLANK_ORDERS_FILTERS,
            search: '1001',
            view: 'processing',
            state: ['Shipped', 'Delivered'],
            dateRange: { preset: '', from: '2026-11-01', to: '2026-11-05' },
            placedBy: '4',
            totalMin: 500,
            totalMax: 9000,
        };
        const url = toUrlState(filters, { field: 'totalWithTax', dir: 'ASC' }, 20);
        expect(fromUrlState(url)).toEqual({
            filters,
            sort: { field: 'totalWithTax', dir: 'ASC' },
            pageSize: 20,
        });
    });

    it('ignores an unknown view or sort field from a hand-edited link', () => {
        const parsed = fromUrlState({
            ...ORDERS_URL_DEFAULTS,
            view: 'nope',
            sortField: 'drop table',
            pageSize: '-3',
        });
        expect(parsed.filters.view).toBe('all');
        expect(parsed.sort).toEqual({ field: 'createdAt', dir: 'DESC' });
        expect(parsed.pageSize).toBe(10);
    });
});

describe('orders table filter mapping', () => {
    it('converts the amount range between major and minor units and keeps the view', () => {
        const table = listFiltersToTable({ ...BLANK_ORDERS_FILTERS, totalMin: 12345 });
        expect(table.total.min).toBe(123.45);
        expect(tableFiltersToList(table, 'overdue')).toMatchObject({
            totalMin: 12345,
            view: 'overdue',
        });
    });

    it('maps sort between column fields and server sort fields', () => {
        const columns = [
            { field: 'code', sortField: 'code' },
            { field: 'date', sortField: 'createdAt' },
        ];
        const state = sortToState({ field: 'createdAt', dir: 'DESC' }, columns);
        expect(state).toEqual([{ field: 'date', order: -1 }]);
        expect(sortFromState(state, columns)).toEqual({ field: 'createdAt', dir: 'DESC' });
        expect(sortFromState([], columns)).toEqual({ field: 'createdAt', dir: 'DESC' });
    });
});

describe('orders list rows', () => {
    const order = (placedBy: string | null): OrderListItem => ({
        id: '1',
        code: '1001',
        state: 'PaymentSettled',
        totalWithTax: 12345,
        currencyCode: 'USD',
        orderPlacedAt: null,
        createdAt: '2026-11-01T10:00:00.000Z',
        creditLimitExceeded: false,
        customFields: {
            reservationState: null,
            reservationFailureReason: null,
            erpStatus: null,
            hasCheckFindings: null,
            placedByAdministratorId: placedBy,
        },
        customer: {
            firstName: 'Ann',
            lastName: 'Buyer',
            counterparty: {
                shortName: 'customer-123',
                inn: '1',
                priceType: 'price-type-wholesale',
                assignedManagerId: '4',
                branchId: 'branch-a',
            },
        },
    });
    const ctx = {
        managers: [{ id: '4', name: 'Pat Manager', email: '', roleCodes: [] }],
        branches: [],
        isRejected: () => false,
        pendingApprovalOrderIds: new Set<string>(),
    };

    it('resolves who placed the order to a manager name', () => {
        expect(toOrderRows([order('4')], ctx)[0].placedBy).toBe('Pat Manager');
    });

    it('shows the customer for a storefront order', () => {
        expect(toOrderRows([order(null)], ctx)[0]).toMatchObject({
            placedBy: 'Ann Buyer',
            placedByMeta: 'customer',
        });
    });

    it('flags a shipment-pending order as overdue attention', () => {
        expect(toOrderRows([order(null)], ctx)[0].attention).toBe('Shipment overdue');
    });
});
