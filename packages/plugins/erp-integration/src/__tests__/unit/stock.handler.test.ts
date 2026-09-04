import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { StockStreamHandler } from '../../handlers/stock.handler';

describe('StockStreamHandler', () => {
    const ctx = {} as RequestContext;

    it('skips when productId or availableQuantity is missing', async () => {
        const getRawOne = vi.fn();
        const qb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            innerJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            getRawOne,
        };
        const connection = { rawConnection: { createQueryBuilder: vi.fn().mockReturnValue(qb) } };
        const handler = new StockStreamHandler(connection as never);

        await handler.apply(ctx, 'stock-1', { productId: '', availableQuantity: 5 });

        expect(getRawOne).not.toHaveBeenCalled();
    });

    it('skips a deleted stock event without writing', async () => {
        const getRawOne = vi.fn();
        const qb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            innerJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            getRawOne,
        };
        const connection = { rawConnection: { createQueryBuilder: vi.fn().mockReturnValue(qb) } };
        const handler = new StockStreamHandler(connection as never);

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            availableQuantity: 5,
            isDeleted: true,
        });

        expect(getRawOne).not.toHaveBeenCalled();
    });

    it('writes availableQuantity as stockOnHand into the default stock_level row for the resolved variant', async () => {
        const selectGetRawOne = vi.fn().mockResolvedValue({ id: 'variant-1' });
        const selectQb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            innerJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            getRawOne: selectGetRawOne,
        };
        const execute = vi.fn().mockResolvedValue(undefined);
        const updateQb = {
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            execute,
        };
        const createQueryBuilder = vi
            .fn()
            .mockReturnValueOnce(selectQb)
            .mockReturnValueOnce(updateQb);
        const connection = { rawConnection: { createQueryBuilder } };
        const handler = new StockStreamHandler(connection as never);

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-1',
            warehouseId: 'wh-1',
            quantity: 12,
            reservedQuantity: 2,
            availableQuantity: 10,
            isDeleted: false,
        });

        expect(updateQb.set).toHaveBeenCalledWith({ stockOnHand: 10 });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it('skips writing when no variant matches the productId', async () => {
        const selectGetRawOne = vi.fn().mockResolvedValue(undefined);
        const selectQb = {
            select: vi.fn().mockReturnThis(),
            from: vi.fn().mockReturnThis(),
            innerJoin: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            getRawOne: selectGetRawOne,
        };
        const createQueryBuilder = vi.fn().mockReturnValue(selectQb);
        const connection = { rawConnection: { createQueryBuilder } };
        const handler = new StockStreamHandler(connection as never);

        await handler.apply(ctx, 'stock-1', {
            productId: 'prod-missing',
            availableQuantity: 5,
        });

        expect(createQueryBuilder).toHaveBeenCalledTimes(1);
    });
});
