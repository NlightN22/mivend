import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { PriceEntryService } from '../../price-entry.service';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
};

const mockQb = {
    insert: vi.fn(),
    into: vi.fn(),
    values: vi.fn(),
    orUpdate: vi.fn(),
    execute: vi.fn(),
    where: vi.fn(),
    andWhere: vi.fn(),
    getMany: vi.fn(),
};
// chain returns this except execute/getMany
mockQb.insert.mockReturnValue(mockQb);
mockQb.into.mockReturnValue(mockQb);
mockQb.values.mockReturnValue(mockQb);
mockQb.orUpdate.mockReturnValue(mockQb);
mockQb.where.mockReturnValue(mockQb);
mockQb.andWhere.mockReturnValue(mockQb);

const mockRawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
    rawConnection: { query: mockRawQuery },
};

const mockCtx = {} as unknown as RequestContext;

describe('PriceEntryService', () => {
    let service: PriceEntryService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.createQueryBuilder.mockReturnValue(mockQb);
        service = new PriceEntryService(mockConnection as unknown as TransactionalConnection);
    });

    describe('upsert', () => {
        it('creates new record when none exists', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            const created = { variantId: 'v1', priceTypeCode: 'RETAIL', price: 1000 };
            mockRepo.create.mockReturnValue(created);
            mockRepo.save.mockResolvedValue(created);

            const result = await service.upsert(mockCtx, 'v1', 'RETAIL', 1000);

            expect(mockRepo.create).toHaveBeenCalledWith({
                variantId: 'v1',
                priceTypeCode: 'RETAIL',
                price: 1000,
            });
            expect(mockRepo.save).toHaveBeenCalledWith(created);
            expect(result).toEqual(created);
        });

        it('updates price when record already exists', async () => {
            const existing = { variantId: 'v1', priceTypeCode: 'RETAIL', price: 500 };
            mockRepo.findOne.mockResolvedValue(existing);
            mockRepo.save.mockResolvedValue({ ...existing, price: 1500 });

            await service.upsert(mockCtx, 'v1', 'RETAIL', 1500);

            expect(existing.price).toBe(1500);
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).toHaveBeenCalledWith(existing);
        });
    });

    describe('bulkUpsert', () => {
        it('returns 0 and skips DB for empty array', async () => {
            const result = await service.bulkUpsert(mockCtx, []);

            expect(result).toBe(0);
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('executes insert+orUpdate and returns entries count', async () => {
            mockQb.execute.mockResolvedValue({});
            const entries = [
                { variantId: 'v1', priceTypeCode: 'RETAIL', price: 100 },
                { variantId: 'v2', priceTypeCode: 'RETAIL', price: 200 },
            ];

            const result = await service.bulkUpsert(mockCtx, entries);

            expect(mockRepo.createQueryBuilder).toHaveBeenCalled();
            expect(mockQb.insert).toHaveBeenCalled();
            expect(mockQb.orUpdate).toHaveBeenCalledWith(['price'], ['variantId', 'priceTypeCode']);
            expect(mockQb.execute).toHaveBeenCalled();
            expect(result).toBe(2);
        });
    });

    describe('getForVariant', () => {
        it('returns numeric price when record found', async () => {
            mockRepo.findOne.mockResolvedValue({
                variantId: 'v1',
                priceTypeCode: 'RETAIL',
                price: '2500',
            });

            const result = await service.getForVariant(mockCtx, 'v1', 'RETAIL');

            expect(result).toBe(2500);
        });

        it('returns null when record not found', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            const result = await service.getForVariant(mockCtx, 'v1', 'RETAIL');

            expect(result).toBeNull();
        });
    });

    describe('getForVariants', () => {
        it('returns empty Map without DB call for empty ids', async () => {
            const result = await service.getForVariants(mockCtx, [], 'RETAIL');

            expect(result.size).toBe(0);
            expect(mockRepo.createQueryBuilder).not.toHaveBeenCalled();
        });

        it('returns Map of variantId to price', async () => {
            mockQb.getMany.mockResolvedValue([
                { variantId: 'v1', price: '100' },
                { variantId: 'v2', price: '200' },
            ]);

            const result = await service.getForVariants(mockCtx, ['v1', 'v2'], 'RETAIL');

            expect(result.get('v1')).toBe(100);
            expect(result.get('v2')).toBe(200);
            expect(result.size).toBe(2);
        });
    });

    describe('getPriceTypeCodeForUser', () => {
        it('returns null when activeUserId is absent', async () => {
            const ctx = { activeUserId: undefined } as unknown as RequestContext;

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBeNull();
            expect(mockRawQuery).not.toHaveBeenCalled();
        });

        it('returns code from query result', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([{ code: 'WHOLESALE' }]);

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBe('WHOLESALE');
        });

        it('returns null when query returns empty array', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([]);

            const result = await service.getPriceTypeCodeForUser(ctx);

            expect(result).toBeNull();
        });
    });
});
