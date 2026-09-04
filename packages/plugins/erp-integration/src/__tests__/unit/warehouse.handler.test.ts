import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { WarehouseStreamHandler } from '../../handlers/warehouse.handler';

function createConnection(existingLocation: { id: string } | undefined): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    return {
        rawConnection: {
            createQueryBuilder: () => ({
                select: () => ({
                    from: () => ({
                        where: () => ({
                            getRawOne: vi.fn().mockResolvedValue(existingLocation),
                        }),
                    }),
                }),
            }),
        },
    };
}

describe('WarehouseStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when name/branchId are missing', async () => {
        const warehouseService = { upsert: vi.fn() };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main' });

        expect(warehouseService.upsert).not.toHaveBeenCalled();
    });

    it('creates a new StockLocation when the warehouse upserts and no location exists yet', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse', branchId: 'branch-guid' });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: 'branch-guid',
            isActive: true,
        });
        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Main warehouse',
            customFields: { warehouseErpId: 'wh-1' },
        });
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });

    it('updates the existing StockLocation by warehouseErpId instead of creating a duplicate', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection({ id: 'loc-1' }) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Renamed warehouse', branchId: 'branch-guid' });

        expect(stockLocationService.update).toHaveBeenCalledWith(ctx, {
            id: 'loc-1',
            name: 'Renamed warehouse',
        });
        expect(stockLocationService.create).not.toHaveBeenCalled();
    });

    it('does not touch StockLocation when the branch is not found (warehouseService returns null)', async () => {
        const warehouseService = { upsert: vi.fn().mockResolvedValue(null) };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse', branchId: 'unknown-branch' });

        expect(stockLocationService.create).not.toHaveBeenCalled();
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });
});
