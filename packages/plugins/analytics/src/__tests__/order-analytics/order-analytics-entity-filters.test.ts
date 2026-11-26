import type { RequestContext } from '@vendure/core';
import { QueryTooLargeError } from 'shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    resolveEntityFilters,
    suggestEntityNames,
} from '../../order-analytics/order-analytics-entity-filters';
import type { OrderAnalyticsEntityNamesService } from '../../order-analytics/order-analytics-entity-names.service';

const ctx = {} as RequestContext;
const find = vi.fn();
const names = { find } as unknown as OrderAnalyticsEntityNamesService;

beforeEach(() => vi.resetAllMocks());

describe('resolveEntityFilters', () => {
    it('passes the exact flag of picked objects to the lookup and fails closed above the cap', async () => {
        find.mockResolvedValue([{ erpId: 'c1', name: 'A' }]);
        await resolveEntityFilters(ctx, names, [{ kind: 'CUSTOMER', values: ['A'], exact: true }]);
        expect(find).toHaveBeenCalledWith(ctx, 'CUSTOMER', 'A', 201, true);

        const many = Array.from({ length: 21 }, (_, i) => `n${i}`);
        await expect(
            resolveEntityFilters(ctx, names, [{ kind: 'CUSTOMER', values: many, exact: true }]),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('collects the ids of every typed name per kind without duplicates', async () => {
        find.mockImplementation(async (_c, _k, text: string) =>
            text === 'a'
                ? [{ erpId: 'p1', name: 'A' }]
                : [
                      { erpId: 'p1', name: 'A2' },
                      { erpId: 'p2', name: 'B' },
                  ],
        );

        const result = await resolveEntityFilters(ctx, names, [
            { kind: 'PRODUCT', values: ['a', 'b'] },
        ]);

        expect(result.productIds).toEqual(['p1', 'p2']);
        expect(result.unmatched).toBe(false);
    });

    it('flags a filter whose names match nothing, so the caller returns no rows', async () => {
        find.mockResolvedValue([]);

        const result = await resolveEntityFilters(ctx, names, [
            { kind: 'MANUFACTURER', values: ['ghost'] },
        ]);

        expect(result.unmatched).toBe(true);
    });

    it('skips blank values and kinds without values', async () => {
        const result = await resolveEntityFilters(ctx, names, [
            { kind: 'CUSTOMER', values: [' ', ''] },
            { kind: 'MANAGER', values: [] },
        ]);

        expect(find).not.toHaveBeenCalled();
        expect(result.unmatched).toBe(false);
    });

    it('routes each kind to its own id list', async () => {
        find.mockResolvedValue([{ erpId: 'x', name: 'X' }]);

        const result = await resolveEntityFilters(ctx, names, [
            { kind: 'COUNTERPARTY_MANAGER', values: ['x'] },
            { kind: 'POINT_OF_SALE', values: ['x'] },
        ]);

        expect(result.counterpartyManagerIds).toEqual(['x']);
        expect(result.pointOfSaleIds).toEqual(['x']);
        expect(result.managerIds).toEqual([]);
    });
});

describe('resolveEntityFilters caps fail closed', () => {
    const many = (n: number): Array<{ erpId: string; name: string }> =>
        Array.from({ length: n }, (_, i) => ({ erpId: `e${i}`, name: `N${i}` }));

    it('refuses a value that matches more than 200 entities instead of truncating it', async () => {
        find.mockResolvedValue(many(201));

        await expect(
            resolveEntityFilters(ctx, names, [{ kind: 'CUSTOMER', values: ['ivan'] }]),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
        expect(find).toHaveBeenCalledWith(ctx, 'CUSTOMER', 'ivan', 201, false);
    });

    it('accepts a value that matches exactly 200 entities', async () => {
        find.mockResolvedValue(many(200));

        const result = await resolveEntityFilters(ctx, names, [
            { kind: 'CUSTOMER', values: ['ivan'] },
        ]);

        expect(result.customerIds).toHaveLength(200);
    });

    it('refuses more than 20 typed values of one kind', async () => {
        find.mockResolvedValue(many(1));
        const values = Array.from({ length: 21 }, (_, i) => `name ${i}`);

        await expect(
            resolveEntityFilters(ctx, names, [{ kind: 'PRODUCT', values }]),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });

    it('refuses more than 1000 resolved ids of one kind', async () => {
        let next = 0;
        find.mockImplementation(async () =>
            Array.from({ length: 200 }, () => ({ erpId: `e${next++}`, name: 'x' })),
        );
        const values = Array.from({ length: 6 }, (_, i) => `name ${i}`);

        await expect(
            resolveEntityFilters(ctx, names, [{ kind: 'PRODUCT', values }]),
        ).rejects.toBeInstanceOf(QueryTooLargeError);
    });
});

describe('suggestEntityNames', () => {
    it('needs two characters and returns at most ten distinct names', async () => {
        expect(await suggestEntityNames(ctx, names, 'PRODUCT', 'a')).toEqual([]);
        expect(find).not.toHaveBeenCalled();

        find.mockResolvedValue(
            Array.from({ length: 30 }, (_, i) => ({ erpId: `e${i}`, name: `N${i % 15}` })),
        );
        const found = await suggestEntityNames(ctx, names, 'PRODUCT', 'ab');
        expect(found).toHaveLength(10);
        expect(new Set(found).size).toBe(10);
    });
});
