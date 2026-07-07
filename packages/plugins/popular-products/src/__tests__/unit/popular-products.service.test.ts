import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PopularProductsService } from '../../popular-products.service';

const mockQb = {
    innerJoin: vi.fn(),
    where: vi.fn(),
    select: vi.fn(),
    addSelect: vi.fn(),
    groupBy: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    getRawMany: vi.fn(),
};
mockQb.innerJoin.mockReturnValue(mockQb);
mockQb.where.mockReturnValue(mockQb);
mockQb.select.mockReturnValue(mockQb);
mockQb.addSelect.mockReturnValue(mockQb);
mockQb.groupBy.mockReturnValue(mockQb);
mockQb.orderBy.mockReturnValue(mockQb);
mockQb.limit.mockReturnValue(mockQb);

const mockRepo = { createQueryBuilder: vi.fn(() => mockQb) };
const mockConnection = { getRepository: vi.fn(() => mockRepo) };
const mockCtx = {} as unknown as RequestContext;

describe('PopularProductsService', () => {
    let service: PopularProductsService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockQb.innerJoin.mockReturnValue(mockQb);
        mockQb.where.mockReturnValue(mockQb);
        mockQb.select.mockReturnValue(mockQb);
        mockQb.addSelect.mockReturnValue(mockQb);
        mockQb.groupBy.mockReturnValue(mockQb);
        mockQb.orderBy.mockReturnValue(mockQb);
        mockQb.limit.mockReturnValue(mockQb);
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        service = new PopularProductsService(mockConnection as unknown as TransactionalConnection);
    });

    it('excludes AddingItems and Cancelled orders from the ranking', async () => {
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx);
        expect(mockQb.where).toHaveBeenCalledWith('order.state NOT IN (:...excluded)', {
            excluded: ['AddingItems', 'Cancelled'],
        });
    });

    it('returns product ids ranked by total quantity, as strings', async () => {
        mockQb.getRawMany.mockResolvedValue([
            { productId: 5, totalQty: '42' },
            { productId: 2, totalQty: '10' },
        ]);
        const result = await service.getPopularProductIds(mockCtx);
        expect(result).toEqual(['5', '2']);
    });

    it('defaults to 12 when no take is given', async () => {
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx);
        expect(mockQb.limit).toHaveBeenCalledWith(12);
    });

    it('caps take at 50 even if a larger value is requested', async () => {
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx, 500);
        expect(mockQb.limit).toHaveBeenCalledWith(50);
    });

    it('passes through a valid take within bounds', async () => {
        mockQb.getRawMany.mockResolvedValue([]);
        await service.getPopularProductIds(mockCtx, 5);
        expect(mockQb.limit).toHaveBeenCalledWith(5);
    });
});
