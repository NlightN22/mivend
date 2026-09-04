import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { BranchStockLocationStrategy } from '../../branch-stock-location.strategy';

function makeStrategy(options: {
    branchId: string | null;
    warehouses: Array<{ erpId: string; branchId: string; isActive: boolean }>;
    stockLevels: Record<string, { stockOnHand: number; stockAllocated: number }>;
}): BranchStockLocationStrategy {
    const strategy = new BranchStockLocationStrategy();
    const warehouseService = { findAll: vi.fn().mockResolvedValue(options.warehouses) };
    const connection = {
        rawConnection: {
            createQueryBuilder: () => ({
                select: () => ({
                    from: () => ({
                        innerJoin: () => ({
                            where: () => ({
                                getRawOne: vi
                                    .fn()
                                    .mockResolvedValue(
                                        options.branchId
                                            ? { branchId: options.branchId }
                                            : undefined,
                                    ),
                            }),
                        }),
                    }),
                }),
            }),
        },
        getRepository: () => ({
            findOne: vi.fn(async ({ where }: { where: { stockLocationId: string } }) => {
                const level = options.stockLevels[where.stockLocationId];
                return level ? level : undefined;
            }),
        }),
    };
    Object.assign(strategy, { warehouseService, connection });
    return strategy;
}

function location(id: string, warehouseErpId: string): never {
    return { id, customFields: { warehouseErpId } } as never;
}

describe('BranchStockLocationStrategy', () => {
    const ctx = {} as RequestContext;
    const orderLine = { id: 'line-1', productVariantId: 'variant-1' } as never;

    it('allocates from the branch-scoped location with the most available stock', async () => {
        const strategy = makeStrategy({
            branchId: 'branch-1',
            warehouses: [
                { erpId: 'wh-a', branchId: 'branch-1', isActive: true },
                { erpId: 'wh-b', branchId: 'branch-1', isActive: true },
            ],
            stockLevels: {
                'loc-a': { stockOnHand: 5, stockAllocated: 0 },
                'loc-b': { stockOnHand: 20, stockAllocated: 2 },
            },
        });
        const stockLocations = [location('loc-a', 'wh-a'), location('loc-b', 'wh-b')];

        const result = await strategy.forAllocation(ctx, stockLocations, orderLine, 3);

        expect(result).toEqual([{ location: stockLocations[1], quantity: 3 }]);
    });

    it('excludes locations belonging to a different branch', async () => {
        const strategy = makeStrategy({
            branchId: 'branch-1',
            warehouses: [{ erpId: 'wh-a', branchId: 'branch-1', isActive: true }],
            stockLevels: { 'loc-a': { stockOnHand: 5, stockAllocated: 0 } },
        });
        const stockLocations = [location('loc-a', 'wh-a'), location('loc-other', 'wh-other')];

        const result = await strategy.forAllocation(ctx, stockLocations, orderLine, 1);

        expect(result).toEqual([{ location: stockLocations[0], quantity: 1 }]);
    });

    it('falls back to the first stock location when the order has no resolved branchId', async () => {
        const strategy = makeStrategy({ branchId: null, warehouses: [], stockLevels: {} });
        const stockLocations = [location('loc-a', 'wh-a'), location('loc-b', 'wh-b')];

        const result = await strategy.forAllocation(ctx, stockLocations, orderLine, 1);

        expect(result).toEqual([{ location: stockLocations[0], quantity: 1 }]);
    });

    it('falls back to the first stock location when the branch has no matching warehouses', async () => {
        const strategy = makeStrategy({
            branchId: 'branch-1',
            warehouses: [{ erpId: 'wh-a', branchId: 'other-branch', isActive: true }],
            stockLevels: {},
        });
        const stockLocations = [location('loc-a', 'wh-a')];

        const result = await strategy.forAllocation(ctx, stockLocations, orderLine, 1);

        expect(result).toEqual([{ location: stockLocations[0], quantity: 1 }]);
    });
});
