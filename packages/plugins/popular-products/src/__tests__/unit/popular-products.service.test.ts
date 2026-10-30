import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PopularProductsService } from '../../popular-products.service';
import { StockScopedIdsService } from '../../stock-scoped-ids.service';

vi.mock('@mivend/plugin-reservation', () => ({
    StockLevelService: class {},
    andProductInStock: (query: { andWhere: (sql: string, p: unknown) => unknown }, ids: string[]) =>
        query.andWhere('IN_STOCK', { warehouseErpIds: ids }),
}));

const mockQb = {
    innerJoin: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    select: vi.fn(),
    addSelect: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    addOrderBy: vi.fn(),
    limit: vi.fn(),
    getRawMany: vi.fn(),
};
mockQb.innerJoin.mockReturnValue(mockQb);
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);
mockQb.select.mockReturnValue(mockQb);
mockQb.addSelect.mockReturnValue(mockQb);
mockQb.groupBy.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.addOrderBy.mockReturnValue(mockQb);
mockQb.limit.mockReturnValue(mockQb);

const mockRepo = { createQueryBuilder: vi.fn(() => mockQb) };
const mockConnection = { getRepository: vi.fn(() => mockRepo) };
const mockCtx = { channelId: 4 } as unknown as RequestContext;

const viewerWarehouses = vi.fn();

describe('PopularProductsService', () => {
    let service: PopularProductsService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockQb.innerJoin.mockReturnValue(mockQb);
        mockQb.where.mockReturnValue(mockQb);
        mockQb.andWhere.mockReturnValue(mockQb);
        mockQb.select.mockReturnValue(mockQb);
        mockQb.addSelect.mockReturnValue(mockQb);
        mockQb.groupBy.mockReturnValue(mockQb);
        mockQb.orderBy.mockReturnValue(mockQb);
        mockQb.addOrderBy.mockReturnValue(mockQb);
        mockQb.limit.mockReturnValue(mockQb);
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        viewerWarehouses.mockResolvedValue(['wh-1']);
        service = new PopularProductsService(
            mockConnection as unknown as TransactionalConnection,
            new StockScopedIdsService({
                getViewerWarehouseErpIds: viewerWarehouses,
            } as never),
        );
    });

    const rank = (...ids: number[]): void => {
        mockQb.getRawMany.mockResolvedValueOnce(ids.map(productId => ({ productId })));
    };

    it('ranking excludes AddingItems and Cancelled orders, disabled and deleted products, other channels', async () => {
        rank();
        await service.getPopularProductIds(mockCtx);
        expect(mockQb.where).toHaveBeenCalledWith('order.state NOT IN (:...excluded)', {
            excluded: ['AddingItems', 'Cancelled'],
        });
        expect(mockQb.andWhere).toHaveBeenCalledWith('product.deletedAt IS NULL');
        expect(mockQb.andWhere).toHaveBeenCalledWith('product.enabled = true');
        expect(mockQb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('product_channels_channel'),
            { channelId: 4 },
        );
        expect(mockQb.limit).toHaveBeenCalledWith(500);
    });

    it('returns ranked ids that are in stock, as strings', async () => {
        rank(5, 2);
        mockQb.getRawMany.mockResolvedValueOnce([{ productId: 5 }, { productId: 2 }]);
        expect(await service.getPopularProductIds(mockCtx)).toEqual(['5', '2']);
        expect(mockQb.where).toHaveBeenCalledWith('product.id IN (:...ranked)', { ranked: [5, 2] });
    });

    it('defaults to 12 and caps take at 50', async () => {
        rank(1);
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx);
        await service.getPopularProductIds(mockCtx, 500);
        await service.getPopularProductIds(mockCtx, 5);
        expect(mockQb.limit.mock.calls.map(call => call[0])).toEqual([500, 36, 150, 15]);
    });

    it('restricts the final list to the request channel and viewer warehouses', async () => {
        rank(1);
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx);
        expect(mockQb.andWhere).toHaveBeenCalledWith('IN_STOCK', { warehouseErpIds: ['wh-1'] });
        expect(mockQb.andWhere).toHaveBeenCalledWith(
            expect.stringContaining('product_channels_channel'),
            { channelId: 4 },
        );
    });

    it('shares the ranking per channel within the TTL and reloads for another channel', async () => {
        rank(1);
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx);
        await service.getPopularProductIds(mockCtx);
        expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(3);
        rank(1);
        await service.getPopularProductIds({ channelId: 9 } as unknown as RequestContext);
        expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(5);
    });

    it('does not keep a failed ranking in the cache', async () => {
        mockQb.getRawMany.mockRejectedValueOnce(new Error('db down'));
        await expect(service.getPopularProductIds(mockCtx)).rejects.toThrow('db down');
        rank();
        expect(await service.getPopularProductIds(mockCtx)).toEqual([]);
    });

    it('returns nothing without a final query when nothing is ranked', async () => {
        rank();
        expect(await service.getPopularProductIds(mockCtx)).toEqual([]);
        expect(mockRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    });

    it('returns nothing without a final query when the viewer has no warehouses', async () => {
        viewerWarehouses.mockResolvedValue([]);
        rank(1);
        expect(await service.getPopularProductIds(mockCtx)).toEqual([]);
        expect(mockQb.getRawMany).toHaveBeenCalledTimes(1);
    });
});
