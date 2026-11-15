import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    CustomerService,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import { AccessScopeService } from '@mivend/plugin-access-control';
import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

const mockRepo = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    find: vi.fn(),
    query: vi.fn(),
};

const mockConnection = {
    withTransaction: vi.fn((c: unknown, work: (c: unknown) => unknown) => work(c)),
    getRepository: vi.fn(() => mockRepo),
};

const mockCustomerService = {
    update: vi.fn(async () => ({})),
} as unknown as CustomerService;

const mockCustomerPricingService = {
    assignCustomerPriceTypeByCode: vi.fn(async () => ({})),
} as unknown as CustomerPricingService;

const mockAccessScopeService = {
    resolveCounterpartyScope: vi.fn(async () => ({ kind: 'all' })),
    managerClause: (...args: Parameters<AccessScopeService['managerClause']>) =>
        new AccessScopeService({} as never, {} as never, {} as never).managerClause(...args),
    // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter) rather than a
    // no-op stub — assigning-manager-OR-team-member is asserted directly, not just a bare call.
    applyOwnCounterpartyFilter: vi.fn(
        (
            qb: { andWhere: (sql: string, params: Record<string, unknown>) => unknown },
            alias: string,
            scope: { administratorId?: string },
        ) =>
            qb.andWhere(
                `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                { ownScopeAdminId: scope.administratorId ?? null },
            ),
    ),
} as unknown as AccessScopeService;

const mockCtx = {} as unknown as RequestContext;

describe('CounterpartyService', () => {
    let service: CounterpartyService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.query.mockResolvedValue([]);
        mockRepo.save.mockImplementation(async (entity: unknown) => entity);
        service = new CounterpartyService(
            mockConnection as unknown as TransactionalConnection,
            mockCustomerService,
            mockCustomerPricingService,
            mockAccessScopeService,
            { publish: vi.fn() } as never,
        );
    });

    describe('setCustomerCounterparty', () => {
        it('assigns the counterparty priceType via CustomerPricingService', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                erpId: 'erp-1',
                inn: '7700000001',
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

        it('refuses a counterparty with a linked inn duplicate', async () => {
            mockRepo.findOne.mockResolvedValue({ id: 'cp-1', erpId: 'erp-1', inn: '7700000001' });
            mockRepo.query
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([{ id: 'cp-2', shortName: 'Twin', erpId: 'erp-2' }]);

            await expect(
                service.setCustomerCounterparty(mockCtx, 'cust-1', 'erp-1'),
            ).rejects.toThrow(/merge the duplicates in the ERP/);
            expect(mockCustomerService.update).not.toHaveBeenCalled();
        });

        it('re-binding the same pair skips the inn guard', async () => {
            mockRepo.findOne.mockResolvedValue({ id: 'cp-1', erpId: 'erp-1', inn: null });
            mockRepo.query.mockResolvedValueOnce([{ id: 'cust-1' }]);

            await service.setCustomerCounterparty(mockCtx, 'cust-1', 'erp-1');

            expect(mockCustomerService.update).toHaveBeenCalled();
            expect(mockRepo.query).toHaveBeenCalledTimes(1);
        });

        it('throws when the counterparty is not found', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            await expect(
                service.setCustomerCounterparty(mockCtx, 'cust-1', 'missing-erp'),
            ).rejects.toThrow(UserInputError);
            expect(mockCustomerPricingService.assignCustomerPriceTypeByCode).not.toHaveBeenCalled();
        });
    });

    describe('updateCreditBalance', () => {
        // upstream#129: a separate, register-driven stream from upsertActiveState above.
        it('updates creditBalance on an existing row', async () => {
            mockRepo.update.mockResolvedValue({ affected: 1 });
            await service.updateCreditBalance(mockCtx, 'cp-1', 500);
            expect(mockRepo.update).toHaveBeenCalledWith({ erpId: 'cp-1' }, { creditBalance: 500 });
        });

        // Never fabricate a Counterparty row from a balance update alone — this stream carries
        // no name, so there is nothing to create from.
        it('is a no-op when no counterparty exists for that erpId', async () => {
            mockRepo.update.mockResolvedValue({ affected: 0 });
            await service.updateCreditBalance(mockCtx, 'cp-unknown', 500);
            expect(mockRepo.update).toHaveBeenCalledWith(
                { erpId: 'cp-unknown' },
                { creditBalance: 500 },
            );
        });
    });

    describe('backfillAssignedManager', () => {
        function mockUpdateQueryBuilder(
            affected: number,
        ): Record<string, ReturnType<typeof vi.fn>> {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {
                update: vi.fn(),
                set: vi.fn(),
                where: vi.fn(),
                andWhere: vi.fn(),
                execute: vi.fn(async () => ({ affected })),
            };
            qb.update.mockReturnValue(qb);
            qb.set.mockReturnValue(qb);
            qb.where.mockReturnValue(qb);
            qb.andWhere.mockReturnValue(qb);
            return qb;
        }

        // Backfills Counterparties left with null assignedManagerId because their counterparty event
        // was processed before this erpId was linked.
        it('updates only rows matching managerErpId with assignedManagerId still null', async () => {
            const qb = mockUpdateQueryBuilder(2);
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            const affected = await service.backfillAssignedManager(
                mockCtx,
                'user-erp-1',
                'admin-1',
            );

            expect(qb.set).toHaveBeenCalledWith({ assignedManagerId: 'admin-1' });
            expect(qb.where).toHaveBeenCalledWith('managerErpId = :managerErpId', {
                managerErpId: 'user-erp-1',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('assignedManagerId IS NULL');
            expect(affected).toBe(2);
        });

        it('returns 0 without error when no counterparty is waiting on this erpId', async () => {
            const qb = mockUpdateQueryBuilder(0);
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            const affected = await service.backfillAssignedManager(
                mockCtx,
                'user-erp-none',
                'admin-1',
            );

            expect(affected).toBe(0);
        });
    });

    describe('findVisible', () => {
        function mockQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            qb.orderBy = vi.fn(() => qb);
            qb.addOrderBy = vi.fn(() => qb);
            qb.where = vi.fn(() => qb);
            qb.andWhere = vi.fn(() => qb);
            qb.take = vi.fn(() => qb);
            qb.getMany = vi.fn(async () => []);
            return qb;
        }

        it('filters by assignedManagerId OR team membership for "own" scope', async () => {
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

            expect(mockAccessScopeService.applyOwnCounterpartyFilter).toHaveBeenCalledWith(
                qb,
                'c',
                { kind: 'own', administratorId: 'admin-1' },
            );
        });

        // departmentId is display-only, never an access gate (see docs/access-control.md).
        // branchId gates department scope; null branchId is denied, unlike Order (no OR IS NULL).
        it('filters by branchId only for "department" scope, ignoring departmentId entirely', async () => {
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

            expect(qb.andWhere).toHaveBeenCalledWith('(c.branchId = :scopeBranch)', {
                scopeBranch: 'branch-a',
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

            expect(qb.andWhere).not.toHaveBeenCalled();
        });
    });

    describe('findVisiblePage', () => {
        function mockPageQueryBuilder(): Record<string, ReturnType<typeof vi.fn>> {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            qb.orderBy = vi.fn(() => qb);
            qb.addOrderBy = vi.fn(() => qb);
            qb.where = vi.fn(() => qb);
            qb.andWhere = vi.fn(() => qb);
            qb.take = vi.fn(() => qb);
            qb.skip = vi.fn(() => qb);
            qb.getCount = vi.fn(async () => 0);
            qb.getMany = vi.fn(async () => []);
            return qb;
        }

        beforeEach(() => {
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({ kind: 'all' });
        });

        it('applies an additional status=active filter on top of the access scope', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { status: 'active' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.isActive = true');
        });

        it('narrows by exact erpIds on top of the access scope', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { erpIds: ['cp-a', 'cp-b'] });

            expect(qb.andWhere).toHaveBeenCalledWith('c.erpId IN (:...erpIds)', {
                erpIds: ['cp-a', 'cp-b'],
            });
        });

        it('refuses more than 200 erpIds', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await expect(
                service.findVisiblePage(mockCtx, {
                    erpIds: Array.from({ length: 201 }, (_, i) => `cp-${i}`),
                }),
            ).rejects.toThrow('At most 200 erpIds');
        });

        it('applies an additional status=inactive filter', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { status: 'inactive' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.isActive = false');
        });

        it('applies a managerId filter', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { managerId: 'admin-2' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId = :managerId', {
                managerId: 'admin-2',
            });
        });

        it('applies a branchId filter', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { branchId: 'branch-a' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.branchId = :branchId', {
                branchId: 'branch-a',
            });
        });

        it('composes status, managerId and branchId filters together', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, {
                status: 'active',
                managerId: 'admin-2',
                branchId: 'branch-a',
            });

            expect(qb.andWhere).toHaveBeenCalledWith('c.isActive = true');
            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId = :managerId', {
                managerId: 'admin-2',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('c.branchId = :branchId', {
                branchId: 'branch-a',
            });
        });

        it('applies no extra filter when no status/manager/branch options are given', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, {});

            expect(qb.andWhere).not.toHaveBeenCalled();
        });

        it('applies a groupLabel filter', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { groupLabel: 'Accounting' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.erpGroupLabel = :groupLabel', {
                groupLabel: 'Accounting',
            });
        });

        it('applies an unassignedOnly filter (assignedManagerId IS NULL)', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { unassignedOnly: true });

            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId IS NULL');
        });

        it('unassignedOnly takes precedence over managerId when both are given', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { unassignedOnly: true, managerId: 'admin-2' });

            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId IS NULL');
            expect(qb.andWhere).not.toHaveBeenCalledWith('c.assignedManagerId = :managerId', {
                managerId: 'admin-2',
            });
        });

        it('composes groupLabel and unassignedOnly with the existing status/branch filters', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, {
                status: 'active',
                branchId: 'branch-a',
                groupLabel: 'Accounting',
                unassignedOnly: true,
            });

            expect(qb.andWhere).toHaveBeenCalledWith('c.isActive = true');
            expect(qb.andWhere).toHaveBeenCalledWith('c.branchId = :branchId', {
                branchId: 'branch-a',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('c.erpGroupLabel = :groupLabel', {
                groupLabel: 'Accounting',
            });
            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId IS NULL');
        });

        it('applies a requested sort field/order, overriding the default shortName ASC', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, { sort: { officialEmail: 'DESC' } });

            expect(qb.orderBy).toHaveBeenCalledWith('c.officialEmail', 'DESC');
            expect(qb.addOrderBy).toHaveBeenCalledWith('c.id', 'ASC');
        });

        it('only applies the first non-null sort key when several are somehow set', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, {
                sort: { shortName: null, inn: 'ASC', phone: 'DESC' },
            });

            expect(qb.orderBy).toHaveBeenCalledWith('c.inn', 'ASC');
            expect(qb.orderBy).not.toHaveBeenCalledWith('c.phone', 'DESC');
        });

        it('leaves the default shortName ASC order (from baseVisibleQb) when no sort is requested', async () => {
            const qb = mockPageQueryBuilder();
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);

            await service.findVisiblePage(mockCtx, {});

            expect(qb.orderBy).toHaveBeenCalledTimes(1);
            expect(qb.orderBy).toHaveBeenCalledWith('c.shortName', 'ASC');
        });
    });

    describe('countUnassigned', () => {
        it("counts unassigned counterparties within the caller's access scope", async () => {
            const qb: Record<string, ReturnType<typeof vi.fn>> = {};
            qb.orderBy = vi.fn(() => qb);
            qb.addOrderBy = vi.fn(() => qb);
            qb.andWhere = vi.fn(() => qb);
            qb.getCount = vi.fn(async () => 3);
            mockConnection.getRepository.mockReturnValueOnce({
                createQueryBuilder: vi.fn(() => qb),
            } as unknown as typeof mockRepo);
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({ kind: 'all' });

            const result = await service.countUnassigned(mockCtx);

            expect(qb.andWhere).toHaveBeenCalledWith('c.assignedManagerId IS NULL');
            expect(result).toBe(3);
        });
    });
});
