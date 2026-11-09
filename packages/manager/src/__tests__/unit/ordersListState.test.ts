import { describe, it, expect } from 'vitest';
import { BLANK_ORDERS_FILTERS, type OrdersListFilters } from '../../api/orders-list';
import { ORDERS_URL_DEFAULTS, fromUrlState, toUrlState } from '../../composables/ordersListUrl';
import { sortFromState, sortToState } from '../../components/orders/ordersTableFilters';
import { toOrderRows } from '../../components/orders/ordersListRows';
import type { OrderListItem } from '../../api/orders';

describe('orders list URL state', () => {
    it('round-trips filters, sort and page size', () => {
        const filters: OrdersListFilters = {
            ...BLANK_ORDERS_FILTERS,
            search: '1001',
            view: 'processing',
            conditions: [
                { columnKey: 'state', operator: 'in', value: ['Shipped', 'Delivered'] },
                { columnKey: 'date', operator: 'between', value: ['2026-11-01', '2026-11-05'] },
                { columnKey: 'placedBy', operator: 'notEq', value: 'a b;c:d' },
                { columnKey: 'total', operator: 'gte', value: '500.5' },
            ],
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

    it('drops condition parts of a hand-edited link that name no known column or operator', () => {
        const parsed = fromUrlState({
            ...ORDERS_URL_DEFAULTS,
            filters: 'nope:eq:1;total:contains:5;total:gt:7',
        });
        expect(parsed.filters.conditions).toEqual([
            { columnKey: 'total', operator: 'gt', value: '7' },
        ]);
    });
});

describe('orders table sort mapping', () => {
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
        },
        counterparty: {
            shortName: 'customer-123',
            inn: '1',
            priceType: 'price-type-wholesale',
            assignedManagerId: '4',
            branchId: 'branch-a',
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

    it('reads customer and manager from the order counterparty, not the person', () => {
        const row = toOrderRows([{ ...order(null), customer: null }], ctx)[0];
        expect(row).toMatchObject({ customer: 'customer-123', manager: 'Pat Manager' });
    });

    it('shows the customer for a storefront order', () => {
        expect(toOrderRows([order(null)], ctx)[0]).toMatchObject({
            placedBy: 'Ann Buyer',
            placedByMeta: 'customer',
        });
    });

    it('reads the reservation code as text, including NOT_REQUIRED', () => {
        const item = order(null);
        item.customFields = { ...item.customFields!, reservationState: 'NOT_REQUIRED' };
        expect(toOrderRows([item], ctx)[0].reservation).toBe('Not required');
    });

    it('flags a shipment-pending order as overdue attention', () => {
        expect(toOrderRows([order(null)], ctx)[0].attention).toBe('Shipment overdue');
    });
});
