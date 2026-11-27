import { OrderMetricsError } from '../../order-analytics/order-metrics.types';
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
const erpIds = vi.fn();

const service = new OrderAnalyticsService(
    { getOrderTurnover } as never,
    { visibleCustomerErpIds, visibleManagerErpIds, customerErpIdFor, managerErpIdFor } as never,
    { labelsFor } as never,
    { find: findNamed } as never,
    { resolver } as never,
    { erpIds } as never,
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

describe('OrderAnalyticsService exclusions and groups', () => {
    it('sends excluded objects by whole name and never widens a scoped viewer', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1', 'c2']);
        findNamed.mockResolvedValue([{ erpId: 'c2', name: 'B' }]);

        await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'CUSTOMER', values: ['B'], exclude: true }] }),
        );

        expect(findNamed).toHaveBeenCalledWith(ctx, 'CUSTOMER', 'B', 201, true);
        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            customerIds: ['c1', 'c2'],
            excludeCustomerIds: ['c2'],
        });
    });

    it('excludes nothing, and still answers, when the excluded names match nothing', async () => {
        const result = await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'PRODUCT', values: ['nothing'], exclude: true }] }),
        );

        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({ excludeProductIds: [] });
        expect(result.state).toBe('OK');
    });

    it('keeps include and exclude of one field side by side for the analytics service', async () => {
        findNamed.mockImplementation(async (_c, _k, text: string) => [
            { erpId: `erp-${text}`, name: text },
        ]);

        await service.query(
            ctx,
            input({
                entityFilters: [
                    { kind: 'MANAGER', values: ['in'], exact: true },
                    { kind: 'MANAGER', values: ['out'], exclude: true },
                ],
            }),
        );

        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            managerIds: ['erp-in'],
            excludeManagerIds: ['erp-out'],
        });
    });

    it('sends manufacturer groups as ERP ids translated server side, include and exclude', async () => {
        erpIds.mockImplementation(async (_c, _k, ids: string[]) => ids.map(id => `erp-${id}`));

        await service.query(
            ctx,
            input({
                groupFilters: [
                    { kind: 'MANUFACTURER_GROUP', ids: ['1'] },
                    { kind: 'MANUFACTURER_GROUP', ids: ['2'], exclude: true },
                ],
            }),
        );

        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            manufacturerGroupIds: ['erp-1'],
            excludeManufacturerGroupIds: ['erp-2'],
        });
    });

    it('answers no rows for an include group that is unknown, never the unfiltered answer', async () => {
        erpIds.mockResolvedValue([]);

        const result = await service.query(
            ctx,
            input({ groupFilters: [{ kind: 'MANUFACTURER_GROUP', ids: ['404'] }] }),
        );

        expect(result.rows).toEqual([]);
        expect(getOrderTurnover).not.toHaveBeenCalled();
    });

    it('accepts category groups and sends them as ERP ids', async () => {
        const wanted = input({ groupFilters: [{ kind: 'PRODUCT_CATEGORY', ids: ['1'] }] });
        erpIds.mockResolvedValue(['cat-erp']);
        await service.query(ctx, wanted);
        expect(getOrderTurnover.mock.calls[0][0]).toMatchObject({
            productCategoryIds: ['cat-erp'],
        });
    });

    it('answers TOO_LARGE when more than 1000 groups are excluded', async () => {
        const ids = Array.from({ length: 1001 }, (_, i) => String(i + 1));

        const result = await service.query(
            ctx,
            input({ groupFilters: [{ kind: 'MANUFACTURER_GROUP', ids, exclude: true }] }),
        );

        expect(result.state).toBe('TOO_LARGE');
        expect(getOrderTurnover).not.toHaveBeenCalled();
    });

    it('answers TOO_LARGE, not an error, when the service finds a group expanding to too many members', async () => {
        erpIds.mockResolvedValue(['g-erp']);
        getOrderTurnover.mockRejectedValue(new OrderMetricsError('TOO_LARGE', 'narrower groups'));

        const result = await service.query(
            ctx,
            input({ groupFilters: [{ kind: 'MANUFACTURER_GROUP', ids: ['1'] }] }),
        );

        expect(result).toMatchObject({ state: 'TOO_LARGE', rows: [] });
    });
});
