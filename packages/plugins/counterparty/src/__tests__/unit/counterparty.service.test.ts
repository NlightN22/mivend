import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    find: vi.fn(),
};

const mockConnection = {
    getRepository: vi.fn(() => mockRepo),
    rawConnection: { query: vi.fn() },
};

const mockCustomerService = {
    update: vi.fn(async () => ({})),
} as unknown as CustomerService;

const mockCustomerPricingService = {
    assignCustomerPriceTypeByCode: vi.fn(async () => ({})),
} as unknown as CustomerPricingService;

const mockAccessScopeService = {
    resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })),
} as unknown as AccessScopeService;

const mockCtx = {} as unknown as RequestContext;

describe('CounterpartyService', () => {
    let service: CounterpartyService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CounterpartyService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockCustomerPricingService,
            mockAccessScopeService,
        );
    });

    describe('setCustomerCounterparty', () => {
        it('assigns the counterparty priceType via CustomerPricingService', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                erpId: 'erp-1',
                priceType: 'WHOLESALE',
            } as Counterparty);

            await service.setCustomerCounterparty(mockCtx, 'cust-1', 'erp-1');

            expect(mockCustomerService.update).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({ id: 'cust-1' }),
            );
            expect(mockCustomerPricingService.assignCustomerPriceTypeByCode).toHaveBeenCalledWith(
                mockCtx,
                'cust-1',
                'WHOLESALE',
            );
        });

        it('throws when the counterparty is not found', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            await expect(
                service.setCustomerCounterparty(mockCtx, 'cust-1', 'missing-erp'),
            ).rejects.toThrow(UserInputError);
            expect(mockCustomerPricingService.assignCustomerPriceTypeByCode).not.toHaveBeenCalled();
        });
    });

    describe('findVisible', () => {
        function mockQueryBuilder() {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            qb.orderBy = vi.fn(() => qb);
            qb.where = vi.fn(() => qb);
            qb.getMany = vi.fn(async () => []);
            return qb;
        }

        it('filters by assignedManagerId for "own" scope', async () => {
            const qb = mockQueryBuilder();
            mockRepo.find = vi.fn();
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'own',
                administratorId: 'admin-1',
            });
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisible(mockCtx);

            expect(qb.where).toHaveBeenCalledWith('c.assignedManagerId = :id', { id: 'admin-1' });
        });

        it('filters by department/branch for "department" scope', async () => {
            const qb = mockQueryBuilder();
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisible(mockCtx);

            expect(qb.where).toHaveBeenCalledWith('c.departmentId = :d AND c.branchId = :b', {
                d: 'dept-1',
                b: 'branch-a',
            });
        });

        it('applies no filter for "all" scope', async () => {
            const qb = mockQueryBuilder();
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'all',
            });
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisible(mockCtx);

            expect(qb.where).not.toHaveBeenCalled();
        });
    });
});
