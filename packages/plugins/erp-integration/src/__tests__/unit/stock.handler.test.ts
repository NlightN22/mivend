import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StockStreamHandler } from '../../handlers/stock.handler';

function createConnection(rows: Array<Record<string, unknown> | undefined>): {
    rawConnection: { createQueryBuilder: () => unknown };
} {
    let call = 0;
    return {
        rawConnection: {
            createQueryBuilder: () => {
                const row = rows[call];
                call += 1;
                return {
                    select: vi.fn().mockReturnThis(),
                    from: vi.fn().mockReturnThis(),
                    innerJoin: vi.fn().mockReturnThis(),
                    where: vi.fn().mockReturnThis(),
                    getRawOne: vi.fn().mockResolvedValue(row),
                };
            },
        },
    };
}

describe('StockStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when productId/warehouseId/quantity is missing', async () => {
        const warehouseService = { findByErpId: vi.fn() };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', { productId: '', quantity: 5 });

        expect(warehouseService.findByErpId).not.toHaveBeenCalled();
    });

    it('skips a deleted stock event without writing', async () => {
        const warehouseService = { findByErpId: vi.fn() };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 5,
            isDeleted: true,
        });

        expect(warehouseService.findByErpId).not.toHaveBeenCalled();
    });

    it('skips when no Warehouse is found for warehouseId (out-of-order delivery)', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue(null) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-missing',
            quantity: 5,
        });

        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('skips when no StockLocation matches the warehouse yet', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([undefined]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 5,
        });

        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('skips when no variant matches the productId', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, undefined]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-missing',
            warehouseId: 'wh-1',
            quantity: 5,
        });

        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('writes the delta between quantity and the current stockOnHand for the resolved location', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({ stockOnHand: 3 }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
            reservedQuantity: 2,
            availableQuantity: 10,
        });

        expect(stockLevelService.updateStockOnHandForLocation).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'loc-1',
            9,
        );
    });

    it('does not write when the reported quantity already matches stockOnHand', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({ stockOnHand: 12 }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
        });

        expect(stockLevelService.updateStockOnHandForLocation).not.toHaveBeenCalled();
    });
});
