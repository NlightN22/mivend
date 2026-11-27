import { UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SalesAnalyticsService } from '../../sales-analytics/sales-analytics.service';
import type { SalesAnalyticsInput } from '../../sales-analytics/sales-analytics.service';
import type { SalesAmount, SalesTurnoverRow } from '../../sales-analytics/sales-metrics.types';

const ctx = {} as RequestContext;
const getSalesTurnover = vi.fn();
const visibleCustomerErpIds = vi.fn();
const visibleManagerErpIds = vi.fn();
const labelsFor = vi.fn();
const findNamed = vi.fn();
const resolver = vi.fn();
const erpIds = vi.fn();

const service = new SalesAnalyticsService(
    { getSalesTurnover } as never,
    { visibleCustomerErpIds, visibleManagerErpIds } as never,
    { labelsFor } as never,
    { find: findNamed } as never,
    { resolver } as never,
    { erpIds } as never,
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

describe('SalesAnalyticsService exclusions and groups', () => {
    it('sends excluded customers, organizations and contracts by whole name', async () => {
        findNamed.mockImplementation((_c, kind) =>
            Promise.resolve([{ erpId: `${kind}-erp`, name: 'x' }]),
        );

        await service.query(
            ctx,
            input({
                entityFilters: [
                    { kind: 'CUSTOMER', values: ['Acme'], exclude: true },
                    { kind: 'ORGANIZATION', values: ['Org'], exclude: true },
                    { kind: 'CONTRACT', values: ['Main'], exclude: true },
                    { kind: 'COUNTERPARTY_MANAGER', values: ['Ann'], exclude: true },
                ],
            }),
        );

        expect(findNamed).toHaveBeenCalledWith(ctx, 'CUSTOMER', 'Acme', 201, true);
        expect(getSalesTurnover.mock.calls[0][0]).toMatchObject({
            counterpartyIds: [],
            excludeCounterpartyIds: ['CUSTOMER-erp'],
            excludeOrganizationIds: ['ORGANIZATION-erp'],
            excludeContractIds: ['CONTRACT-erp'],
            excludeCounterpartyManagerIds: ['COUNTERPARTY_MANAGER-erp'],
        });
    });

    it('does not widen a scoped viewer when counterparties are excluded', async () => {
        visibleCustomerErpIds.mockResolvedValue(['c1', 'c2']);
        findNamed.mockResolvedValue([{ erpId: 'c2', name: 'B' }]);

        await service.query(
            ctx,
            input({ entityFilters: [{ kind: 'CUSTOMER', values: ['B'], exclude: true }] }),
        );

        expect(getSalesTurnover.mock.calls[0][0]).toMatchObject({
            counterpartyIds: ['c1', 'c2'],
            excludeCounterpartyIds: ['c2'],
        });
    });

    it('offers only counterparty groups', async () => {
        const wanted = input({ groupFilters: [{ kind: 'CUSTOMER_GROUP', ids: ['1'] }] });
        erpIds.mockResolvedValue(['g-erp']);
        await service.query(ctx, wanted);
        await expect(
            service.query(ctx, input({ groupFilters: [{ kind: 'PRODUCT_CATEGORY', ids: ['1'] }] })),
        ).rejects.toBeInstanceOf(UserInputError);
        expect(getSalesTurnover.mock.calls[0][0]).toMatchObject({
            counterpartyGroupIds: ['g-erp'],
        });
    });

    it('answers no rows for an unknown include group', async () => {
        erpIds.mockResolvedValue([]);
        const result = await service.query(
            ctx,
            input({ groupFilters: [{ kind: 'CUSTOMER_GROUP', ids: ['404'] }] }),
        );
        expect(result.rows).toEqual([]);
        expect(getSalesTurnover).not.toHaveBeenCalled();
    });
});
