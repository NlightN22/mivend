import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    BLANK_ORDERS_FILTERS,
    buildOrdersListQuery,
    fetchOrdersList,
    restoreOrdersFilters,
    type OrdersListFilters,
} from '../../api/orders-list';
import { PLACED_BY_CUSTOMER_VALUE } from '../../api/customers';

const NOW = new Date('2026-11-07T12:00:00Z');
function filters(patch: Partial<OrdersListFilters>): OrdersListFilters {
    return { ...BLANK_ORDERS_FILTERS, ...patch };
}

describe('buildOrdersListQuery', () => {
    it('sends no filter and no search for the blank list', () => {
        expect(buildOrdersListQuery(BLANK_ORDERS_FILTERS, [], NOW)).toEqual({
            filter: {},
            managerId: undefined,
            search: undefined,
        });
    });

    it('maps the search box to the server-side search argument, not a code filter', () => {
        const q = buildOrdersListQuery(filters({ search: '1001' }), [], NOW);
        expect(q.search).toBe('1001');
        expect(q.filter).not.toHaveProperty('code');
    });

    it('maps builder conditions to Vendure operators', () => {
        const q = buildOrdersListQuery(
            filters({
                conditions: [
                    { columnKey: 'state', operator: 'in', value: ['Shipped', 'Delivered'] },
                    { columnKey: 'total', operator: 'gt', value: '1000' },
                ],
            }),
            [],
            NOW,
        );
        expect(q.filter).toEqual({
            state: { in: ['Shipped', 'Delivered'] },
            totalWithTax: { gt: 100000 },
        });
    });

    it('ANDs a view that pins the state with the status condition instead of replacing it', () => {
        const q = buildOrdersListQuery(
            filters({
                view: 'processing',
                conditions: [{ columnKey: 'state', operator: 'in', value: ['Delivered'] }],
            }),
            [],
            NOW,
        );
        expect(q.filter).toEqual({
            state: { in: ['Delivered'] },
            _and: [{ state: { eq: 'PaymentAuthorized' } }],
        });
    });

    it('builds the rejected-by-ERP view from the dictionary codes', () => {
        const q = buildOrdersListQuery(filters({ view: 'rejected-by-erp' }), ['REJ1', 'REJ2'], NOW);
        expect(q.filter.erpStatus).toEqual({ in: ['REJ1', 'REJ2'] });
    });

    it('builds the overdue view as shipment-pending orders placed before the cutoff', () => {
        const q = buildOrdersListQuery(filters({ view: 'overdue' }), [], NOW);
        expect(q.filter.state).toEqual({ eq: 'PaymentSettled' });
        expect(q.filter.orderPlacedAt).toEqual({ before: '2026-11-04T12:00:00.000Z' });
    });

    it('sends the ERP requirement and reservation views as flat filters', () => {
        expect(
            buildOrdersListQuery(filters({ view: 'erp-requirements' }), [], NOW).filter
                .hasCheckFindings,
        ).toEqual({ eq: true });
        expect(
            buildOrdersListQuery(filters({ view: 'reservation-failed' }), [], NOW).filter
                .reservationFailureReason,
        ).toEqual({ isNull: false });
    });

    it('maps the customer-placed sentinel to isNull and a manager id to eq', () => {
        const placed = (operator: 'eq' | 'notEq', value: string): unknown =>
            buildOrdersListQuery(
                filters({ conditions: [{ columnKey: 'placedBy', operator, value }] }),
                [],
                NOW,
            ).filter.placedByAdministratorId;
        expect(placed('eq', PLACED_BY_CUSTOMER_VALUE)).toEqual({ isNull: true });
        expect(placed('notEq', PLACED_BY_CUSTOMER_VALUE)).toEqual({ isNull: false });
        expect(placed('eq', '7')).toEqual({ eq: '7' });
    });

    it('sends the manager condition as the managerId argument, not as a filter', () => {
        const q = buildOrdersListQuery(
            filters({ conditions: [{ columnKey: 'manager', operator: 'eq', value: '3' }] }),
            [],
            NOW,
        );
        expect(q.managerId).toBe('3');
        expect(q.filter).toEqual({});
    });

    it('treats a date range as inclusive of the last day', () => {
        const q = buildOrdersListQuery(
            filters({
                conditions: [
                    { columnKey: 'date', operator: 'between', value: ['2026-11-01', '2026-11-02'] },
                ],
            }),
            [],
            NOW,
        );
        const createdAt = q.filter.createdAt as { between: { start: string; end: string } };
        expect(
            new Date(createdAt.between.end).getTime() - new Date(createdAt.between.start).getTime(),
        ).toBe(2 * 24 * 60 * 60 * 1000);
    });

    it('skips a condition whose column the server cannot filter', () => {
        const q = buildOrdersListQuery(
            filters({ conditions: [{ columnKey: 'customer', operator: 'contains', value: 'x' }] }),
            [],
            NOW,
        );
        expect(q.filter).toEqual({});
    });
});

describe('fetchOrdersList preset', () => {
    afterEach(() => vi.unstubAllGlobals());

    function mockFetch(): () => Record<string, unknown> {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ data: { visibleOrders: { totalItems: 0, items: [] } } }),
        } as Response);
        vi.stubGlobal('fetch', fetchMock);
        return () =>
            (JSON.parse(fetchMock.mock.calls[0][1].body as string) as { variables: never })
                .variables;
    }

    it('passes the preset customer as the scoped customerId argument', async () => {
        const vars = mockFetch();
        await fetchOrdersList(BLANK_ORDERS_FILTERS, { customerId: 'customer-123' }, [], 1, 10, {
            createdAt: 'DESC',
        });
        expect(vars()).toMatchObject({ customerId: 'customer-123' });
    });

    it('omits customerId for the unfiltered list and keeps the user filters with a preset', async () => {
        const plain = mockFetch();
        await fetchOrdersList(BLANK_ORDERS_FILTERS, {}, [], 1, 10, { createdAt: 'DESC' });
        expect(plain().customerId).toBeUndefined();

        vi.unstubAllGlobals();
        const preset = mockFetch();
        await fetchOrdersList(
            filters({
                conditions: [{ columnKey: 'state', operator: 'in', value: ['Cancelled'] }],
            }),
            { customerId: 'customer-123' },
            [],
            2,
            10,
            { createdAt: 'DESC' },
        );
        expect(preset()).toMatchObject({
            customerId: 'customer-123',
            list: { skip: 10, take: 10, filter: { state: { in: ['Cancelled'] } } },
        });
    });
});

describe('saved views', () => {
    it('restores every filter of the current shape', () => {
        const saved = filters({
            view: 'overdue',
            search: '10',
            conditions: [
                { columnKey: 'state', operator: 'in', value: ['Shipped'] },
                { columnKey: 'total', operator: 'between', value: ['5', '9'] },
            ],
        });
        expect(restoreOrdersFilters(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    });

    it('drops values of the wrong type, unknown views and unknown columns', () => {
        const restored = restoreOrdersFilters({
            conditions: [{ columnKey: 'nope', operator: 'eq', value: '1' }, 'x'],
            view: 'nope',
            search: 7,
        });
        expect(restored).toEqual(BLANK_ORDERS_FILTERS);
    });

    it('falls back to a blank list for a non-object', () => {
        expect(restoreOrdersFilters(null)).toEqual(BLANK_ORDERS_FILTERS);
    });

    it('drops a stored starts-with condition on the number, keeping the rest', () => {
        const restored = restoreOrdersFilters({
            view: 'processing',
            conditions: [
                { columnKey: 'code', operator: 'startsWith', value: '10' },
                { columnKey: 'code', operator: 'contains', value: '10' },
                { columnKey: 'state', operator: 'in', value: ['Shipped'] },
            ],
        });
        expect(restored.view).toBe('processing');
        expect(restored.conditions.map(c => `${c.columnKey}:${c.operator}`)).toEqual([
            'code:contains',
            'state:in',
        ]);
    });

    it('builds only fields the server whitelist accepts, for every filter column', () => {
        const served = new Set([
            'code',
            'createdAt',
            'orderPlacedAt',
            'state',
            'totalWithTax',
            'placedByAdministratorId',
            'reservationState',
            'reservationFailureReason',
            'erpStatus',
            'hasCheckFindings',
            '_and',
        ]);
        const q = buildOrdersListQuery(
            filters({
                view: 'overdue',
                conditions: [
                    { columnKey: 'code', operator: 'contains', value: '1' },
                    { columnKey: 'date', operator: 'before', value: '2026-01-02' },
                    { columnKey: 'state', operator: 'eq', value: 'Shipped' },
                    { columnKey: 'total', operator: 'gt', value: '5' },
                    { columnKey: 'placedBy', operator: 'notEq', value: '3' },
                    { columnKey: 'reservationState', operator: 'eq', value: 'RESERVED' },
                ],
            }),
            [],
            NOW,
        );
        expect(Object.keys(q.filter).filter(k => !served.has(k))).toEqual([]);
    });
});
