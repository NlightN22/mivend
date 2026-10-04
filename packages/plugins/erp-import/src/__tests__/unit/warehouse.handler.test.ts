import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';
import { WarehouseHandler } from '../../handlers/warehouse.handler';

const ctx = {} as RequestContext;
const record = {
    erpId: 'wh-1',
    name: 'Warehouse 1',
    branchErpId: 'branch-a',
    isActive: true,
};

function build(rows: Array<{ id: string } | undefined>) {
    const getRawOne = vi.fn();
    for (const row of rows) getRawOne.mockResolvedValueOnce(row);
    const qb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getRawOne,
    };
    const warehouseService = { upsert: vi.fn(async () => ({})) };
    const stockLocationService = {
        create: vi.fn(async () => ({})),
        update: vi.fn(async () => ({})),
    };
    const connection = { rawConnection: { createQueryBuilder: () => qb } };
    const handler = new WarehouseHandler(
        warehouseService as never,
        stockLocationService as never,
        connection as never,
    );
    return { handler, warehouseService, stockLocationService };
}

describe('WarehouseHandler', () => {
    it('is a no-op for the stock location when one is already bound (idempotent re-run)', async () => {
        const { handler, warehouseService, stockLocationService } = build([{ id: '1' }]);
        await handler.upsert(ctx, record);
        expect(warehouseService.upsert).toHaveBeenCalledOnce();
        expect(stockLocationService.create).not.toHaveBeenCalled();
        expect(stockLocationService.update).not.toHaveBeenCalled();
    });

    it('adopts an unbound stock location by name, keeping the stock held there', async () => {
        const { handler, stockLocationService } = build([undefined, { id: '7' }]);
        await handler.upsert(ctx, { ...record, stockLocationName: 'Default Stock Location' });
        expect(stockLocationService.update).toHaveBeenCalledWith(ctx, {
            id: '7',
            customFields: { warehouseErpId: 'wh-1' },
        });
        expect(stockLocationService.create).not.toHaveBeenCalled();
    });

    it('creates a new stock location when nothing is bound or adoptable', async () => {
        const { handler, stockLocationService } = build([undefined]);
        await handler.upsert(ctx, record);
        expect(stockLocationService.create).toHaveBeenCalledWith(ctx, {
            name: 'Warehouse 1',
            customFields: { warehouseErpId: 'wh-1' },
        });
    });
});
