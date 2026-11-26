import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrderMetricsError } from '../../order-analytics/order-metrics.types';
import { SalesAnalyticsService } from '../../sales-analytics/sales-analytics.service';
import type { SalesAnalyticsInput } from '../../sales-analytics/sales-analytics.service';
import type { SalesAmount, SalesTurnoverRow } from '../../sales-analytics/sales-metrics.types';

import type { AnalyticsPluginOptions } from '../../types';

const ctx = {} as RequestContext;
const getSalesTurnover = vi.fn();
const visibleCustomerErpIds = vi.fn();
const visibleManagerErpIds = vi.fn();
const labelsFor = vi.fn();
const findNamed = vi.fn();
const resolver = vi.fn();
const erpIds = vi.fn();
const options: AnalyticsPluginOptions = {};

const service = new SalesAnalyticsService(
    { getSalesTurnover } as never,
    { visibleCustomerErpIds, visibleManagerErpIds } as never,
    { labelsFor } as never,
    { find: findNamed } as never,
    { resolver } as never,
    { erpIds } as never,
    options,
);

const input = (over: Partial<SalesAnalyticsInput> = {}): SalesAnalyticsInput => ({
    from: new Date('2026-01-01T00:00:00Z'),
    to: new Date('2026-02-01T00:00:00Z'),
    granularity: 'NONE',
    dimension: 'COUNTERPARTY',
    ...over,
});

const amount = (value: string): SalesAmount => ({
    amount: value,
    amountExcludingVatBasis: '0.00',
    documentCount: 1,
    documentsWithoutAmount: 0,
});

const row = (over: Partial<SalesTurnoverRow> = {}): SalesTurnoverRow => ({
    periodStart: null,
    dimensionId: 'c1',
    currency: 'RUB',
    sales: amount('10.00'),
    returns: amount('0.00'),
    corrections: amount('0.00'),
    netSales: amount('10.00'),
    ...over,
});

const response = (over: Record<string, unknown> = {}): object => ({
    rows: [row()],
    correctionsWithoutEffect: 2,
    unresolvedCurrencies: ['id-1'],
    ...over,
});

beforeEach(() => {
    vi.resetAllMocks();
    visibleCustomerErpIds.mockResolvedValue(null);
    visibleManagerErpIds.mockResolvedValue(null);
    labelsFor.mockResolvedValue(new Map());
    getSalesTurnover.mockResolvedValue(response());
    findNamed.mockResolvedValue([]);
    resolver.mockResolvedValue((v: string) => v);
});

describe('SalesAnalyticsService scope and filters', () => {
    it('resolves typed names to ids and sends them with the requested bucket', async () => {
        findNamed.mockImplementation((_c, kind) =>
            Promise.resolve([{ erpId: `${kind}-erp`, name: 'x' }]),
        );

        await service.query(
            ctx,
            input({
                entityFilters: [
                    { kind: 'CUSTOMER', values: ['Acme'] },
                    { kind: 'CONTRACT', values: ['Main'] },
                    { kind: 'ORGANIZATION', values: ['Org'] },
                ],
            }),
        );

        expect(getSalesTurnover.mock.calls[0][0]).toMatchObject({
            counterpartyIds: ['CUSTOMER-erp'],
            contractIds: ['CONTRACT-erp'],
            organizationIds: ['ORGANIZATION-erp'],
            dimension: 'COUNTERPARTY',
        });
    });

    it('answers no rows when a typed name matches nothing, never the unfiltered answer', async () => {
        const result = await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'CONTRACT', values: ['nothing'] }] }),
        );

        expect(result.rows).toEqual([]);
        expect(getSalesTurnover).not.toHaveBeenCalled();
    });

    it('restricts a scoped viewer to the visible counterparties', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1', 'c2']);

        const result = await service.query(ctx, input());

        expect(getSalesTurnover.mock.calls[0][0].counterpartyIds).toEqual(['c1', 'c2']);
        expect(result.limitedToVisibleCustomers).toBe(true);
    });

    it('answers no rows for a viewer who sees no counterparty', async () => {
        visibleCustomerErpIds.mockResolvedValue([]);

        const result = await service.query(ctx, input());

        expect(result.rows).toEqual([]);
        expect(getSalesTurnover).not.toHaveBeenCalled();
    });

    it('keeps only visible managers in the counterparty-manager dimension', async () => {
        visibleManagerErpIds.mockResolvedValue(['m1']);
        getSalesTurnover.mockResolvedValue(
            response({ rows: [row({ dimensionId: 'm1' }), row({ dimensionId: 'm2' })] }),
        );

        const result = await service.query(ctx, input({ dimension: 'COUNTERPARTY_MANAGER' }));

        expect(result.rows.map(r => r.dimensionId)).toEqual(['m1']);
    });

    it('rejects a filter kind sales do not have', async () => {
        await expect(
            service.query(ctx, input({ entityFilters: [{ kind: 'PRODUCT', values: ['x'] }] })),
        ).rejects.toBeInstanceOf(UserInputError);
    });
});

describe('SalesAnalyticsService result', () => {
    it('keeps currency groups apart and passes the signals through', async () => {
        getSalesTurnover.mockResolvedValue(
            response({ rows: [row({ currency: 'RUB' }), row({ currency: '643' })] }),
        );

        const result = await service.query(ctx, input());

        expect(result.rows.map(r => r.currency)).toEqual(['643', 'RUB']);
        expect(result.correctionsWithoutEffect).toBe(2);
        expect(result.unresolvedCurrencies).toEqual(['id-1']);
    });

    it('labels rows by the dimension and falls back to the id', async () => {
        labelsFor.mockResolvedValue(new Map([['c1', 'Customer One']]));
        getSalesTurnover.mockResolvedValue(response({ rows: [row(), row({ dimensionId: 'c9' })] }));

        const result = await service.query(ctx, input());

        expect(result.rows.map(r => r.label)).toEqual(['Customer One', 'c9']);
    });

    it('adds the counters of parts when the counterparty list is long', async () => {
        visibleCustomerErpIds.mockResolvedValue(Array.from({ length: 1500 }, (_, i) => `c${i}`));

        const result = await service.query(ctx, input());

        expect(getSalesTurnover).toHaveBeenCalledTimes(2);
        expect(result.correctionsWithoutEffect).toBe(4);
        expect(result.rows[0].sales.amount).toBe('20.00');
    });
});

describe('SalesAnalyticsService failures', () => {
    it('maps a too broad name and a service overload to TOO_LARGE', async () => {
        findNamed.mockRejectedValue(new QueryTooLargeError(200));
        const broad = await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'CUSTOMER', values: ['a'] }] }),
        );
        expect(broad.state).toBe('TOO_LARGE');

        getSalesTurnover.mockRejectedValue(new OrderMetricsError('TOO_LARGE', 'too many rows'));
        expect((await service.query(ctx, input())).state).toBe('TOO_LARGE');
    });

    it('reports a missing configuration and an unreachable service as states', async () => {
        getSalesTurnover.mockRejectedValue(new OrderMetricsError('NOT_CONFIGURED', 'no key'));
        expect((await service.query(ctx, input())).state).toBe('NOT_CONFIGURED');

        getSalesTurnover.mockRejectedValue(new OrderMetricsError('TIMEOUT', 'late'));
        expect((await service.query(ctx, input())).state).toBe('UNAVAILABLE');
    });

    it('turns a bad request into a user error', async () => {
        getSalesTurnover.mockRejectedValue(new OrderMetricsError('INVALID_ARGUMENT', 'period'));
        await expect(service.query(ctx, input())).rejects.toBeInstanceOf(UserInputError);
    });
});

describe('SalesAnalyticsService currency resolution', () => {
    it('shows catalog codes for ids and numeric codes and merges them into one currency row', async () => {
        const known: Record<string, string> = { 'cur-1': 'RUB', '643': 'RUB' };
        resolver.mockResolvedValue((v: string) => known[v] ?? v);
        getSalesTurnover.mockResolvedValue(
            response({
                rows: [
                    row({ currency: 'cur-1' }),
                    row({ currency: '643', sales: amount('5.00'), netSales: amount('5.00') }),
                    row({ currency: 'cur-9' }),
                    row({ currency: '' }),
                ],
                unresolvedCurrencies: ['cur-1', 'cur-9'],
            }),
        );

        const result = await service.query(ctx, input());

        expect(resolver).toHaveBeenCalledWith(ctx, ['cur-1', '643', 'cur-9', '', 'cur-1', 'cur-9']);
        expect(result.rows.map(r => [r.currency, r.netSales.amount])).toEqual([
            ['', '10.00'],
            ['cur-9', '10.00'],
            ['RUB', '15.00'],
        ]);
        expect(result.unresolvedCurrencies).toEqual(['cur-9']);
    });
});
