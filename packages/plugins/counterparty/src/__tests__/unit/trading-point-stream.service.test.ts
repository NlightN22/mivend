import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService, Logger, RequestContext, TransactionalConnection } from '@vendure/core';
import { TradingPointService } from '../../trading-point.service';
import { TradingPoint } from '../../entities/trading-point.entity';
import { ContactPerson } from '../../entities/contact-person.entity';

const mockTpRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
};

const mockCpRepo = {};

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
        service = new TradingPointService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockAccessScopeService,
            mockVersioningService,
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

        // address is required, never fabricated (audit LOW: deferred-create must warn, not verbose).
        it('does not create a row when address is missing and none exists yet, and warns', async () => {
            mockTpRepo.findOne.mockResolvedValue(null);
            const warnSpy = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);

            await service.upsertFromStream(mockCtx, 'pos-1', {
                name: 'Kiosk A',
                counterpartyId: 'cp1',
                servicingBranchId: null,
                isActive: true,
            });

            expect(mockTpRepo.create).not.toHaveBeenCalled();
            expect(mockTpRepo.save).not.toHaveBeenCalled();
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('no address yet'),
                expect.any(String),
            );
            warnSpy.mockRestore();
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

        // This stream never carries a contact name — contactPhone must only ever land on an
        // already-existing ContactPerson, never fabricate one with a blank name.
        it('applies contactPhone onto an existing primary contact', async () => {
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

            expect(contact.phone).toBe('+79991234566');
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
