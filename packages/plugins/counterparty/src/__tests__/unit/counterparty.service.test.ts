import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    AdministratorService,
    CustomerService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import type { CustomerPricingService } from '@mivend/plugin-customer-pricing';
import type { AccessScopeService } from '@mivend/plugin-access-control';
import type { VersioningService } from '@mivend/plugin-versioning';
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

// assertCounterpartyWritable mirrors AccessScopeService's real own/department/all switch (see
// packages/plugins/access-control/src/access-scope.service.ts) rather than a no-op stub — the
// scenarios below rely on it actually enforcing scope, using whatever resolveCounterpartyScope
// is mocked to return per test.
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
    assertCounterpartyWritable: vi.fn(
        async (
            _ctx: RequestContext,
            counterparty: {
                assignedManagerId: string | null;
                departmentId: string | null;
                branchId: string | null;
            },
        ) => {
            const scope = await (
                mockAccessScopeService.resolveCounterpartyScope as unknown as () => Promise<{
                    kind: string;
                    administratorId?: string;
                    departmentId?: string;
                    branchId?: string;
                }>
            )();
            switch (scope.kind) {
                case 'own':
                    if (counterparty.assignedManagerId !== (scope.administratorId ?? null)) {
                        throw new ForbiddenError();
                    }
                    break;
                case 'department':
                    // branchId is deliberately never compared here — see the real
                    // AccessScopeService.assertCounterpartyWritable's own comment.
                    if (counterparty.departmentId !== (scope.departmentId ?? null)) {
                        throw new ForbiddenError();
                    }
                    break;
            }
        },
    ),
} as unknown as AccessScopeService;

const mockAdministratorService = {
    findOne: vi.fn(),
} as unknown as AdministratorService;

const mockVersioningService = {
    recordChange: vi.fn(async () => ({})),
} as unknown as VersioningService;

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
            mockAdministratorService,
            mockVersioningService,
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

    describe('upsertActiveState', () => {
        // Issue #104: partial-create from the `counterparty` Kafka stream — creditLimit/
        // paymentDelayDays/priceType/branchId must never be fabricated here, same as #88's
        // organization precedent. creditBalance lives on its own stream — see updateCreditBalance.
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

        // Issue #104 follow-up, verified live against @nlightn22/event-contracts@0.38.0
        // (search-platform#92/#118): inn/erpGroupLabel/departmentId are real fields on this
        // stream today — a stale earlier read of the issue's own comments had wrongly treated
        // them as unavailable.
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    legalName: 'New Name',
                    shortName: 'New Name',
                    isActive: false,
                    inn: '123456',
                    creditLimit: 1000,
                    priceType: 'wholesale',
                }),
            );
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    inn: '123456',
                    erpGroupLabel: 'Wholesale',
                    departmentId: 'dept-1',
                }),
            );
        });

        // An explicit null (1C cleared the field) must be applied, distinct from `undefined`.
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ inn: null, erpGroupLabel: null, departmentId: null }),
            );
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({
                    legalName: 'Existing Name',
                    shortName: 'Existing Name',
                    isActive: false,
                }),
            );
        });

        // Never fabricate a brand-new counterparty with a blank name — a deletion tombstone for
        // an entity mivend never created locally must stay a true no-op.
        it('does not create a row when name is null and none exists yet', async () => {
            mockRepo.findOne.mockResolvedValue(null);
            await service.upsertActiveState(mockCtx, 'cp-unknown', { name: null, isActive: false });
            expect(mockRepo.create).not.toHaveBeenCalled();
            expect(mockRepo.save).not.toHaveBeenCalled();
        });

        // Issue #109 unblocked this — assignedManagerId is now an already-resolved Administrator
        // id passed in by the caller (CounterpartyStreamHandler), not something this method
        // resolves itself.
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ assignedManagerId: 'admin-1' }),
            );
        });

        // `undefined` (the caller found no manager assigned at all — see
        // CounterpartyStreamHandler's own fallback logic) must leave an existing REST/portal-
        // assigned manager untouched, never clear it to null.
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
            expect(mockRepo.save).toHaveBeenCalledWith(
                expect.objectContaining({ assignedManagerId: 'admin-existing' }),
            );
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

        // mivend.audit.common (2026-09-20): called from AdministratorLinkedListener once an
        // erpId links — resolves every Counterparty left with assignedManagerId:null because its
        // `counterparty` event was processed while that erpId was still unlinked.
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

        // Neither departmentId nor branchId filters Counterparty for "department" scope today.
        // departmentId (1C org data) is pure display information, never an access-scope gate —
        // see docs/access-control.md's "Branch vs Department" section. branchId would be the
        // real gate once Counterparty.branchId is populated (issue #65/#123), but until then
        // this is deliberately a no-op (same as 'all') rather than showing zero counterparties
        // to every department/branch-scoped role.
        it('applies no filter for "department" scope (temporary, pending issue #65/#123)', async () => {
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

            expect(qb.andWhere).not.toHaveBeenCalled();
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

    describe('reassignManager', () => {
        it('reassigns unconditionally for "all" scope', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            mockRepo.save.mockImplementation(async (c: unknown) => c);
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'all',
            });

            const result = await service.reassignManager(mockCtx, 'cp-1', 'admin-9');

            expect(result).toEqual(
                expect.objectContaining({ id: 'cp-1', assignedManagerId: 'admin-9' }),
            );
            // Positive: a successful reassignment records a Counterparty version entry —
            // this is what powers the History tab's "Updated — Counterparty" rows.
            expect(mockVersioningService.recordChange).toHaveBeenCalledWith(
                mockCtx,
                expect.objectContaining({
                    entityName: 'Counterparty',
                    entityId: 'cp-1',
                    action: 'update',
                    changedFields: expect.objectContaining({
                        assignedManagerId: { from: undefined, to: 'admin-9' },
                    }),
                }),
            );
        });

        it('rejects "own" scope entirely', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'own',
                administratorId: 'admin-1',
            });

            await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow();
            // Negative: a rejected reassignment must never record a version entry — the write
            // never happened, so there is nothing to audit.
            expect(mockVersioningService.recordChange).not.toHaveBeenCalled();
        });

        it('rejects "department" scope when the counterparty is outside the caller\'s department', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                departmentId: 'dept-OTHER',
                branchId: 'branch-a',
            });
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });

            await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow();
        });

        it('rejects "department" scope when the target administrator is in a different department', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            (mockAdministratorService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
                customFields: { departmentId: 'dept-OTHER' },
            });

            await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow();
        });

        it('allows "department" scope when both counterparty and target administrator match the department', async () => {
            mockRepo.findOne.mockResolvedValue({
                id: 'cp-1',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            mockRepo.save.mockImplementation(async (c: unknown) => c);
            (
                mockAccessScopeService.resolveCounterpartyScope as ReturnType<typeof vi.fn>
            ).mockResolvedValue({
                kind: 'department',
                departmentId: 'dept-1',
                branchId: 'branch-a',
            });
            (mockAdministratorService.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
                customFields: { departmentId: 'dept-1' },
            });

            const result = await service.reassignManager(mockCtx, 'cp-1', 'admin-9');

            expect(result).toEqual(
                expect.objectContaining({ id: 'cp-1', assignedManagerId: 'admin-9' }),
            );
        });

        it('rejects when the counterparty does not exist', async () => {
            mockRepo.findOne.mockResolvedValue(null);

            await expect(service.reassignManager(mockCtx, 'missing', 'admin-9')).rejects.toThrow(
                UserInputError,
            );
        });
    });
});
