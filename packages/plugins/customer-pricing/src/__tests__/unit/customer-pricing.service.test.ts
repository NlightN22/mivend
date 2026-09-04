import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { CustomerPricingService } from '../../customer-pricing.service';

const retailPriceType = { id: '1', code: 'RETAIL', name: 'Retail', isActive: true };
const wholesalePriceType = { id: '2', code: 'WHOLESALE', name: 'Wholesale', isActive: true };

const mockPriceTypeRepo = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
};
const mockCustomerPriceTypeRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
};
const mockConnection = {
    getRepository: vi.fn((ctx, entity) => {
        const name = entity?.name ?? '';
        return name === 'PriceType' ? mockPriceTypeRepo : mockCustomerPriceTypeRepo;
    }),
};
const mockCustomerService = { findOne: vi.fn() };
const mockOptions = { defaultPriceTypeCode: 'RETAIL' };
const mockCtx = {} as unknown as RequestContext;

describe('CustomerPricingService', () => {
    let service: CustomerPricingService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CustomerPricingService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService as unknown as CustomerService,
            mockOptions,
        );
    });

    describe('getCustomerPriceType', () => {
        it('returns stored price type when assignment exists', async () => {
            mockCustomerPriceTypeRepo.findOne.mockResolvedValue({
                customerId: '1',
                priceType: wholesalePriceType,
            });

            const result = await service.getCustomerPriceType(mockCtx, '1');

            expect(result).toEqual(wholesalePriceType);
        });

        it('returns default price type by code when no assignment', async () => {
            mockCustomerPriceTypeRepo.findOne.mockResolvedValue(null);
            mockPriceTypeRepo.findOne.mockResolvedValue(retailPriceType);

            const result = await service.getCustomerPriceType(mockCtx, '99');

            expect(result).toEqual(retailPriceType);
            expect(mockPriceTypeRepo.findOne).toHaveBeenCalledWith({
                where: { code: 'RETAIL' },
            });
        });

        it('returns null when no assignment and no default configured', async () => {
            const serviceNoDefault = new CustomerPricingService(
                mockConnection as unknown as TransactionalConnection,
                mockCustomerService as unknown as CustomerService,
                {},
            );
            mockCustomerPriceTypeRepo.findOne.mockResolvedValue(null);

            const result = await serviceNoDefault.getCustomerPriceType(mockCtx, '99');

            expect(result).toBeNull();
        });
    });

    describe('setCustomerPriceType', () => {
        it('creates new assignment when none exists', async () => {
            mockCustomerService.findOne.mockResolvedValue({ id: '1' });
            mockPriceTypeRepo.findOne.mockResolvedValue(wholesalePriceType);
            mockCustomerPriceTypeRepo.findOne.mockResolvedValue(null);
            const newRecord = { customerId: '1', priceType: wholesalePriceType };
            mockCustomerPriceTypeRepo.create.mockReturnValue(newRecord);
            mockCustomerPriceTypeRepo.save.mockResolvedValue(newRecord);

            await service.setCustomerPriceType(mockCtx, '1', '2');

            expect(mockCustomerPriceTypeRepo.create).toHaveBeenCalledWith({
                customerId: '1',
                priceType: wholesalePriceType,
            });
            expect(mockCustomerPriceTypeRepo.save).toHaveBeenCalledWith(newRecord);
        });

        it('updates existing assignment', async () => {
            mockCustomerService.findOne.mockResolvedValue({ id: '1' });
            mockPriceTypeRepo.findOne.mockResolvedValue(wholesalePriceType);
            const existing = { customerId: '1', priceType: retailPriceType };
            mockCustomerPriceTypeRepo.findOne.mockResolvedValue(existing);
            mockCustomerPriceTypeRepo.save.mockResolvedValue(existing);

            await service.setCustomerPriceType(mockCtx, '1', '2');

            expect(existing.priceType).toEqual(wholesalePriceType);
            expect(mockCustomerPriceTypeRepo.create).not.toHaveBeenCalled();
        });

        it('throws when customer not found', async () => {
            mockCustomerService.findOne.mockResolvedValue(undefined);

            await expect(service.setCustomerPriceType(mockCtx, '999', '1')).rejects.toThrow();
        });

        it('throws when price type not found', async () => {
            mockCustomerService.findOne.mockResolvedValue({ id: '1' });
            mockPriceTypeRepo.findOne.mockResolvedValue(null);

            await expect(service.setCustomerPriceType(mockCtx, '1', '999')).rejects.toThrow();
        });
    });

    describe('upsertPriceType', () => {
        it('creates new price type when code does not exist', async () => {
            mockPriceTypeRepo.findOne.mockResolvedValue(null);
            const created = { code: 'DEALER', name: 'Dealer', isActive: true };
            mockPriceTypeRepo.create.mockReturnValue(created);
            mockPriceTypeRepo.save.mockResolvedValue(created);

            const result = await service.upsertPriceType(mockCtx, 'DEALER', 'Dealer');

            expect(mockPriceTypeRepo.create).toHaveBeenCalledWith({
                code: 'DEALER',
                name: 'Dealer',
                isActive: true,
            });
            expect(result).toEqual(created);
        });

        it('updates name when price type already exists', async () => {
            const existing = { code: 'RETAIL', name: 'Old Name', isActive: false };
            mockPriceTypeRepo.findOne.mockResolvedValue(existing);
            mockPriceTypeRepo.save.mockResolvedValue({
                ...existing,
                name: 'Retail',
                isActive: true,
            });

            await service.upsertPriceType(mockCtx, 'RETAIL', 'Retail');

            expect(existing.name).toBe('Retail');
            expect(existing.isActive).toBe(true);
            expect(mockPriceTypeRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('upsertPriceTypeByExternalId', () => {
        it('creates a new price type with a slugified code when externalId is unseen', async () => {
            mockPriceTypeRepo.findOne.mockResolvedValueOnce(null); // find by externalId
            mockPriceTypeRepo.findOne.mockResolvedValueOnce(null); // code collision check
            const created = {
                externalId: 'guid-1',
                code: 'wholesale',
                name: 'Wholesale',
                isActive: true,
            };
            mockPriceTypeRepo.create.mockReturnValue(created);
            mockPriceTypeRepo.save.mockResolvedValue(created);

            const result = await service.upsertPriceTypeByExternalId(
                mockCtx,
                'guid-1',
                'Wholesale',
                true,
            );

            expect(mockPriceTypeRepo.create).toHaveBeenCalledWith({
                externalId: 'guid-1',
                code: 'wholesale',
                name: 'Wholesale',
                isActive: true,
            });
            expect(result).toEqual(created);
        });

        it('transliterates Cyrillic names into an ASCII slug', async () => {
            mockPriceTypeRepo.findOne.mockResolvedValueOnce(null);
            mockPriceTypeRepo.findOne.mockResolvedValueOnce(null);
            mockPriceTypeRepo.create.mockImplementation(input => input);
            mockPriceTypeRepo.save.mockImplementation(input => Promise.resolve(input));

            const result = await service.upsertPriceTypeByExternalId(
                mockCtx,
                'guid-2',
                'Опт',
                true,
            );

            expect(result.code).toBe('opt');
        });

        it('dedupes a slug collision by appending a numeric suffix', async () => {
            mockPriceTypeRepo.findOne
                .mockResolvedValueOnce(null) // find by externalId
                .mockResolvedValueOnce({ code: 'wholesale' }) // collision on base slug
                .mockResolvedValueOnce(null); // free
            mockPriceTypeRepo.create.mockImplementation(input => input);
            mockPriceTypeRepo.save.mockImplementation(input => Promise.resolve(input));

            const result = await service.upsertPriceTypeByExternalId(
                mockCtx,
                'guid-3',
                'Wholesale',
                true,
            );

            expect(result.code).toBe('wholesale-2');
        });

        it('updates name/isActive only, preserving the existing code on update', async () => {
            const existing = {
                externalId: 'guid-1',
                code: 'renamed-by-admin',
                name: 'Old',
                isActive: false,
            };
            mockPriceTypeRepo.findOne.mockResolvedValueOnce(existing);
            mockPriceTypeRepo.save.mockImplementation(input => Promise.resolve(input));

            const result = await service.upsertPriceTypeByExternalId(
                mockCtx,
                'guid-1',
                'New Name',
                true,
            );

            expect(result.code).toBe('renamed-by-admin');
            expect(result.name).toBe('New Name');
            expect(result.isActive).toBe(true);
            expect(mockPriceTypeRepo.create).not.toHaveBeenCalled();
        });
    });

    describe('findPriceTypeByExternalId', () => {
        it('finds a price type by externalId', async () => {
            mockPriceTypeRepo.findOne.mockResolvedValue(wholesalePriceType);

            const result = await service.findPriceTypeByExternalId(mockCtx, 'guid-1');

            expect(mockPriceTypeRepo.findOne).toHaveBeenCalledWith({
                where: { externalId: 'guid-1' },
            });
            expect(result).toEqual(wholesalePriceType);
        });

        it('returns null when no price type has that externalId', async () => {
            mockPriceTypeRepo.findOne.mockResolvedValue(null);

            const result = await service.findPriceTypeByExternalId(mockCtx, 'unknown-guid');

            expect(result).toBeNull();
        });
    });
});
