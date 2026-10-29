import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { HomeWidgetIdsService, NEW_DATE_SQL } from '../../home-widget-ids.service';
import { StockScopedIdsService } from '../../stock-scoped-ids.service';

vi.mock('@mivend/plugin-reservation', () => ({
    StockLevelService: class {},
    andProductInStock: (query: { andWhere: (sql: string, p: unknown) => unknown }, ids: string[]) =>
        query.andWhere('IN_STOCK', { warehouseErpIds: ids }),
}));

const qb = {
    select: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    limit: vi.fn(),
    getRawMany: vi.fn(),
};
const viewerWarehouses = vi.fn();
const ctx = {} as RequestContext;
let service: HomeWidgetIdsService;

beforeEach(() => {
    vi.clearAllMocks();
    for (const name of ['select', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'limit'] as const) {
        qb[name].mockReturnValue(qb);
    }
    qb.getRawMany.mockResolvedValue([{ productId: 7 }, { productId: 3 }]);
    viewerWarehouses.mockResolvedValue(['wh-1']);
    service = new HomeWidgetIdsService(
        {
            getRepository: () => ({ createQueryBuilder: () => qb }),
        } as unknown as TransactionalConnection,
        new StockScopedIdsService({ getViewerWarehouseErpIds: viewerWarehouses } as never),
    );
});

describe('HomeWidgetIdsService', () => {
    it('new arrivals: window on the ERP date with createdAt fallback, newest first, stock scoped, overfetched', async () => {
        const ids = await service.newArrivalProductIds(ctx, 12, 7);

        expect(ids).toEqual(['7', '3']);
        expect(qb.andWhere).toHaveBeenCalledWith(
            `${NEW_DATE_SQL} >= now() - make_interval(days => :days)`,
            { days: 7 },
        );
        expect(qb.orderBy).toHaveBeenCalledWith(NEW_DATE_SQL, 'DESC');
        expect(qb.andWhere).toHaveBeenCalledWith('IN_STOCK', { warehouseErpIds: ['wh-1'] });
        expect(qb.limit).toHaveBeenCalledWith(36);
    });

    it('new arrivals: clamps the window to 1..365 days', async () => {
        await service.newArrivalProductIds(ctx, 12, 100000);
        await service.newArrivalProductIds(ctx, 12, 0);

        const windows = qb.andWhere.mock.calls
            .filter(call => String(call[0]).includes('make_interval'))
            .map(call => call[1].days);
        expect(windows).toEqual([365, 1]);
    });

    it('sale: only onSale products, stock scoped', async () => {
        await service.saleProductIds(ctx, 40);

        expect(qb.andWhere).toHaveBeenCalledWith('product."customFieldsOnsale" = true');
        expect(qb.andWhere).toHaveBeenCalledWith('IN_STOCK', { warehouseErpIds: ['wh-1'] });
        expect(qb.limit).toHaveBeenCalledWith(120);
    });

    it('both return nothing for a viewer without branch warehouses', async () => {
        viewerWarehouses.mockResolvedValue([]);

        expect(await service.newArrivalProductIds(ctx)).toEqual([]);
        expect(await service.saleProductIds(ctx)).toEqual([]);
        expect(qb.getRawMany).not.toHaveBeenCalled();
    });
});
