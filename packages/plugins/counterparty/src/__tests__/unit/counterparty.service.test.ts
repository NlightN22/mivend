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
    // Real implementation (mirrors AccessScopeService.applyOwnCounterpartyFilter) rather than a
    // no-op stub — assigning-manager-OR-team-member is asserted directly, not just a bare call.
    applyOwnCounterpartyFilter: vi.fn(
        (
            qb: { andWhere: (sql: string, params: Record<string, unknown>) => unknown },
            alias: string,
            administratorId: string | undefined,
        ) =>
            qb.andWhere(
                `(${alias}."assignedManagerId" = :ownScopeAdminId OR EXISTS (
                SELECT 1 FROM counterparty_team_member ctm
                WHERE ctm."counterpartyId" = ${alias}.id
                AND ctm."administratorId" = :ownScopeAdminId
            ))`,
                { ownScopeAdminId: administratorId ?? null },
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

        it('stores ERP reference details; omitted keep, null clears', async () => {
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
            expect(patch).toMatchObject({ mainContractId: 'contract-1', kpp: null });
            expect(patch).not.toHaveProperty('regionId');
        });

        it('applies an explicit null for legalAddress/factualAddress/phone/officialEmail', async () => {
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
            expect(patch).toMatchObject({
                legalAddress: null,
                factualAddress: null,
                phone: null,
                officialEmail: null,
            });
        });

        it('updates legalName/shortName/isActive on an existing row, never touching REST-only fields', async () => {
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
            expect(patch).toMatchObject({
                legalName: 'New Name',
                shortName: 'New Name',
                isActive: false,
            });
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
        it('applies an explicit null for inn/erpGroupLabel/departmentId', async () => {
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
            expect(patch).toMatchObject({ inn: null, erpGroupLabel: null, departmentId: null });
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
        it('applies an already-resolved assignedManagerId on an existing row', async () => {
            const entity = {
                id: '1',
                erpId: 'cp-1',
                legalName: 'Acme Corp',
                shortName: 'Acme Corp',
                isActive: true,
                assignedManagerId: null,
            };
            mockRepo.findOne.mockResolvedValue(entity);
            await service.upsertActiveState(mockCtx, 'cp-1', {
                name: 'Acme Corp',
                isActive: true,
                assignedManagerId: 'admin-1',
            });
            const patch = mockRepo.update.mock.calls[0][1];
            expect(patch).toMatchObject({ assignedManagerId: 'admin-1' });
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

    describe('updateCreditBalance', () => {
        // search-platform#129: a separate, register-driven stream from upsertActiveState above.
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
            qb.where = vi.fn(() => qb);
            qb.andWhere = vi.fn(() => qb);
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
                'admin-1',
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

            expect(qb.andWhere).toHaveBeenCalledWith('c.branchId = :scopeBranch', {
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
