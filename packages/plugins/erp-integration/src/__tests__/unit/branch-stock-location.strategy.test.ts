import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { BranchStockLocationStrategy } from '../../branch-stock-location.strategy';

function makeStrategy(options: {
    branchId: string | null;
    // Must match ReservationAvailabilityService.findBranchStockLocationIds (includedInBranchAtp).
    // Strategy only intersects these with the given candidates; never adds locations.
    activeLocationIds: string[];
    stockLevels: Record<
        string,
        {
            stockOnHand: number;
            stockAllocated: number;
            customFields?: { erpAvailableQuantity: number | null };
        }
    >;
}): BranchStockLocationStrategy {
    const strategy = new BranchStockLocationStrategy();
    const availabilityService = {
        findBranchStockLocationIds: vi.fn().mockResolvedValue(options.activeLocationIds),
    };
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
    Object.assign(strategy, { availabilityService, connection });
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
            activeLocationIds: ['loc-a', 'loc-b'],
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
            activeLocationIds: ['loc-a'],
            stockLevels: { 'loc-a': { stockOnHand: 5, stockAllocated: 0 } },
        });
        const stockLocations = [location('loc-a', 'wh-a'), location('loc-other', 'wh-other')];

        const result = await strategy.forAllocation(ctx, stockLocations, orderLine, 1);

        expect(result).toEqual([{ location: stockLocations[0], quantity: 1 }]);
    });

    it('throws instead of falling back when the order has no resolved branchId', async () => {
        const strategy = makeStrategy({ branchId: null, activeLocationIds: [], stockLevels: {} });
        const stockLocations = [location('loc-a', 'wh-a'), location('loc-b', 'wh-b')];

        await expect(strategy.forAllocation(ctx, stockLocations, orderLine, 1)).rejects.toThrow(
            /orderLine line-1/,
        );
    });

    it('throws instead of falling back when the branch has no matching warehouses', async () => {
        const strategy = makeStrategy({
            branchId: 'branch-1',
            activeLocationIds: [],
            stockLevels: {},
        });
        const stockLocations = [location('loc-a', 'wh-a')];

        await expect(strategy.forAllocation(ctx, stockLocations, orderLine, 1)).rejects.toThrow(
            /orderLine line-1/,
        );
    });

    it('throws instead of returning an empty result when no StockLocation exists at all', async () => {
        const strategy = makeStrategy({
            branchId: 'branch-1',
            activeLocationIds: [],
            stockLevels: {},
        });

        await expect(strategy.forAllocation(ctx, [], orderLine, 1)).rejects.toThrow(
            /no StockLocation exists at all/,
        );
    });
});

describe('BranchStockLocationStrategy.getAvailableStock', () => {
    it('applies the shared per-location formula incl. the ERP cap', () => {
        const strategy = makeStrategy({ branchId: 'b', activeLocationIds: [], stockLevels: {} });
        const result = strategy.getAvailableStock({} as RequestContext, 1, [
            { stockOnHand: 25, stockAllocated: 20, customFields: { erpAvailableQuantity: 25 } },
            { stockOnHand: 9, stockAllocated: 0, customFields: { erpAvailableQuantity: 3 } },
        ] as never);
        expect(result).toEqual({ stockOnHand: 8, stockAllocated: 0 });
    });
});
