import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import { TradingPoint } from '../../entities/trading-point.entity';
import { ContactPerson } from '../../entities/contact-person.entity';
import { TradingPointErp } from '../../entities/trading-point-erp.entity';

const mockFillExecute = vi.fn().mockResolvedValue(undefined);
const mockFillSet = vi.fn();
const mockFillWhere = vi.fn();
const mockFillBuilder = {
    update: vi.fn().mockReturnThis(),
    set: mockFillSet.mockReturnThis(),
    where: mockFillWhere.mockReturnThis(),
    execute: mockFillExecute,
};

const mockTpRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(() => mockFillBuilder),
};

const mockCpRepo = {};

const mockMirrorRow: Record<string, unknown> = {};
const mockMirrorRepo = {
    findOne: vi.fn(),
    create: vi.fn((v: Record<string, unknown>) => Object.assign(mockMirrorRow, v)),
    save: vi.fn(),
};

const mockRawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn((ctx, entity) => {
        if (entity === TradingPoint) return mockTpRepo;
        if (entity === ContactPerson) return mockCpRepo;
        if (entity === TradingPointErp) return mockMirrorRepo;
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

describe('TradingPointService — Kafka stream methods (issue #100)', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockMirrorRepo.findOne.mockResolvedValue(null);
        for (const key of Object.keys(mockMirrorRow)) delete mockMirrorRow[key];
        service = new TradingPointService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockAccessScopeService,
            mockVersioningService,
            {} as never,
        );
    });

    describe('findCounterpartyRefByErpId', () => {
        it('returns id+branchId when found', async () => {
            mockRawQuery.mockResolvedValue([{ id: 'cp1', branchId: 'branch-a' }]);

            const result = await service.findCounterpartyRefByErpId(mockCtx, 'erp-cp-1');

            expect(result).toEqual({ id: 'cp1', branchId: 'branch-a' });
        });

        it('returns null when no matching counterparty exists', async () => {
            mockRawQuery.mockResolvedValue([]);

            const result = await service.findCounterpartyRefByErpId(mockCtx, 'erp-cp-unknown');

            expect(result).toBeNull();
        });
    });

    describe('upsertFromStream', () => {
        it('creates a new row when address is present and none exists yet', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);
            const created = { erpId: 'pos-1', contacts: [] };
            mockTpRepo.create.mockReturnValue(created);
            mockTpRepo.save.mockResolvedValue(created);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: 'branch-a',
                isActive: true,
                address: 'Addr 1',
                latitude: 1.1,
                longitude: 2.2,
            });

            expect(mockTpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'pos-1',
                    counterpartyId: 'cp1',
                    servicingBranchId: 'branch-a',
                    name: 'Kiosk A',
                    address: 'Addr 1',
                    latitude: 1.1,
                    longitude: 2.2,
                    isActive: true,
                    contacts: [],
                }),
            );
            expect(mockTpRepo.save).toHaveBeenCalled();
        });

        it('stores a point that arrives without coordinates (reported by the drift check, not rejected)', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);
            mockTpRepo.create.mockReturnValue({ erpId: 'pos-1', contacts: [] });

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: true,
                address: 'Addr 1',
            });

            expect(mockTpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ latitude: null, longitude: null }),
            );
            expect(mockTpRepo.save).toHaveBeenCalled();
        });

        it('creates the point with an empty address when none exists yet, so staff still see it', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);
            mockTpRepo.create.mockReturnValue({ erpId: 'pos-1', contacts: [] });

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: true,
                latitude: 95,
                longitude: 99.999999,
            });

            expect(mockTpRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ address: '', latitude: null, longitude: null }),
            );
            expect(mockTpRepo.save).toHaveBeenCalled();
        });

        it('fills an empty address on the same row when a later event carries one', async () => {
            const row = {
                erpId: 'pos-1',
                name: 'Kiosk A',
                address: '',
                isActive: true,
                counterpartyId: 'cp1',
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(row);
            mockTpRepo.save.mockResolvedValue(row);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: true,
                address: 'Addr 1',
            });

            expect(mockTpRepo.create).not.toHaveBeenCalled();
            expect(row.address).toBe('Addr 1');
        });

        it('does not create a row for a deletion tombstone (no name) when none exists yet', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: null,
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: false,
                address: 'Addr 1',
            });

            expect(mockTpRepo.create).not.toHaveBeenCalled();
            expect(mockTpRepo.save).not.toHaveBeenCalled();
        });

        it('updates only the fields present, leaving others unchanged', async () => {
            const existing = {
                erpId: 'pos-1',
                name: 'Old Name',
                address: 'Old Addr',
                latitude: 0,
                longitude: 0,
                isActive: false,
                counterpartyId: 'cp-old',
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(existing);
            mockTpRepo.save.mockResolvedValue(existing);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: null,
                counterpartyId: 'cp-new',
                servicingBranchId: null,
                isActive: true,
            });

            expect(existing.name).toBe('Old Name');
            expect(existing.address).toBe('Old Addr');
            expect(existing.isActive).toBe(true);
            expect(existing.counterpartyId).toBe('cp-new');
        });

        describe('coordinates from the stream (the stream only fills a missing location)', () => {
            const existing = (latitude: number | null, longitude: number | null) => ({
                id: 'tp-1',
                erpId: 'pos-1',
                name: 'N',
                address: 'A',
                latitude,
                longitude,
                isActive: true,
                counterpartyId: 'cp-1',
                contacts: [],
            });
            const event = (latitude?: number | null, longitude?: number | null) => ({
                name: 'N',
                counterpartyId: 'cp-1',
                servicingBranchId: null,
                isActive: true,
                address: 'A',
                latitude,
                longitude,
            });

            it('never writes the entity coordinates from an update, so a stale snapshot cannot clobber an edit', async () => {
                const row = existing(10.5, 20.5);
                mockTpRepo.findOne.mockResolvedValue(row);
                mockTpRepo.save.mockResolvedValue(row);

                await service.upsertFromStream(mockCtx, 'pos-1', event(11, 21));

                expect(row.latitude).toBe(10.5);
                expect(row.longitude).toBe(20.5);
            });

            it('fills a missing location with one conditional update that matches only a point still without one', async () => {
                const row = existing(null, null);
                mockTpRepo.findOne.mockResolvedValue(row);
                mockTpRepo.save.mockResolvedValue(row);

                await service.upsertFromStream(mockCtx, 'pos-1', event(11, 21));

                expect(mockFillSet).toHaveBeenCalledWith({ latitude: 11, longitude: 21 });
                expect(mockFillWhere.mock.calls[0][0]).toContain('latitude IS NULL');
                expect(mockFillWhere.mock.calls[0][1]).toEqual({ id: 'tp-1' });
                expect(mockFillExecute).toHaveBeenCalledTimes(1);
            });

            it.each([
                ['null coordinates', null, null],
                ['absent coordinates', undefined, undefined],
                ['a (0, 0) pair', 0, 0],
                ['an out-of-range pair', 95, 10],
            ])('does not touch the location when the stream sends %s', async (_n, lat, lng) => {
                const row = existing(10.5, 20.5);
                mockTpRepo.findOne.mockResolvedValue(row);
                mockTpRepo.save.mockResolvedValue(row);

                await service.upsertFromStream(mockCtx, 'pos-1', event(lat, lng));

                expect(row.latitude).toBe(10.5);
                expect(row.longitude).toBe(20.5);
                expect(mockFillExecute).not.toHaveBeenCalled();
            });

            it('delivering the same coordinates twice leaves one fill and an unchanged entity', async () => {
                const row = existing(null, null);
                mockTpRepo.findOne.mockResolvedValue(row);
                mockTpRepo.save.mockResolvedValue(row);

                await service.upsertFromStream(mockCtx, 'pos-1', event(11, 21));
                await service.upsertFromStream(mockCtx, 'pos-1', event(11, 21));

                expect(mockFillSet).toHaveBeenCalledTimes(2);
                expect(mockFillSet).toHaveBeenNthCalledWith(1, { latitude: 11, longitude: 21 });
                expect(mockFillSet).toHaveBeenNthCalledWith(2, { latitude: 11, longitude: 21 });
            });
        });

        // The ERP phone is mirrored only; it never writes mivend's contact person.
        it('mirrors contactPhone and leaves the contact person untouched', async () => {
            const contact = { name: 'Ivan', phone: null, email: null, isPrimary: true };
            const existing = {
                erpId: 'pos-1',
                name: 'Kiosk A',
                address: 'Addr 1',
                isActive: true,
                counterpartyId: 'cp1',
                contacts: [contact],
            };
            mockTpRepo.findOne.mockResolvedValue(existing);
            mockTpRepo.save.mockResolvedValue(existing);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: true,
                contactPhone: '+79991234566',
            });

            expect(contact.phone).toBeNull();
            expect(mockMirrorRow.contactPhone).toBe('+79991234566');
        });

        it('keeps mivend data on a changed message and records what the ERP sent in the mirror', async () => {
            const existing = {
                erpId: 'pos-1',
                name: 'Our Name',
                address: 'Our Addr',
                workingHours: '9-18',
                isActive: true,
                counterpartyId: 'cp1',
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(existing);
            mockTpRepo.save.mockResolvedValue(existing);
            const message = {
                name: 'ERP Name',
                address: 'ERP Addr',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: false,
            };

            await service.upsertFromStream(mockCtx, 'pos-1', message);
            await service.upsertFromStream(mockCtx, 'pos-1', message);

            expect(existing).toMatchObject({
                name: 'Our Name',
                address: 'Our Addr',
                workingHours: '9-18',
                isActive: false,
            });
            expect(mockMirrorRow).toMatchObject({ name: 'ERP Name', address: 'ERP Addr' });
        });

        it('skips contactPhone when no existing contact person to attach it to', async () => {
            const existing = {
                erpId: 'pos-1',
                name: 'Kiosk A',
                address: 'Addr 1',
                isActive: true,
                counterpartyId: 'cp1',
                contacts: [],
            };
            mockTpRepo.findOne.mockResolvedValue(existing);
            mockTpRepo.save.mockResolvedValue(existing);

            await expect(
                service.upsertFromStream(mockCtx, 'pos-1', {
                    name: 'Kiosk A',
                    counterpartyId: 'cp1',
                    servicingBranchId: null,
                    isActive: true,
                    contactPhone: '+79991234566',
                }),
            ).resolves.toBeUndefined();
            expect(existing.contacts).toHaveLength(0);
        });
    });
});
