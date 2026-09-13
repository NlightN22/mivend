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

    it('skips when name is missing', async () => {
        const warehouseService = { upsert: vi.fn() };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { branchId: 'branch-guid' });

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

    it('still creates the StockLocation when the branch cannot be resolved (warehouse comes back unassigned, not null)', async () => {
        const warehouseService = {
            upsert: vi.fn().mockResolvedValue({ id: 'w1', branchId: null }),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse', branchId: 'unknown-branch' });

        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Main warehouse',
            customFields: { warehouseErpId: 'wh-1' },
        });
    });

    it('still creates the StockLocation when branchId is entirely absent from the payload', async () => {
        const warehouseService = {
            upsert: vi.fn().mockResolvedValue({ id: 'w1', branchId: null }),
        };
        const stockLocationService = { create: vi.fn(), update: vi.fn() };
        const handler = new WarehouseStreamHandler(
            warehouseService as never,
            stockLocationService as never,
            createConnection(undefined) as never,
        );

        await handler.apply(ctx, 'wh-1', { name: 'Main warehouse' });

        expect(warehouseService.upsert).toHaveBeenCalledWith(ctx, {
            erpId: 'wh-1',
            name: 'Main warehouse',
            branchErpId: '',
            isActive: true,
        });
        expect(stockLocationService.create).toHaveBeenCalled();
    });
});
