import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    BLANK_ORDERS_FILTERS,
    buildOrdersListQuery,
    fetchOrdersList,
    restoreSavedFilters,
    todayRange,
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

    it('uses eq for one status and in for several', () => {
        expect(buildOrdersListQuery(filters({ state: ['Shipped'] }), [], NOW).filter.state).toEqual(
            {
                eq: 'Shipped',
            },
        );
        expect(
            buildOrdersListQuery(filters({ state: ['Shipped', 'Delivered'] }), [], NOW).filter
                .state,
        ).toEqual({ in: ['Shipped', 'Delivered'] });
    });

    it('lets a view that pins the state win over the status column filter', () => {
        const q = buildOrdersListQuery(
            filters({ view: 'processing', state: ['Delivered'] }),
            [],
            NOW,
        );
        expect(q.filter.state).toEqual({ eq: 'PaymentAuthorized' });
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
        expect(
            buildOrdersListQuery(filters({ placedBy: PLACED_BY_CUSTOMER_VALUE }), [], NOW).filter
                .placedByAdministratorId,
        ).toEqual({ isNull: true });
        expect(
            buildOrdersListQuery(filters({ placedBy: '7' }), [], NOW).filter
                .placedByAdministratorId,
        ).toEqual({ eq: '7' });
    });

    it('treats the date range as inclusive of the last day and totals as open-ended bounds', () => {
        const q = buildOrdersListQuery(
            filters({
                dateRange: { preset: '', from: '2026-11-01', to: '2026-11-02' },
                totalMin: 1000,
            }),
            [],
            NOW,
        );
        const createdAt = q.filter.createdAt as { after: string; before: string };
        expect(new Date(createdAt.before).getTime() - new Date(createdAt.after).getTime()).toBe(
            2 * 24 * 60 * 60 * 1000,
        );
        expect(q.filter.totalWithTax).toEqual({ gte: 1000 });
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
            filters({ state: ['Cancelled'] }),
            { customerId: 'customer-123' },
            [],
            2,
            10,
            { createdAt: 'DESC' },
        );
        expect(preset()).toMatchObject({
            customerId: 'customer-123',
            options: { skip: 10, take: 10, filter: { state: { eq: 'Cancelled' } } },
        });
    });
});

describe('saved views', () => {
    it('restores the current shape', () => {
        const saved = filters({ view: 'overdue', state: ['Shipped'], managerId: '3' });
        expect(restoreSavedFilters(JSON.stringify(saved))).toEqual(saved);
    });

    it('upgrades the older flat shape and drops what no longer applies', () => {
        const restored = restoreSavedFilters(
            JSON.stringify({ state: 'PaymentSettled', dateRange: 'today', search: 'acme' }),
        );
        expect(restored.state).toEqual(['PaymentSettled']);
        expect(restored.search).toBe('acme');
        expect(restored.dateRange).toEqual(BLANK_ORDERS_FILTERS.dateRange);
    });

    it('falls back to a blank list on corrupt JSON', () => {
        expect(restoreSavedFilters('{oops')).toEqual(BLANK_ORDERS_FILTERS);
    });

    it('builds a one-day range for today', () => {
        expect(todayRange(new Date(2026, 10, 7))).toEqual({
            preset: 'today',
            from: '2026-11-07',
            to: '2026-11-07',
        });
    });
});
