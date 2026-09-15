import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StockStreamHandler } from '../../handlers/stock.handler';
import { MissingDependencyError } from '../../types';

function createConnection(
    rows: Array<Record<string, unknown> | undefined>,
    stockLevelSave = vi.fn(),
): {
    rawConnection: { createQueryBuilder: () => unknown };
    getRepository: () => { save: typeof stockLevelSave };
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
        getRepository: () => ({ save: stockLevelSave }),
    };
}

describe('StockStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when productId/warehouseId is missing', async () => {
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

    // mivend.issue.84.88: `quantity` is a plain (non-optional) proto3 double, same zero-value
    // omission shape as `availableQuantity` — an absent key means the reported quantity is 0, not
    // a malformed payload. Confirmed live: 4 processed stock events with no `quantity` key were
    // being silently dropped in full (not even stockOnHand applied) by a prior revision that
    // defaulted the missing key to NaN and treated NaN as "missing, skip".
    it('applies a stock event with an absent quantity as an explicit 0, not a malformed-payload skip', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({ id: 'level-1', stockOnHand: 5 }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', { productId: 'prod-1', warehouseId: 'wh-1' });

        expect(warehouseService.findByErpId).toHaveBeenCalled();
        expect(stockLevelService.updateStockOnHandForLocation).toHaveBeenCalledWith(
            ctx,
            'variant-1',
            'loc-1',
            -5,
        );
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

    it('throws MissingDependencyError when no Warehouse is found for warehouseId (issue #96: retry, not silent drop)', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue(null) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await expect(
            handler.apply(ctx, 'stock-1', {
                productId: 'prod-1',
                warehouseId: 'wh-missing',
                quantity: 5,
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('throws MissingDependencyError when no StockLocation matches the warehouse yet', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([undefined]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await expect(
            handler.apply(ctx, 'stock-1', {
                productId: 'prod-1',
                warehouseId: 'wh-1',
                quantity: 5,
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('throws MissingDependencyError when no variant matches the productId', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = { getStockLevel: vi.fn(), updateStockOnHandForLocation: vi.fn() };
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, undefined]) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await expect(
            handler.apply(ctx, 'stock-1', {
                productId: 'prod-missing',
                warehouseId: 'wh-1',
                quantity: 5,
            }),
        ).rejects.toThrow(MissingDependencyError);
        expect(stockLevelService.getStockLevel).not.toHaveBeenCalled();
    });

    it('writes the delta between quantity and the current stockOnHand for the resolved location', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({ id: 'level-1', stockOnHand: 3 }),
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

    it('persists erpAvailableQuantity onto StockLevel.customFields (issue #72)', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi
                .fn()
                .mockResolvedValue({ id: 'level-1', stockOnHand: 12, customFields: {} }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const stockLevelSave = vi.fn();
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }], stockLevelSave) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
            availableQuantity: 10,
        });

        expect(stockLevelSave).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'level-1',
                customFields: expect.objectContaining({ erpAvailableQuantity: 10 }),
            }),
        );
    });

    it('does not touch StockLevel when erpAvailableQuantity is already up to date', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({
                id: 'level-1',
                stockOnHand: 12,
                customFields: { erpAvailableQuantity: 10 },
            }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const stockLevelSave = vi.fn();
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }], stockLevelSave) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
            availableQuantity: 10,
        });

        expect(stockLevelSave).not.toHaveBeenCalled();
    });

    // mivend.issue.84.88: Integration Service's contract declares available_quantity as a plain
    // (non-optional) proto3 double — its zero-value (0) is OMITTED from the decoded JSON payload,
    // same shape as isActive/isDeleted's own documented zero-value omission (types.ts). An absent
    // key here means "1C reports zero available," not "no data" — confirmed live as a real
    // production gap (68 stock rows silently never got an ATP cap written at all).
    it('treats an absent availableQuantity as an explicit 0, not "no data" (proto3 zero-value omission)', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi
                .fn()
                .mockResolvedValue({ id: 'level-1', stockOnHand: 12, customFields: {} }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const stockLevelSave = vi.fn();
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }], stockLevelSave) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
        });

        expect(stockLevelSave).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'level-1',
                customFields: expect.objectContaining({ erpAvailableQuantity: 0 }),
            }),
        );
    });

    it('does not touch StockLevel when erpAvailableQuantity is already 0 and availableQuantity is absent', async () => {
        const warehouseService = { findByErpId: vi.fn().mockResolvedValue({ id: 'w1' }) };
        const stockLevelService = {
            getStockLevel: vi.fn().mockResolvedValue({
                id: 'level-1',
                stockOnHand: 12,
                customFields: { erpAvailableQuantity: 0 },
            }),
            updateStockOnHandForLocation: vi.fn(),
        };
        const stockLevelSave = vi.fn();
        const handler = new StockStreamHandler(
            createConnection([{ id: 'loc-1' }, { id: 'variant-1' }], stockLevelSave) as never,
            warehouseService as never,
            stockLevelService as never,
        );

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
        });

        expect(stockLevelSave).not.toHaveBeenCalled();
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
