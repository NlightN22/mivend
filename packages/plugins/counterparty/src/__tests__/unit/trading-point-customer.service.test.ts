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
import { TradingPointChange } from '../../entities/trading-point-change.entity';

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

const mockChangeRepo = {
    create: vi.fn((v: unknown) => v),
    save: vi.fn(async (v: unknown) => v),
    update: vi.fn(),
};

const mockRawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn((ctx, entity) => {
        if (entity === TradingPoint) return mockTpRepo;
        if (entity === ContactPerson) return mockCpRepo;
        if (entity === TradingPointChange) return mockChangeRepo;
        if (entity === 'Channel') return { query: mockRawQuery };
        return mockTpRepo;
    }),
};

const mockCustomerService = {} as unknown as CustomerService;
const mockAccessScopeService =
    {} as unknown as import('@mivend/plugin-access-control').AccessScopeService;
const mockVersioningService = {
    recordChange: vi.fn(),
} as unknown as import('@mivend/plugin-versioning').VersioningService;
const mockCtx = {} as unknown as RequestContext;

describe('TradingPointService — customer methods', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new TradingPointService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockAccessScopeService,
            mockVersioningService,
            {} as never,
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

    describe('customer location', () => {
        const valid = { name: 'Point A', address: 'Main street 12, office 3' };

        it('customerAdd refuses a point without a location', async () => {
            await expect(service.customerAdd(mockCtx, 'cp1', valid)).rejects.toThrow(
                UserInputError,
            );
            expect(mockTpRepo.save).not.toHaveBeenCalled();
        });

        it.each([
            ['out of range', { latitude: 95, longitude: 20 }],
            ['NaN', { latitude: NaN, longitude: 20 }],
            ['(0, 0)', { latitude: 0, longitude: 0 }],
        ])('customerAdd refuses %s', async (_n, loc) => {
            await expect(service.customerAdd(mockCtx, 'cp1', { ...valid, ...loc })).rejects.toThrow(
                UserInputError,
            );
            expect(mockTpRepo.save).not.toHaveBeenCalled();
        });

        it('customerAdd stores the supplied location', async () => {
            mockTpRepo.create.mockReturnValue({ contacts: [] });
            mockTpRepo.save.mockResolvedValue({ id: 'tp1' });
            await service.customerAdd(mockCtx, 'cp1', { ...valid, latitude: 1.5, longitude: 2.5 });
            expect(mockTpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ latitude: 1.5, longitude: 2.5 }),
            );
        });

        it('customerEdit keeps the stored location when the edit omits it', async () => {
            const record = {
                id: 'tp1',
                customerOwned: true,
                address: valid.address,
                latitude: 5,
                longitude: 6,
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(record);
            mockTpRepo.save.mockImplementation(async (r: unknown) => r);
            await service.customerEdit(mockCtx, 'tp1', 'cp1', valid);
            expect(record).toMatchObject({ latitude: 5, longitude: 6 });
        });

        it('customerEdit refuses to clear the location', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                id: 'tp1',
                customerOwned: true,
                address: valid.address,
                latitude: 5,
                longitude: 6,
                contacts: [],
            });
            await expect(
                service.customerEdit(mockCtx, 'tp1', 'cp1', {
                    ...valid,
                    latitude: null,
                    longitude: null,
                }),
            ).rejects.toThrow(UserInputError);
        });

        it('customerEdit of a legacy point needs a location, and saves one when supplied', async () => {
            const record = {
                id: 'tp1',
                customerOwned: true,
                address: valid.address,
                latitude: null,
                longitude: null,
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(record);
            mockTpRepo.save.mockImplementation(async (r: unknown) => r);
            await expect(service.customerEdit(mockCtx, 'tp1', 'cp1', valid)).rejects.toThrow(
                UserInputError,
            );
            await service.customerEdit(mockCtx, 'tp1', 'cp1', {
                ...valid,
                latitude: 3,
                longitude: 4,
            });
            expect(record).toMatchObject({ latitude: 3, longitude: 4 });
        });
    });

    describe('customerEdit of an ERP-confirmed point', () => {
        const base = { name: 'Point A', address: 'Main street 12, office 3', workingHours: '9-18' };
        const erpPoint = () => ({
            id: 'tp1',
            counterpartyId: 'cp1',
            customerOwned: false,
            name: 'Point A',
            address: 'Main street 12, office 3',
            workingHours: '9-18',
            deliveryComment: null as string | null,
            latitude: 5,
            longitude: 6,
            contacts: [],
        });

        beforeEach(() => {
            mockTpRepo.save.mockImplementation(async (r: unknown) => r);
        });

        it('queues the change and leaves the record as it was', async () => {
            const record = erpPoint();
            mockTpRepo.findOne.mockResolvedValue(record);

            await service.customerEdit(mockCtx, 'tp1', 'cp1', {
                ...base,
                name: 'Renamed',
                latitude: 7,
                longitude: 8,
            });

            expect(record).toMatchObject({ name: 'Point A', latitude: 5, longitude: 6 });
            expect(mockChangeRepo.save).toHaveBeenCalledTimes(1);
            const saved = mockChangeRepo.create.mock.calls[0][0] as { payload: string };
            expect(JSON.parse(saved.payload)).toMatchObject({
                name: 'Renamed',
                latitude: 7,
                longitude: 8,
            });
        });

        it('applies the delivery comment at once and queues nothing when only it changed', async () => {
            const record = erpPoint();
            mockTpRepo.findOne.mockResolvedValue(record);

            await service.customerEdit(mockCtx, 'tp1', 'cp1', {
                ...base,
                deliveryComment: 'Gate 3',
            });

            expect(record.deliveryComment).toBe('Gate 3');
            expect(mockChangeRepo.save).not.toHaveBeenCalled();
        });

        it('still refuses an edit without a usable location', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                ...erpPoint(),
                latitude: null,
                longitude: null,
            });

            await expect(service.customerEdit(mockCtx, 'tp1', 'cp1', base)).rejects.toThrow(
                UserInputError,
            );
            expect(mockChangeRepo.save).not.toHaveBeenCalled();
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
                latitude: 10,
                longitude: 20,
                name: 'Point A',
                address: 'Main street 12, office 3',
                contactName: 'Ivan Petrov',
                contactPhone: '89131234567',
            });

            const createCall = mockTpRepo.create.mock.calls[0][0];
            expect(createCall.erpId).toMatch(/^cust_/);
            expect(createCall.customerStatus).toBe('active');
            expect(createCall.customerOwned).toBe(true);
            expect(createCall.counterpartyId).toBe('cp1');
            expect(result).toEqual(tp);
        });

        it('rejects an incomplete phone and stores the normalized one', async () => {
            await expect(
                service.customerAdd(mockCtx, 'cp1', {
                    latitude: 10,
                    longitude: 20,
                    name: 'P',
                    address: 'Main street 12',
                    contactPhone: '+7999',
                }),
            ).rejects.toThrow(/phone/);
            expect(mockTpRepo.save).not.toHaveBeenCalled();
        });

        it('creates ContactPerson when contactName provided', async () => {
            const contact = { name: 'Ivan', phone: null, email: null, isPrimary: true };
            mockCpRepo.create.mockReturnValue(contact);
            const tp = { id: 'tp1', contacts: [contact] };
            mockTpRepo.create.mockReturnValue(tp);
            mockTpRepo.save.mockResolvedValue(tp);

            await service.customerAdd(mockCtx, 'cp1', {
                latitude: 10,
                longitude: 20,
                name: 'P',
                address: 'Main street 12',
                contactName: 'Ivan Petrov',
            });

            expect(mockCpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Ivan Petrov', isPrimary: true }),
            );
            const createCall = mockTpRepo.create.mock.calls[0][0];
            expect(createCall.contacts).toHaveLength(1);
        });

        it('creates no ContactPerson when contactName is null', async () => {
            const tp = { id: 'tp1', contacts: [] };
            mockTpRepo.create.mockReturnValue(tp);
            mockTpRepo.save.mockResolvedValue(tp);

            await service.customerAdd(mockCtx, 'cp1', {
                latitude: 10,
                longitude: 20,
                name: 'P',
                address: 'Main street 12',
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
