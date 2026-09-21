import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError, type RequestContext } from '@vendure/core';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyPortalAccessService } from '../../counterparty-portal-access.service';

const mockCounterpartyRepo = {
    findOne: vi.fn(),
};

const mockCustomerRepo = {
    findOne: vi.fn(),
};

const rawQuery = vi.fn();

const mockConnection = {
    getRepository: vi.fn((_ctx: unknown, entity: { name: string }) =>
        entity.name === 'Counterparty' ? mockCounterpartyRepo : mockCustomerRepo,
    ),
    rawConnection: { query: rawQuery },
};

const mockCustomerService = {
    create: vi.fn(),
    softDelete: vi.fn(),
};

const mockAccessScopeService = {
    assertCounterpartyWritable: vi.fn(async () => undefined),
} as unknown as AccessScopeService;

const mockCtx = {} as RequestContext;

function counterparty(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'cp-1',
        isActive: true,
        phone: '+7 391 000-00-00',
        officialEmail: 'office@example.ru',
        legalName: 'ООО Ромашка',
        assignedManagerId: null,
        departmentId: null,
        branchId: null,
        ...overrides,
    };
}

describe('CounterpartyPortalAccessService', () => {
    let service: CounterpartyPortalAccessService;

    beforeEach(() => {
        vi.clearAllMocks();
        rawQuery.mockResolvedValue([]);
        service = new CounterpartyPortalAccessService(
            mockConnection as never,
            mockCustomerService as never,
            mockAccessScopeService,
        );
    });

    describe('activate', () => {
        it('creates a Customer without a password and links counterpartyId', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty());
            mockCustomerService.create.mockResolvedValue({ id: 'cust-1' });

            const result = await service.activate(mockCtx, 'cp-1');

            expect(result).toEqual({ id: 'cust-1' });
            expect(mockAccessScopeService.assertCounterpartyWritable).toHaveBeenCalled();
            expect(mockCustomerService.create).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({
                    emailAddress: 'office@example.ru',
                    phoneNumber: '+7 391 000-00-00',
                    customFields: expect.objectContaining({
                        counterpartyId: 'cp-1',
                        portalRole: 'client_admin',
                    }),
                }),
                // password argument omitted entirely — arguments.length check
            );
            expect(mockCustomerService.create.mock.calls[0]).toHaveLength(2);
        });

        it('rejects when phone or officialEmail is missing', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty({ officialEmail: null }));

            await expect(service.activate(mockCtx, 'cp-1')).rejects.toThrow(UserInputError);
            expect(mockCustomerService.create).not.toHaveBeenCalled();
        });

        it('rejects when the counterparty is inactive in the ERP', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty({ isActive: false }));

            await expect(service.activate(mockCtx, 'cp-1')).rejects.toThrow(UserInputError);
        });

        it('rejects when a Customer is already linked', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty());
            rawQuery.mockResolvedValue([{ id: 'cust-existing' }]);

            await expect(service.activate(mockCtx, 'cp-1')).rejects.toThrow(UserInputError);
            expect(mockCustomerService.create).not.toHaveBeenCalled();
        });

        it('surfaces a Vendure ErrorResult as UserInputError', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty());
            mockCustomerService.create.mockResolvedValue({
                errorCode: 'EMAIL_ADDRESS_CONFLICT_ERROR',
                message: 'already exists',
            });

            await expect(service.activate(mockCtx, 'cp-1')).rejects.toThrow(UserInputError);
        });
    });

    describe('deactivate', () => {
        it('soft-deletes the Customer and returns the withDeleted record', async () => {
            mockCustomerRepo.findOne
                .mockResolvedValueOnce({ id: 'cust-1', customFields: { counterpartyId: 'cp-1' } })
                .mockResolvedValueOnce({ id: 'cust-1', deletedAt: new Date() });
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty());

            const result = await service.deactivate(mockCtx, 'cust-1');

            expect(mockCustomerService.softDelete).toHaveBeenCalledWith(mockCtx, 'cust-1');
            expect(result.id).toBe('cust-1');
            expect(mockAccessScopeService.assertCounterpartyWritable).toHaveBeenCalled();
        });

        it('throws when the Customer does not exist', async () => {
            mockCustomerRepo.findOne.mockResolvedValueOnce(null);

            await expect(service.deactivate(mockCtx, 'cust-missing')).rejects.toThrow(
                UserInputError,
            );
        });
    });

    describe('applyBatch', () => {
        it('reports success/failure independently per row', async () => {
            mockCounterpartyRepo.findOne.mockImplementation(
                async ({ where: { id } }: { where: { id: string } }) => {
                    if (id === 'cp-ready') return counterparty({ id: 'cp-ready' });
                    if (id === 'cp-missing-data')
                        return counterparty({ id: 'cp-missing-data', phone: null });
                    return null;
                },
            );
            mockCustomerService.create.mockResolvedValue({ id: 'cust-new' });

            const results = await service.applyBatch(mockCtx, [
                { counterpartyId: 'cp-ready', action: 'activate' },
                { counterpartyId: 'cp-missing-data', action: 'activate' },
                { counterpartyId: 'cp-not-found', action: 'activate' },
            ]);

            expect(results).toHaveLength(3);
            expect(results[0]).toMatchObject({ counterpartyId: 'cp-ready', success: true });
            expect(results[1]).toMatchObject({ counterpartyId: 'cp-missing-data', success: false });
            expect(results[2]).toMatchObject({ counterpartyId: 'cp-not-found', success: false });
        });

        it('deactivate fails a row with no linked Customer instead of throwing out of the batch', async () => {
            mockCounterpartyRepo.findOne.mockResolvedValue(counterparty());
            rawQuery.mockResolvedValue([]);

            const results = await service.applyBatch(mockCtx, [
                { counterpartyId: 'cp-1', action: 'deactivate' },
            ]);

            expect(results[0]).toMatchObject({ success: false });
            expect(results[0].error).toMatch(/no linked portal Customer/);
        });
    });
});
