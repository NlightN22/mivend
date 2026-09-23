import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AdministratorService,
    ForbiddenError,
    RequestContext,
    TransactionalConnection,
    UserInputError,
} from '@vendure/core';
import { AccessScope, AccessScopeService } from '@mivend/plugin-access-control';
import type { VersioningService } from '@mivend/plugin-versioning';

import {
    CounterpartyManagerAssignmentService,
    MAX_BULK_REASSIGN,
} from '../../counterparty-manager-assignment.service';
import type { CounterpartyService } from '../../counterparty.service';

const mockRepo = { findOne: vi.fn(), save: vi.fn() };
const mockConnection = { getRepository: vi.fn(() => mockRepo) };
const mockCounterpartyService = { visibleFilteredQb: vi.fn() };
const mockAdministratorService = { findOne: vi.fn() };
const mockVersioningService = { recordChange: vi.fn() };
const mockCtx = {} as RequestContext;

// Real AccessScopeService so the writable check runs its actual own/department/all rules.
const accessScopeService = new AccessScopeService({} as never, {} as never);
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

describe('CounterpartyManagerAssignmentService.reassignManager', () => {
    let service: CounterpartyManagerAssignmentService;

    beforeEach(() => {
        vi.clearAllMocks();
        mockRepo.save.mockImplementation(async (c: unknown) => c);
        service = new CounterpartyManagerAssignmentService(
            mockConnection as unknown as TransactionalConnection,
            mockCounterpartyService as unknown as CounterpartyService,
            accessScopeService,
            mockAdministratorService as unknown as AdministratorService,
            mockVersioningService as unknown as VersioningService,
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
        expect(mockRepo.save).not.toHaveBeenCalled();
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
        mockAdministratorService.findOne.mockResolvedValue({
            customFields: { departmentId: 'dept-1', branchId: 'branch-b' },
        });

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.save).not.toHaveBeenCalled();
    });

    // departmentId is informational only (docs/access-control.md) — it must not block this.
    it('allows "department" scope for a same-branch target even when its departmentId differs', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        mockAdministratorService.findOne.mockResolvedValue({
            customFields: { departmentId: 'dept-OTHER', branchId: 'branch-a' },
        });

        const result = await service.reassignManager(mockCtx, 'cp-1', 'admin-9');

        expect(result).toEqual(expect.objectContaining({ assignedManagerId: 'admin-9' }));
    });

    it('rejects "department" scope with no branch, even for a null-branch counterparty and target', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty({ branchId: null }));
        resolveScope.mockResolvedValue({ kind: 'department', departmentId: 'dept-1' });
        mockAdministratorService.findOne.mockResolvedValue({ customFields: { branchId: null } });

        await expect(service.reassignManager(mockCtx, 'cp-1', 'admin-9')).rejects.toThrow(
            ForbiddenError,
        );
        expect(mockRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a branchless target administrator even when the counterparty itself is writable', async () => {
        mockRepo.findOne.mockResolvedValue(counterparty());
        resolveScope.mockResolvedValue(departmentScope);
        mockAdministratorService.findOne.mockResolvedValue({ customFields: { branchId: null } });

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

    it('reassignManagerByFilter rejects above the bulk cap before querying anything', async () => {
        await expect(
            service.reassignManagerByFilter(mockCtx, {}, 'admin-9', MAX_BULK_REASSIGN + 1),
        ).rejects.toThrow(UserInputError);
        expect(mockCounterpartyService.visibleFilteredQb).not.toHaveBeenCalled();
    });
});
