import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserInputError } from '@vendure/core';
import type {
    AdministratorService,
    RequestContext,
    RequestContextService,
    RoleService,
    TransactionalConnection,
} from '@vendure/core';

import { EmployeeService } from '../../employee.service';
import type { BranchAssignmentService } from '../../branch-assignment.service';
import type { ErpUserService } from '../../erp-user.service';

function createMockAdministratorService(): Record<string, ReturnType<typeof vi.fn>> {
    return { update: vi.fn(async (..._args: unknown[]) => ({})) } as unknown as Record<
        string,
        ReturnType<typeof vi.fn>
    >;
}

interface MockUserQueryBuilder {
    innerJoinAndSelect: ReturnType<typeof vi.fn>;
    leftJoinAndSelect: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
}

function createUserQueryBuilder(): MockUserQueryBuilder {
    const qb: Record<string, unknown> = {};
    qb.innerJoinAndSelect = vi.fn(() => qb);
    qb.leftJoinAndSelect = vi.fn(() => qb);
    qb.getOne = vi.fn(async () => ({ id: 'super-user-1' }));
    return qb as unknown as MockUserQueryBuilder;
}

function createMockRoleService(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        getSuperAdminRole: vi.fn(async () => ({ id: 'super-admin-role' }) as unknown),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

function createMockRequestContextService(
    systemCtx: unknown,
): Record<string, ReturnType<typeof vi.fn>> {
    return { create: vi.fn(async () => systemCtx) } as unknown as Record<
        string,
        ReturnType<typeof vi.fn>
    >;
}

describe('EmployeeService', () => {
    let adminRepo: { findOne: ReturnType<typeof vi.fn> };
    let roleRepo: { findOne: ReturnType<typeof vi.fn> };
    let branchRepo: { findOne: ReturnType<typeof vi.fn> };
    let userQueryBuilder: ReturnType<typeof createUserQueryBuilder>;
    let administratorService: ReturnType<typeof createMockAdministratorService>;
    let roleService: ReturnType<typeof createMockRoleService>;
    let requestContextService: ReturnType<typeof createMockRequestContextService>;
    let branchAssignment: { assignAdministrator: ReturnType<typeof vi.fn> };
    let service: EmployeeService;
    let erpUserService: { setPositionIfExists: ReturnType<typeof vi.fn> };
    const ctx = {} as unknown as RequestContext;
    const systemCtx = { __system: true } as unknown as RequestContext;

    beforeEach(() => {
        adminRepo = { findOne: vi.fn() };
        roleRepo = { findOne: vi.fn() };
        branchRepo = { findOne: vi.fn() };
        userQueryBuilder = createUserQueryBuilder();
        const userRepo = { createQueryBuilder: () => userQueryBuilder };
        const connection = {
            getRepository: (_ctx: unknown, entity: { name: string }) => {
                if (entity.name === 'Administrator') return adminRepo;
                if (entity.name === 'User') return userRepo;
                if (entity.name === 'Branch') return branchRepo;
                return roleRepo;
            },
        };
        administratorService = createMockAdministratorService();
        roleService = createMockRoleService();
        requestContextService = createMockRequestContextService(systemCtx);
        erpUserService = { setPositionIfExists: vi.fn().mockResolvedValue(true) };
        branchAssignment = { assignAdministrator: vi.fn() };
        service = new EmployeeService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
            requestContextService as unknown as RequestContextService,
            roleService as unknown as RoleService,
            erpUserService as unknown as ErpUserService,
            branchAssignment as unknown as BranchAssignmentService,
        );
    });

    it('writes the position to the ERP user, not to the Administrator', async () => {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        await service.upsert(ctx, {
            erpId: 'emp-1',
            email: 'admin@example.com',
            departmentErpId: 'dept-sales',
            positionErpId: 'pos-1',
        });
        expect(erpUserService.setPositionIfExists).toHaveBeenCalledWith(ctx, 'emp-1', 'pos-1');
        expect(administratorService.update).toHaveBeenCalledWith(
            systemCtx,
            expect.objectContaining({
                customFields: { departmentId: 'dept-sales' },
            }),
        );
    });

    it('skips silently (no update) when no Administrator matches the email', async () => {
        adminRepo.findOne.mockResolvedValue(null);
        await service.upsert(ctx, {
            erpId: 'emp-1',
            email: 'nobody@example.com',
            departmentErpId: 'dept-sales',
        });
        expect(administratorService.update).not.toHaveBeenCalled();
    });

    it('writes only departmentId and delegates branchId to BranchAssignmentService', async () => {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        await service.upsert(ctx, {
            erpId: 'emp-1',
            email: 'admin@example.com',
            departmentErpId: 'dept-sales',
        });
        expect(administratorService.update).toHaveBeenCalledWith(
            systemCtx,
            expect.objectContaining({ customFields: { departmentId: 'dept-sales' } }),
        );
        expect(branchAssignment.assignAdministrator).toHaveBeenCalledWith(ctx, 'admin-1');
    });

    it('assigns roleIds when roleCode matches a registered Role', async () => {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        roleRepo.findOne.mockResolvedValue({ id: 'role-7', code: 'manager' });
        await service.upsert(ctx, {
            erpId: 'emp-1',
            email: 'admin@example.com',
            departmentErpId: 'dept-sales',
            roleCode: 'manager',
        });
        expect(administratorService.update).toHaveBeenCalledWith(
            systemCtx,
            expect.objectContaining({ roleIds: ['role-7'] }),
        );
    });

    it('throws UserInputError for an unregistered roleCode instead of silently skipping it', async () => {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        roleRepo.findOne.mockResolvedValue(null);
        await expect(
            service.upsert(ctx, {
                erpId: 'emp-1',
                email: 'admin@example.com',
                departmentErpId: 'dept-sales',
                roleCode: 'no-such-role',
            }),
        ).rejects.toThrow(UserInputError);
        expect(administratorService.update).not.toHaveBeenCalled();
    });
});
