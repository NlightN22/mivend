import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderAnalyticsService } from '../../order-analytics/order-analytics.service';
import type { OrderAnalyticsInput } from '../../order-analytics/order-analytics.service';
import { OrderMetricsError } from '../../order-analytics/order-metrics.types';
import type { OrderTurnoverRow } from '../../order-analytics/order-metrics.types';

const ctx = {} as RequestContext;
const getOrderTurnover = vi.fn();
const visibleCustomerErpIds = vi.fn();
const visibleManagerErpIds = vi.fn();
const labelsFor = vi.fn();

const service = new OrderAnalyticsService(
    { getOrderTurnover } as never,
    { visibleCustomerErpIds, visibleManagerErpIds } as never,
    { labelsFor } as never,
);

const input = (over: Partial<OrderAnalyticsInput> = {}): OrderAnalyticsInput => ({
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'NONE',
    dimension: 'CUSTOMER',
    ...over,
});

const row = (over: Partial<OrderTurnoverRow> = {}): OrderTurnoverRow => ({
    periodStart: null,
    dimensionId: 'customer-1',
    currency: 'RUB',
    turnover: '10.00',
    turnoverExcludingVat: '8.33',
    vatTotal: '1.67',
    orderCount: 1,
    ordersWithoutAmount: 0,
    ...over,
});

beforeEach(() => {
    vi.resetAllMocks();
    visibleCustomerErpIds.mockResolvedValue(null);
    visibleManagerErpIds.mockResolvedValue(null);
    labelsFor.mockResolvedValue(new Map());
    getOrderTurnover.mockResolvedValue([row()]);
});

describe('OrderAnalyticsService scope', () => {
    it('passes the requested filters through for a viewer without a restriction', async () => {
        const result = await service.query(
            ctx,
            input({ customerIds: ['c1'], pointOfSaleIds: ['p1'] }),
        );

        expect(getOrderTurnover).toHaveBeenCalledOnce();
        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            customerIds: ['c1'],
            pointOfSaleIds: ['p1'],
        });
        expect(result.limitedToVisibleCustomers).toBe(false);
    });

    it('restricts a scoped viewer to the visible customers when none is requested', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1', 'c2']);

        const result = await service.query(ctx, input());

        expect(getOrderTurnover.mock.calls[0][0].customerIds).toEqual(['c1', 'c2']);
        expect(result.limitedToVisibleCustomers).toBe(true);
    });

    it('never lets a requested customer outside the scope through', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1', 'c2']);

        await service.query(ctx, input({ customerIds: ['c2', 'foreign'] }));

        expect(getOrderTurnover.mock.calls[0][0].customerIds).toEqual(['c2']);
    });

    it('does not call the service when nothing requested is visible', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1']);

        const result = await service.query(ctx, input({ customerIds: ['foreign'] }));

        expect(getOrderTurnover).not.toHaveBeenCalled();
        expect(result).toEqual({ state: 'OK', rows: [], limitedToVisibleCustomers: true });
    });

    it('does not call the service for a viewer who sees no customers at all', async () => {
        visibleCustomerErpIds.mockResolvedValue([]);

        const result = await service.query(ctx, input());

        expect(getOrderTurnover).not.toHaveBeenCalled();
        expect(result.rows).toEqual([]);
    });

    it('limits a requested manager filter to the visible managers', async () => {
        visibleManagerErpIds.mockResolvedValue(['m1']);

        await service.query(ctx, input({ managerIds: ['m1', 'm2'] }));
        expect(getOrderTurnover.mock.calls[0][0].managerIds).toEqual(['m1']);

        getOrderTurnover.mockClear();
        const none = await service.query(ctx, input({ managerIds: ['m2'] }));
        expect(getOrderTurnover).not.toHaveBeenCalled();
        expect(none.rows).toEqual([]);
    });

    it('drops manager rows of managers the viewer may not see', async () => {
        visibleManagerErpIds.mockResolvedValue(['m1']);
        getOrderTurnover.mockResolvedValue([
            row({ dimensionId: 'm1' }),
            row({ dimensionId: 'm2' }),
        ]);

        const result = await service.query(ctx, input({ dimension: 'MANAGER' }));

        expect(result.rows.map(r => r.dimensionId)).toEqual(['m1']);
    });

    it('keeps every manager row for a viewer who sees all managers', async () => {
        getOrderTurnover.mockResolvedValue([
            row({ dimensionId: 'm1' }),
            row({ dimensionId: 'm2' }),
        ]);

        const result = await service.query(ctx, input({ dimension: 'MANAGER' }));

        expect(result.rows).toHaveLength(2);
    });
});

describe('OrderAnalyticsService requests and rows', () => {
    it('splits more than 1000 visible customers into requests and merges the buckets', async () => {
        const visible = Array.from({ length: 2500 }, (_, i) => `c${i}`);
        visibleCustomerErpIds.mockResolvedValue(visible);
        getOrderTurnover.mockResolvedValue([row({ turnover: '1.10', orderCount: 2 })]);

        const result = await service.query(ctx, input());

        expect(getOrderTurnover.mock.calls.map(c => c[0].customerIds.length)).toEqual([
            1000, 1000, 500,
        ]);
        expect(result.rows).toHaveLength(1);
        expect(result.rows[0]).toMatchObject({ turnover: '3.30', orderCount: 6 });
    });

    it('sends one request without a customer filter when nothing narrows it', async () => {
        await service.query(ctx, input());

        expect(getOrderTurnover).toHaveBeenCalledOnce();
        expect(getOrderTurnover.mock.calls[0][0].customerIds).toEqual([]);
    });

    it('labels rows by name and falls back to the id for an unknown entity', async () => {
        getOrderTurnover.mockResolvedValue([
            row({ dimensionId: 'known' }),
            row({ dimensionId: 'unknown' }),
        ]);
        labelsFor.mockResolvedValue(new Map([['known', 'Known Customer']]));

        const result = await service.query(ctx, input());

        expect(result.rows.map(r => r.label)).toEqual(['Known Customer', 'unknown']);
        expect(labelsFor).toHaveBeenCalledWith(ctx, 'CUSTOMER', ['known', 'unknown']);
    });

    it('rejects a filter list longer than the service accepts', async () => {
        const tooMany = Array.from({ length: 1001 }, (_, i) => `p${i}`);

        await expect(service.query(ctx, input({ pointOfSaleIds: tooMany }))).rejects.toBeInstanceOf(
            UserInputError,
        );
    });
});

describe('OrderAnalyticsService failures', () => {
    it.each([
        ['NOT_CONFIGURED', 'NOT_CONFIGURED'],
        ['TOO_LARGE', 'TOO_LARGE'],
        ['TIMEOUT', 'UNAVAILABLE'],
        ['UNAVAILABLE', 'UNAVAILABLE'],
        ['UNAUTHENTICATED', 'UNAVAILABLE'],
        ['PERMISSION_DENIED', 'UNAVAILABLE'],
    ] as const)('turns a %s failure into the %s state, never rows', async (kind, state) => {
        getOrderTurnover.mockRejectedValue(new OrderMetricsError(kind, 'failed'));

        const result = await service.query(ctx, input());

        expect(result).toEqual({ state, rows: [], limitedToVisibleCustomers: false });
    });

    it('passes a bad request on as a user input error', async () => {
        getOrderTurnover.mockRejectedValue(new OrderMetricsError('INVALID_ARGUMENT', 'bad period'));

        await expect(service.query(ctx, input())).rejects.toBeInstanceOf(UserInputError);
    });

    it('reports too many visible customers as TOO_LARGE, not as a partial answer', async () => {
        visibleCustomerErpIds.mockRejectedValue(new QueryTooLargeError(20000));

        const result = await service.query(ctx, input());

        expect(result.state).toBe('TOO_LARGE');
        expect(getOrderTurnover).not.toHaveBeenCalled();
    });

    it('does not swallow an unexpected error', async () => {
        getOrderTurnover.mockRejectedValue(new Error('boom'));

        await expect(service.query(ctx, input())).rejects.toThrow('boom');
    });
});
