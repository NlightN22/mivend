import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderAnalyticsService } from '../../order-analytics/order-analytics.service';
import type { OrderAnalyticsInput } from '../../order-analytics/order-analytics.service';
import type { OrderTurnoverRow } from '../../order-analytics/order-metrics.types';

const ctx = {} as RequestContext;
const getOrderTurnover = vi.fn();
const visibleCustomerErpIds = vi.fn();
const visibleManagerErpIds = vi.fn();
const customerErpIdFor = vi.fn();
const managerErpIdFor = vi.fn();
const labelsFor = vi.fn();
const findNamed = vi.fn();
const resolver = vi.fn();

const service = new OrderAnalyticsService(
    { getOrderTurnover } as never,
    { visibleCustomerErpIds, visibleManagerErpIds, customerErpIdFor, managerErpIdFor } as never,
    { labelsFor } as never,
    { find: findNamed } as never,
    { resolver } as never,
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
    productQuantity: '',
    productAmount: '',
    productLinesWithoutAmount: 0,
    ...over,
});

beforeEach(() => {
    vi.resetAllMocks();
    resolver.mockResolvedValue((v: string) => v);
    visibleCustomerErpIds.mockResolvedValue(null);
    visibleManagerErpIds.mockResolvedValue(null);
    customerErpIdFor.mockResolvedValue('c-erp');
    managerErpIdFor.mockResolvedValue('m-erp');
    labelsFor.mockResolvedValue(new Map());
    getOrderTurnover.mockResolvedValue([row()]);
    findNamed.mockResolvedValue([]);
});

describe('OrderAnalyticsService counterparty managers and entity filters', () => {
    it('limits a counterparty-manager filter to the visible managers', async () => {
        visibleManagerErpIds.mockResolvedValue(['m1']);

        await service.query(ctx, input({ counterpartyManagerIds: ['m1', 'm2'] }));
        expect(getOrderTurnover.mock.calls[0][0].counterpartyManagerIds).toEqual(['m1']);

        getOrderTurnover.mockClear();
        const none = await service.query(ctx, input({ counterpartyManagerIds: ['m2'] }));
        expect(getOrderTurnover).not.toHaveBeenCalled();
        expect(none.rows).toEqual([]);
    });

    it('drops counterparty-manager rows of managers the viewer may not see', async () => {
        visibleManagerErpIds.mockResolvedValue(['m1']);
        getOrderTurnover.mockResolvedValue([
            row({ dimensionId: 'm1' }),
            row({ dimensionId: 'm2' }),
            row({ dimensionId: '' }),
        ]);

        const result = await service.query(ctx, input({ dimension: 'COUNTERPARTY_MANAGER' }));

        expect(result.rows.map(r => r.dimensionId)).toEqual(['m1']);
    });

    it('passes the main-manager flag and the product filters to the analytics service', async () => {
        findNamed.mockImplementation(async (_c, kind: string) =>
            kind === 'PRODUCT' ? [{ erpId: 'p1', name: 'Bolt' }] : [{ erpId: 'f1', name: 'Acme' }],
        );

        await service.query(
            ctx,
            input({
                mainManagerOnly: true,
                entityFilters: [
                    { kind: 'PRODUCT', values: ['Bolt'] },
                    { kind: 'MANUFACTURER', values: ['Acme'] },
                ],
            }),
        );

        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            mainManagerOnly: true,
            productIds: ['p1'],
            manufacturerIds: ['f1'],
        });
    });

    it('keeps resolved customers inside the viewer scope', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1']);
        findNamed.mockResolvedValue([
            { erpId: 'c1', name: 'A' },
            { erpId: 'c9', name: 'B' },
        ]);

        await service.query(ctx, input({ entityFilters: [{ kind: 'CUSTOMER', values: ['x'] }] }));

        expect(getOrderTurnover.mock.calls[0][0].customerIds).toEqual(['c1']);
    });

    it('never answers unfiltered when a typed name matches nothing', async () => {
        const result = await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'PRODUCT', values: ['nothing like it'] }] }),
        );

        expect(getOrderTurnover).not.toHaveBeenCalled();
        expect(result.rows).toEqual([]);
    });

    it('answers TOO_LARGE, not a partial total, when a typed name is too broad', async () => {
        findNamed.mockResolvedValue(
            Array.from({ length: 201 }, (_, i) => ({ erpId: `c${i}`, name: 'Ivan' })),
        );

        const result = await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'CUSTOMER', values: ['ivan'] }] }),
        );

        expect(result).toMatchObject({ state: 'TOO_LARGE', rows: [] });
        expect(getOrderTurnover).not.toHaveBeenCalled();
    });

    it('ignores a filter without values', async () => {
        await service.query(ctx, input({ entityFilters: [{ kind: 'PRODUCT', values: ['  '] }] }));

        expect(findNamed).not.toHaveBeenCalled();
        expect(getOrderTurnover).toHaveBeenCalledOnce();
    });
});
