import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { CounterpartyStreamStateService } from '../../counterparty-stream-state.service';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    query: vi.fn(),
    createQueryBuilder: vi.fn(),
};

const mockConnection = {
    withTransaction: vi.fn((c: unknown, work: (c: unknown) => unknown) => work(c)),
    getRepository: vi.fn(() => mockRepo),
};

const mockCtx = {} as unknown as RequestContext;

describe('CounterpartyStreamStateService', () => {
    let service: CounterpartyStreamStateService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.query.mockResolvedValue([]);
        mockRepo.save.mockImplementation(async (entity: unknown) => entity);
        service = new CounterpartyStreamStateService(
            mockConnection as unknown as TransactionalConnection,
            { publish: vi.fn() } as never,
        );
    });

    describe('upsertActiveState', () => {
        // Partial create from the counterparty stream: creditLimit, paymentDelayDays, priceType, branchId
        // must never be fabricated here; creditBalance comes on its own stream (updateCreditBalance).
        it('creates a partial row when no counterparty exists for that erpId, never fabricating REST-only fields', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockImplementation((input: unknown) => input);
            await service.upsertActiveState(mockCtx, 'cp-unknown', {
                name: 'Acme Corp',
                isActive: true,
            });
            expect(mockRepo.create).toHaveBeenCalledWith({
                erpId: 'cp-unknown',
                legalName: 'Acme Corp',
                shortName: 'Acme Corp',
                isActive: true,
                inn: null,
                erpGroupLabel: null,
                departmentId: null,
                assignedManagerId: null,
                managerErpId: null,
                legalAddress: null,
                factualAddress: null,
                phone: null,
                officialEmail: null,
            });
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    erpId: 'cp-unknown',
                    legalName: 'Acme Corp',
                    shortName: 'Acme Corp',
                    isActive: true,
                }),
            );
        });

        // inn, erpGroupLabel and departmentId are real counterparty-stream fields; do not treat as absent.
        it('creates a partial row with inn/erpGroupLabel/departmentId when the payload carries them', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockImplementation((input: unknown) => input);
            await service.upsertActiveState(mockCtx, 'cp-unknown', {
                name: 'Acme Corp',
                isActive: true,
                inn: '7701234567',
                erpGroupLabel: 'Wholesale',
                departmentId: 'dept-1',
            });
            expect(mockRepo.create).toHaveBeenCalledWith({
                erpId: 'cp-unknown',
                legalName: 'Acme Corp',
                shortName: 'Acme Corp',
                isActive: true,
                inn: '7701234567',
                erpGroupLabel: 'Wholesale',
                departmentId: 'dept-1',
                assignedManagerId: null,
                managerErpId: null,
                legalAddress: null,
                factualAddress: null,
                phone: null,
                officialEmail: null,
            });
        });

        // Issue #131: legalAddress/factualAddress/phone/officialEmail follow the same
        // presence/absence/explicit-null semantics as inn/erpGroupLabel/departmentId above.
        it('creates a partial row with legalAddress/factualAddress/phone/officialEmail when the payload carries them', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockImplementation((input: unknown) => input);
            await service.upsertActiveState(mockCtx, 'cp-unknown', {
                name: 'Acme Corp',
                isActive: true,
                legalAddress: 'Legal St 1',
                factualAddress: 'Actual Ave 2',
                phone: '+70000000000',
                officialEmail: 'contact@acme.example',
            });
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    legalAddress: 'Legal St 1',
                    factualAddress: 'Actual Ave 2',
                    phone: '+70000000000',
                    officialEmail: 'contact@acme.example',
                }),
            );
        });

        it('leaves legalAddress/factualAddress/phone/officialEmail untouched when omitted from fields', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Old Name',
                shortName: 'Old Name',
                isActive: true,
                legalAddress: 'Legal St 1',
                factualAddress: 'Actual Ave 2',
                phone: '+70000000000',
                officialEmail: 'contact@acme.example',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', { name: 'New Name', isActive: false });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).not.toHaveProperty('officialEmail');
            expect(patch).not.toHaveProperty('legalAddress');
            expect(patch).not.toHaveProperty('factualAddress');
            expect(patch).not.toHaveProperty('phone');
        });

        it('stores the ERP-owned reference details and ignores the portal-owned ones', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'N',
                shortName: 'N',
                isActive: true,
                kpp: 'old-kpp',
                regionId: 'region-1',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', {
                name: 'N',
                isActive: true,
                mainContractId: 'contract-1',
                kpp: null,
            });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).toMatchObject({ mainContractId: 'contract-1' });
            expect(patch).not.toHaveProperty('kpp');
            expect(patch).not.toHaveProperty('regionId');
        });

        it('never writes the portal-owned contact fields onto an existing row', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Old Name',
                shortName: 'Old Name',
                isActive: true,
                legalAddress: 'Legal St 1',
                factualAddress: 'Actual Ave 2',
                phone: '+70000000000',
                officialEmail: 'contact@acme.example',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', {
                name: 'New Name',
                isActive: false,
                legalAddress: null,
                factualAddress: null,
                phone: null,
                officialEmail: null,
            });
            const patch = mockRepo.update.mock.calls[0][1];
            for (const key of ['legalAddress', 'factualAddress', 'phone', 'officialEmail']) {
                expect(patch).not.toHaveProperty(key);
            }
        });

        it('updates isActive on an existing row but not the portal-owned name, never touching REST-only fields', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Old Name',
                shortName: 'Old Name',
                isActive: true,
                inn: '123456',
                creditLimit: 1000,
                priceType: 'wholesale',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', { name: 'New Name', isActive: false });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).toEqual({ isActive: false });
            expect(patch).not.toHaveProperty('priceType');
            expect(patch).not.toHaveProperty('inn');
            expect(patch).not.toHaveProperty('creditLimit');
        });

        // `undefined` (field absent from the payload) means "leave unchanged" — must not
        // overwrite inn/erpGroupLabel/departmentId with null just because the event omitted them.
        it('leaves inn/erpGroupLabel/departmentId untouched when omitted from fields', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Old Name',
                shortName: 'Old Name',
                isActive: true,
                inn: '123456',
                erpGroupLabel: 'Wholesale',
                departmentId: 'dept-1',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', { name: 'New Name', isActive: false });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).not.toHaveProperty('departmentId');
            expect(patch).not.toHaveProperty('inn');
            expect(patch).not.toHaveProperty('erpGroupLabel');
        });

        // An explicit null (ERP cleared the field) must be applied, distinct from `undefined`.
        it('applies an explicit null for departmentId only; inn and group label are portal-owned', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Old Name',
                shortName: 'Old Name',
                isActive: true,
                inn: '123456',
                erpGroupLabel: 'Wholesale',
                departmentId: 'dept-1',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', {
                name: 'New Name',
                isActive: false,
                inn: null,
                erpGroupLabel: null,
                departmentId: null,
            });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).toEqual({ isActive: false, departmentId: null });
        });

        // A deletion tombstone never carries a name — must still update isActive on an
        // already-known counterparty, never touching legalName/shortName.
        it('updates isActive only when name is null but the row already exists', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Existing Name',
                shortName: 'Existing Name',
                isActive: true,
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', { name: null, isActive: false });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).toMatchObject({ isActive: false });
            expect(patch).not.toHaveProperty('legalName');
            expect(patch).not.toHaveProperty('shortName');
        });

        // Never fabricate a brand-new counterparty with a blank name — a deletion tombstone for
        // an entity mivend never created locally must stay a true no-op.
        it('does not create a row when name is null and none exists yet', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            await service.upsertActiveState(mockCtx, 'cp-unknown', { name: null, isActive: false });
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).not.toHaveBeenCalled();
        });

        // assignedManagerId is an already-resolved Administrator id from the caller;
        // do not resolve it again here.
        it('fills an empty owner on an existing row and never replaces a set one', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Acme Corp',
                shortName: 'Acme Corp',
                isActive: true,
                assignedManagerId: null,
            };
            mockRepo.findOne.mockResolvedValue(entity);
            const where = vi.fn().mockReturnValue({ execute: vi.fn() });
            const set = vi.fn().mockReturnValue({ where });
            mockRepo.createQueryBuilder.mockReturnValue({ update: () => ({ set }) });
            await service.upsertActiveState(mockCtx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                assignedManagerId: 'admin-1',
            });
            expect(mockRepo.update.mock.calls.at(-1)?.[1]).not.toHaveProperty('assignedManagerId');
            expect(set).toHaveBeenCalledWith({ assignedManagerId: 'admin-1' });
            expect(where).toHaveBeenCalledWith(
                expect.stringContaining('"assignedManagerId" IS NULL'),
                { id: '1' },
            );
        });

        // undefined means the caller found no manager: keep an existing REST/portal-assigned manager
        // untouched, never write null over it.
        it('leaves assignedManagerId untouched when omitted from fields', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Acme Corp',
                shortName: 'Acme Corp',
                isActive: true,
                assignedManagerId: 'admin-existing',
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', { name: 'Acme Corp', isActive: true });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).not.toHaveProperty('assignedManagerId');
        });

        it('creates a row with assignedManagerId when provided', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            mockRepo.create.mockImplementation((input: unknown) => input);
            await service.upsertActiveState(mockCtx, 'cp-unknown', {
                name: 'Acme Corp',
                isActive: true,
                assignedManagerId: 'admin-1',
            });
            expect(mockRepo.create).toHaveBeenCalledWith(
                expect.objectContaining({ assignedManagerId: 'admin-1' }),
            );
        });
    });
});
