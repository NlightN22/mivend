import { describe, it, expect, vi, Mock } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { StockHandler } from '../../handlers/stock.handler';

const ctx = {} as RequestContext;
interface BuildResult {
    handler: StockHandler;
    qb: {
        select: Mock;
        from: Mock;
        where: Mock;
        update: Mock;
        set: Mock;
        execute: Mock<() => Promise<object>>;
        getRawOne: Mock;
    };
    levels: {
        findOne: Mock<() => Promise<object | undefined>>;
        create: Mock<(v: object) => object>;
        save: Mock<(v: object) => Promise<object>>;
    };
}

function build(rows: Array<{ id: string } | undefined>, existingLevel?: object): BuildResult {
    const getRawOne = vi.fn();
    for (const row of rows) getRawOne.mockResolvedValueOnce(row);
    const qb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        execute: vi.fn(async () => ({})),
        getRawOne,
    };
    const levels = {
        findOne: vi.fn(async () => existingLevel),
        create: vi.fn((v: object) => v),
        save: vi.fn(async (v: object) => v),
    };
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            entity === 'Channel' ? { manager: { createQueryBuilder: () => qb } } : levels,
    };
    return { handler: new StockHandler(connection as never), qb, levels };
}

describe('StockHandler', () => {
    it('without a warehouse updates every stock level of the variant', async () => {
        const { handler, qb, levels } = build([{ id: '7' }]);
        await handler.upsert(ctx, { sku: 'S', stockOnHand: 5 });
        expect(qb.set).toHaveBeenCalledWith({ stockOnHand: 5 });
        expect(levels.save).not.toHaveBeenCalled();
    });

    it('with a warehouse updates only the existing level of that location', async () => {
        const { handler, qb, levels } = build([{ id: '7' }, { id: '3' }], {
            id: 1,
            stockOnHand: 1,
            stockAllocated: 2,
        });
        await handler.upsert(ctx, { sku: 'S', stockOnHand: 5, warehouseErpId: 'wh-a' });
        expect(qb.execute).not.toHaveBeenCalled();
        expect(levels.findOne).toHaveBeenCalledWith({
            where: { productVariantId: '7', stockLocationId: '3' },
        });
        expect(levels.save).toHaveBeenCalledWith({ id: 1, stockOnHand: 5, stockAllocated: 2 });
    });

    it('creates the level with nothing allocated when it is missing', async () => {
        const { handler, levels } = build([{ id: '7' }, { id: '3' }]);
        await handler.upsert(ctx, { sku: 'S', stockOnHand: 5, warehouseErpId: 'wh-a' });
        expect(levels.save).toHaveBeenCalledWith({
            productVariantId: '7',
            stockLocationId: '3',
            stockOnHand: 5,
            stockAllocated: 0,
        });
    });

    it('throws on an unknown warehouse and writes nothing', async () => {
        const { handler, levels } = build([{ id: '7' }, undefined]);
        await expect(
            handler.upsert(ctx, { sku: 'S', stockOnHand: 5, warehouseErpId: 'wh-x' }),
        ).rejects.toThrow('wh-x');
        expect(levels.save).not.toHaveBeenCalled();
    });

    it('does not swallow a failed save', async () => {
        const { handler, levels } = build([{ id: '7' }, { id: '3' }]);
        levels.save.mockRejectedValueOnce(new Error('unique violation'));
        await expect(
            handler.upsert(ctx, { sku: 'S', stockOnHand: 5, warehouseErpId: 'wh-a' }),
        ).rejects.toThrow('unique violation');
    });
});
