import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import {
    AccessScope,
    AccessScopeService,
    TeamAdministratorService,
} from '@mivend/plugin-access-control';
import type { VersioningService } from '@mivend/plugin-versioning';

import {
    CounterpartyManagerAssignmentService,
    ManagerChangedSinceError,
} from '../../counterparty-manager-assignment.service';

vi.mock('shared', async importOriginal => ({
    ...(await importOriginal<typeof import('shared')>()),
    withAggregateLock: vi.fn(
        async (_c: unknown, ctx: unknown, _k: string, work: (c: unknown) => Promise<unknown>) =>
            work(ctx),
    ),
}));

const mockRepo = { findOne: vi.fn(), save: vi.fn(), update: vi.fn() };
const mockConnection = { getRepository: vi.fn(() => mockRepo) };
const mockTeamAdministratorService = { findInBranch: vi.fn(), findLive: vi.fn() };

// Mirrors findInBranch: the target is found only when its branch equals the caller's.
function targetInBranch(branchId: string | null): void {
    mockTeamAdministratorService.findInBranch.mockImplementation(
        async (_ctx: unknown, callerBranchId: string) =>
            branchId != null && callerBranchId === branchId ? { id: 'admin-9' } : undefined,
    );
}
const mockVersioningService = { recordChange: vi.fn() };
const mockCtx = {} as RequestContext;

// Real AccessScopeService so the writable check runs its actual own/department/all rules.
const accessScopeService = new AccessScopeService({} as never, {} as never, {} as never);
const resolveScope = vi.spyOn(accessScopeService, 'resolveCounterpartyScope');

const departmentScope: AccessScope = {
    kind: 'department',
    departmentId: 'dept-1',
    branchId: 'branch-a',
};

function counterparty(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 'cp-1',
        assignedManagerId: null,
        departmentId: 'dept-1',
        branchId: 'branch-a',
        ...overrides,
    };
}

const mockVersions = { bump: vi.fn(), bumpMany: vi.fn() };

describe('CounterpartyManagerAssignmentService.reassignManager', () => {
    let service: CounterpartyManagerAssignmentService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.save.mockImplementation(async (c: unknown) => c);
        service = new CounterpartyManagerAssignmentService(
            mockConnection as unknown as TransactionalConnection,
            accessScopeService,
            mockTeamAdministratorService as unknown as TeamAdministratorService,
            mockVersioningService as unknown as VersioningService,
            { assignCounterparties: vi.fn() } as never,
            mockVersions as never,
        );
    });

    it('reassigns under "all" scope and records a version entry', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue({ kind: 'all' });

        const result = await service.reassignManager(mockCtx, 'cp-1', 'admin-9');

        expect(result).toEqual(expect.objectContaining({ assignedManagerId: 'admin-9' }));
        expect(mockVersioningService.recordChange).toHaveBeenCalledWith(
            mockCtx,
            expect.objectContaining({
                entityId: 'cp-1',
                changedFields: { assignedManagerId: { from: null, to: 'admin-9' } },
            }),
        );
    });

    it('rejects "own" scope on a counterparty not assigned to the caller, recording nothing', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ assignedManagerId: 'admin-2' }));
        resolveScope.mockResolvedValue({ kind: 'own', administratorId: 'admin-1' });

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
        expect(mockVersioningService.recordChange).not.toHaveBeenCalled();
    });

    it('rejects "department" scope when the counterparty is in another branch', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ branchId: 'branch-b' }));
        resolveScope.mockResolvedValue(departmentScope);

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects "department" scope when the target administrator is in another branch', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        targetInBranch('branch-b');

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('allows "department" scope for a same-branch target', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        targetInBranch('branch-a');

        const result = await service.reassignManager(mockCtx, 'cp-1', 'admin-9');

        expect(result).toEqual(expect.objectContaining({ assignedManagerId: 'admin-9' }));
    });

    it('rejects "department" scope with no branch, even for a null-branch counterparty and target', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ branchId: null }));
        resolveScope.mockResolvedValue({ kind: 'department', departmentId: 'dept-1' });
        targetInBranch(null);

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a branchless target administrator even when the counterparty itself is writable', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        targetInBranch(null);

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('rejects when the counterparty does not exist', async () => {
        mockRepo.findOne.mockResolvedValue(null);

        await expect(service.reassignManager(mockCtx, 'missing', 'admin-9')).rejects.toThrow(
            UserInputError,
        );
    });
});

describe('CounterpartyManagerAssignmentService.reassignOne (#366)', () => {
    const assignOne = { assignCounterparties: vi.fn() };
    let service: CounterpartyManagerAssignmentService;

    beforeEach(() => {
        vi.clearAllMocks();
        service = new CounterpartyManagerAssignmentService(
            mockConnection as unknown as TransactionalConnection,
            accessScopeService,
            mockTeamAdministratorService as unknown as TeamAdministratorService,
            mockVersioningService as unknown as VersioningService,
            assignOne as never,
            mockVersions as never,
        );
    });

    it('changes the manager, bumps the version, records it and recomputes the branch', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ assignedManagerId: 'admin-1' }));
        resolveScope.mockResolvedValue({ kind: 'all' });
        mockTeamAdministratorService.findLive.mockResolvedValue({ id: 'admin-9' });

        expect(await service.reassignOne(mockCtx, 'cp-1', 'admin-9')).toEqual({
            previous: 'admin-1',
            changed: true,
        });
        expect(mockRepo.update).toHaveBeenCalledWith('cp-1', { assignedManagerId: 'admin-9' });
        expect(mockVersions.bump).toHaveBeenCalledWith(mockCtx, 'cp-1');
        expect(assignOne.assignCounterparties).toHaveBeenCalledWith(mockCtx, { ids: ['cp-1'] });
    });

    it('writes nothing when the manager is already the target', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ assignedManagerId: 'admin-9' }));
        resolveScope.mockResolvedValue({ kind: 'all' });
        mockTeamAdministratorService.findLive.mockResolvedValue({ id: 'admin-9' });

        expect(await service.reassignOne(mockCtx, 'cp-1', 'admin-9')).toMatchObject({
            changed: false,
        });
        expect(mockRepo.update).not.toHaveBeenCalled();
        expect(mockVersions.bump).not.toHaveBeenCalled();
    });

    it('refuses a deactivated or unknown target even for an all-scope caller', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue({ kind: 'all' });
        mockTeamAdministratorService.findLive.mockResolvedValue(undefined);

        await expect(service.reassignOne(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a target outside the branch of a department head', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        targetInBranch('branch-b');

        await expect(service.reassignOne(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
    });

    it('refuses a client of another branch before looking at the target', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ branchId: 'branch-b' }));
        resolveScope.mockResolvedValue(departmentScope);

        await expect(service.reassignOne(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockTeamAdministratorService.findInBranch).not.toHaveBeenCalled();
    });

    it('stops when the manager is no longer the one an undo expects', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ assignedManagerId: 'admin-5' }));
        resolveScope.mockResolvedValue({ kind: 'all' });
        mockTeamAdministratorService.findLive.mockResolvedValue({ id: 'admin-1' });

        await expect(service.reassignOne(mockCtx, 'cp-1', 'admin-1', 'admin-9')).rejects.toThrow(
            ManagerChangedSinceError,
        );
        expect(mockRepo.update).not.toHaveBeenCalled();
    });
});
