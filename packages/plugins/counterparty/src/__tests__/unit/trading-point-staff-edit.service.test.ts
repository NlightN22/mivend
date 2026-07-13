import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomerService, RequestContext, TransactionalConnection } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { VersioningService } from '@mivend/plugin-versioning';
import { TradingPointService } from '../../trading-point.service';
import { TradingPoint } from '../../entities/trading-point.entity';
import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';

const mockTpRepo = {
    findOne: vi.fn(),
    save: vi.fn(async (record: unknown) => record),
};

const mockCpRepo = {
    create: vi.fn((input: unknown) => input),
    delete: vi.fn(),
};

const mockCounterpartyRepo = {
    findOne: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn((ctx: unknown, entity: unknown) => {
        if (entity === TradingPoint) return mockTpRepo;
        if (entity === ContactPerson) return mockCpRepo;
        if (entity === Counterparty) return mockCounterpartyRepo;
        return mockTpRepo;
    }),
};

const mockCustomerService = {} as unknown as CustomerService;
const mockAccessScopeService = {
    assertCounterpartyWritable: vi.fn(),
} as unknown as AccessScopeService;
const mockVersioningService = {
    recordChange: vi.fn(),
} as unknown as VersioningService;
const mockCtx = {} as unknown as RequestContext;

describe('TradingPointService — staff-initiated edits (updateDetails/setActive)', () => {
    let service: TradingPointService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockCounterpartyRepo.findOne.mockResolvedValue({ id: 'cp-1' });
        service = new TradingPointService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockAccessScopeService,
            mockVersioningService,
        );
    });

    describe('updateDetails', () => {
        it('records the real from/to contact values, not just counts', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                id: 'tp-1',
                name: 'Point A',
                address: 'Old Address',
                workingHours: null,
                deliveryComment: null,
                counterpartyId: 'cp-1',
                contacts: [{ name: 'Ivan', phone: '123', email: null, isPrimary: true }],
            });

            await service.updateDetails(mockCtx, 'tp-1', {
                contacts: [{ name: 'Petr', phone: '456', email: null, isPrimary: true }],
            });

            expect(mockCpRepo.delete).toHaveBeenCalledWith({ tradingPoint: { id: 'tp-1' } });
            expect(mockVersioningService.recordChange).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({
                    entityName: 'TradingPoint',
                    entityId: 'tp-1',
                    action: 'update',
                    changedFields: {
                        contacts: {
                            from: [{ name: 'Ivan', phone: '123', email: null, isPrimary: true }],
                            to: [{ name: 'Petr', phone: '456', email: null, isPrimary: true }],
                        },
                    },
                }),
            );
        });

        it('does not touch contacts or record a version entry when submitted contacts are unchanged', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                id: 'tp-1',
                name: 'Point A',
                address: 'Same Address',
                workingHours: null,
                deliveryComment: null,
                counterpartyId: 'cp-1',
                contacts: [{ name: 'Ivan', phone: '123', email: null, isPrimary: true }],
            });

            await service.updateDetails(mockCtx, 'tp-1', {
                // Same values the edit form always re-submits even when the caller only meant
                // to change the address — this must be a no-op for contacts specifically.
                contacts: [{ name: 'Ivan', phone: '123', email: null, isPrimary: true }],
            });

            expect(mockCpRepo.delete).not.toHaveBeenCalled();
            expect(mockVersioningService.recordChange).not.toHaveBeenCalled();
        });

        it('records a field-level diff for a plain attribute change', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                id: 'tp-1',
                name: 'Point A',
                address: 'Old Address',
                workingHours: null,
                deliveryComment: null,
                counterpartyId: 'cp-1',
                contacts: [],
            });

            await service.updateDetails(mockCtx, 'tp-1', { address: 'New Address' });

            expect(mockVersioningService.recordChange).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({
                    changedFields: { address: { from: 'Old Address', to: 'New Address' } },
                }),
            );
        });
    });

    describe('setActive', () => {
        it('records a reactivate action with no field diff', async () => {
            mockTpRepo.findOne.mockResolvedValue({
                id: 'tp-1',
                isActive: false,
                customerStatus: 'hidden',
                counterpartyId: 'cp-1',
            });

            await service.setActive(mockCtx, 'tp-1', true);

            expect(mockVersioningService.recordChange).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({
                    entityName: 'TradingPoint',
                    entityId: 'tp-1',
                    action: 'reactivate',
                }),
            );
        });
    });
});
