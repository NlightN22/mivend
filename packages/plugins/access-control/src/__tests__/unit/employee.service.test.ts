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
    let userQueryBuilder: ReturnType<typeof createUserQueryBuilder>;
    let administratorService: ReturnType<typeof createMockAdministratorService>;
    let roleService: ReturnType<typeof createMockRoleService>;
    let requestContextService: ReturnType<typeof createMockRequestContextService>;
    let service: EmployeeService;
    const ctx = {} as unknown as RequestContext;
    const systemCtx = { __system: true } as unknown as RequestContext;

    beforeEach(() => {
        adminRepo = { findOne: vi.fn() };
        roleRepo = { findOne: vi.fn() };
        userQueryBuilder = createUserQueryBuilder();
        const userRepo = { createQueryBuilder: () => userQueryBuilder };
        const connection = {
            getRepository: (_ctx: unknown, entity: { name: string }) => {
                if (entity.name === 'Administrator') return adminRepo;
                if (entity.name === 'User') return userRepo;
                return roleRepo;
            },
        };
        administratorService = createMockAdministratorService();
        roleService = createMockRoleService();
        requestContextService = createMockRequestContextService(systemCtx);
        service = new EmployeeService(
            connection as unknown as TransactionalConnection,
            administratorService as unknown as AdministratorService,
            requestContextService as unknown as RequestContextService,
            roleService as unknown as RoleService,
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

    it('assigns departmentId/branchId customFields via an elevated system context', async () => {
        adminRepo.findOne.mockResolvedValue({ id: 'admin-1' });
        await service.upsert(ctx, {
            erpId: 'emp-1',
            email: 'admin@example.com',
            departmentErpId: 'dept-sales',
            branchId: 'branch-a',
        });
        expect(administratorService.update).toHaveBeenCalledWith(
            systemCtx,
            expect.objectContaining({
                id: 'admin-1',
                customFields: { departmentId: 'dept-sales', branchId: 'branch-a', position: null },
            }),
        );
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
