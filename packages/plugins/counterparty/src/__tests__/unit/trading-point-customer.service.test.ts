import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import { TradingPoint } from '../../entities/trading-point.entity';
import { ContactPerson } from '../../entities/contact-person.entity';

const mockTpRepo = {
    find: vi.fn(),
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
};

const mockCpRepo = {
    create: vi.fn(),
    delete: vi.fn(),
};

const mockRawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn((ctx, entity) => {
        if (entity === TradingPoint) return mockTpRepo;
        if (entity === ContactPerson) return mockCpRepo;
        return mockTpRepo;
    }),
    rawConnection: { query: mockRawQuery },
};

const mockCustomerService = {} as unknown as CustomerService;
const mockCtx = {} as unknown as RequestContext;

describe('TradingPointService — customer methods', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
        );
    });

    describe('findVisibleForCounterparty', () => {
        it('queries with isActive=true and customerStatus=active', async () => {
            mockTpRepo.find.mockResolvedValue([]);

            await service.findVisibleForCounterparty(mockCtx, 'cp1');

            expect(mockTpRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { counterpartyId: 'cp1', isActive: true, customerStatus: 'active' },
                }),
            );
        });
    });

    describe('findHiddenForCounterparty', () => {
        it('queries with customerStatus=hidden', async () => {
            mockTpRepo.find.mockResolvedValue([]);

            await service.findHiddenForCounterparty(mockCtx, 'cp1');

            expect(mockTpRepo.find).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { counterpartyId: 'cp1', customerStatus: 'hidden' },
                }),
            );
        });
    });

    describe('getCounterpartyIdForUser', () => {
        it('returns null when activeUserId is absent', async () => {
            const ctx = { activeUserId: undefined } as unknown as RequestContext;

            const result = await service.getCounterpartyIdForUser(ctx);

            expect(result).toBeNull();
            expect(mockRawQuery).not.toHaveBeenCalled();
        });

        it('returns cid from query result', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([{ cid: 'cp42' }]);

            const result = await service.getCounterpartyIdForUser(ctx);

            expect(result).toBe('cp42');
        });

        it('returns null when query result is empty', async () => {
            const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
            mockRawQuery.mockResolvedValue([]);

            const result = await service.getCounterpartyIdForUser(ctx);

            expect(result).toBeNull();
        });
    });

    describe('customerAdd', () => {
        it('creates TradingPoint with customerStatus=active, customerOwned=true, erpId starting with cust_', async () => {
            const contact = { name: 'Ivan', phone: '+7999', email: null, isPrimary: true };
            mockCpRepo.create.mockReturnValue(contact);
            const tp = {
                id: 'tp1',
                erpId: 'cust_abc',
                customerStatus: 'active',
                customerOwned: true,
                contacts: [contact],
            };
            mockTpRepo.create.mockReturnValue(tp);
            mockTpRepo.save.mockResolvedValue(tp);

            const result = await service.customerAdd(mockCtx, 'cp1', {
                name: 'Point A',
                address: 'Addr 1',
                contactName: 'Ivan',
                contactPhone: '+7999',
            });

            const createCall = mockTpRepo.create.mock.calls[0][0];
            expect(createCall.erpId).toMatch(/^cust_/);
            expect(createCall.customerStatus).toBe('active');
            expect(createCall.customerOwned).toBe(true);
            expect(createCall.counterpartyId).toBe('cp1');
            expect(result).toEqual(tp);
        });

        it('creates ContactPerson when contactName provided', async () => {
            const contact = { name: 'Ivan', phone: null, email: null, isPrimary: true };
            mockCpRepo.create.mockReturnValue(contact);
            const tp = { id: 'tp1', contacts: [contact] };
            mockTpRepo.create.mockReturnValue(tp);
            mockTpRepo.save.mockResolvedValue(tp);

            await service.customerAdd(mockCtx, 'cp1', {
                name: 'P',
                address: 'A',
                contactName: 'Ivan',
            });

            expect(mockCpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Ivan', isPrimary: true }),
            );
            const createCall = mockTpRepo.create.mock.calls[0][0];
            expect(createCall.contacts).toHaveLength(1);
        });

        it('creates no ContactPerson when contactName is null', async () => {
            const tp = { id: 'tp1', contacts: [] };
            mockTpRepo.create.mockReturnValue(tp);
            mockTpRepo.save.mockResolvedValue(tp);

            await service.customerAdd(mockCtx, 'cp1', {
                name: 'P',
                address: 'A',
                contactName: null,
            });

            expect(mockCpRepo.create).not.toHaveBeenCalled();
            const createCall = mockTpRepo.create.mock.calls[0][0];
            expect(createCall.contacts).toHaveLength(0);
        });
    });

    describe('customerDelete', () => {
        it('sets customerStatus=hidden when record found', async () => {
            mockTpRepo.findOne.mockResolvedValue({ id: 'tp1', counterpartyId: 'cp1' });
            mockTpRepo.update.mockResolvedValue({});

            const result = await service.customerDelete(mockCtx, 'tp1', 'cp1');

            expect(mockTpRepo.update).toHaveBeenCalledWith(
                { id: 'tp1' },
                { customerStatus: 'hidden' },
            );
            expect(result).toBe(true);
        });

        it('throws UserInputError when record not found', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);

            await expect(service.customerDelete(mockCtx, 'tp99', 'cp1')).rejects.toThrow(
                UserInputError,
            );
        });
    });

    describe('customerRestore', () => {
        it('sets customerStatus=active and isActive=true when found', async () => {
            const tp = { id: 'tp1', counterpartyId: 'cp1', contacts: [] };
            mockTpRepo.findOne.mockResolvedValueOnce(tp).mockResolvedValueOnce(tp);
            mockTpRepo.update.mockResolvedValue({});

            await service.customerRestore(mockCtx, 'tp1', 'cp1');

            expect(mockTpRepo.update).toHaveBeenCalledWith(
                { id: 'tp1' },
                { customerStatus: 'active', isActive: true },
            );
        });

        it('throws UserInputError when record not found', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);

            await expect(service.customerRestore(mockCtx, 'tp99', 'cp1')).rejects.toThrow(
                UserInputError,
            );
        });
    });
});
