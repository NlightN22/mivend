import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { CrossReferenceService } from '../../cross-reference.service';
import { ProductCrossReference } from '../../entities/product-cross-reference.entity';

const mockRepo = {
    find: vi.fn(),
    delete: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
} as unknown as TransactionalConnection;

const mockCtx = {} as unknown as RequestContext;

describe('CrossReferenceService', () => {
    let service: CrossReferenceService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CrossReferenceService(mockConnection);
    });

    describe('findByProductId', () => {
        it('returns refs for the given productId', async () => {
            const refs = [
                { productId: 1, oemCode: '5013135', oemBrand: 'Ford' },
                { productId: 1, oemCode: '1498427', oemBrand: 'Ford' },
            ] as ProductCrossReference[];
            mockRepo.find.mockResolvedValue(refs);

            const result = await service.findByProductId(mockCtx, 1);

            expect(mockRepo.find).toHaveBeenCalledWith({ where: { productId: 1 } });
            expect(result).toEqual(refs);
        });

        it('returns empty array when no refs exist', async () => {
            mockRepo.find.mockResolvedValue([]);

            const result = await service.findByProductId(mockCtx, 99);

            expect(result).toEqual([]);
        });
    });

    describe('upsertForProduct', () => {
        it('deletes existing refs then saves new ones', async () => {
            mockRepo.delete.mockResolvedValue({});
            mockRepo.create.mockImplementation(data => data);
            mockRepo.save.mockResolvedValue([]);

            await service.upsertForProduct(mockCtx, 1, [
                { oemCode: '5013135', oemBrand: 'Ford' },
                { oemCode: '1498427', oemBrand: 'Ford' },
            ]);

            expect(mockRepo.delete).toHaveBeenCalledWith({ productId: 1 });
            expect(mockRepo.create).toHaveBeenCalledTimes(2);
            expect(mockRepo.save).toHaveBeenCalledWith([
                { productId: 1, oemCode: '5013135', oemBrand: 'Ford' },
                { productId: 1, oemCode: '1498427', oemBrand: 'Ford' },
            ]);
        });

        it('deletes existing refs and skips save when refs array is empty', async () => {
            mockRepo.delete.mockResolvedValue({});

            await service.upsertForProduct(mockCtx, 1, []);

            expect(mockRepo.delete).toHaveBeenCalledWith({ productId: 1 });
            expect(mockRepo.save).not.toHaveBeenCalled();
        });

        it('creates entity with correct productId for each ref', async () => {
            mockRepo.delete.mockResolvedValue({});
            mockRepo.create.mockImplementation(data => ({ ...data }));
            mockRepo.save.mockResolvedValue([]);

            await service.upsertForProduct(mockCtx, 42, [{ oemCode: 'N0136765', oemBrand: 'BMW' }]);

            expect(mockRepo.create).toHaveBeenCalledWith({
                productId: 42,
                oemCode: 'N0136765',
                oemBrand: 'BMW',
            });
        });
    });
});
