import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext } from '@vendure/core';

import { AccessControlResolver } from '../../access-control.resolver';
import { AccessScopeService } from '../../access-scope.service';
import { BranchService } from '../../branch.service';
import { CreditTermLimitService } from '../../credit-term-limit.service';
import { DepartmentService } from '../../department.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';

function mockAdministrator(
    id: string,
    firstName: string,
    lastName: string,
    customFields: Record<string, unknown>,
    roleCodes: string[] = [],
): {
    id: string;
    firstName: string;
    lastName: string;
    customFields: Record<string, unknown>;
    user: { roles: { code: string }[] };
} {
    return {
        id,
        firstName,
        lastName,
        customFields,
        user: { roles: roleCodes.map(code => ({ code })) },
    };
}

describe('AccessControlResolver.teamMembers', () => {
    it('always returns real names, regardless of department or teamVisibility scope — used by manager pickers/filters, not the org directory', async () => {
        const administratorService = { findAll: vi.fn() };
        const resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as CreditTermLimitService,
            administratorService as unknown as AdministratorService,
            {} as AccessScopeService,
        );
        administratorService.findAll.mockResolvedValue({
            items: [
                mockAdministrator('5', 'Petr', 'Manager', { departmentId: 'dept-purchasing' }, [
                    'manager',
                ]),
            ],
        });

        const [member] = await resolver.teamMembers({} as RequestContext);
        expect(member).toEqual({
            id: '5',
            firstName: 'Petr',
            lastName: 'Manager',
            roleCodes: ['manager'],
        });
    });
});

describe('AccessControlResolver.teamDirectory', () => {
    let administratorService: { findAll: ReturnType<typeof vi.fn> };
    let accessScopeService: {
        getOwnDepartmentId: ReturnType<typeof vi.fn>;
        resolveTeamVisibilityScope: ReturnType<typeof vi.fn>;
    };
    let resolver: AccessControlResolver;
    const ctx = {} as RequestContext;

    beforeEach(() => {
        administratorService = { findAll: vi.fn() };
        accessScopeService = {
            getOwnDepartmentId: vi.fn(),
            resolveTeamVisibilityScope: vi.fn(),
        };
        resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as CreditTermLimitService,
            administratorService as unknown as AdministratorService,
            accessScopeService as unknown as AccessScopeService,
        );
    });

    it("always shows names for colleagues in the caller's own department", async () => {
        administratorService.findAll.mockResolvedValue({
            items: [
                mockAdministrator('1', 'Olga', 'DeptHead', { departmentId: 'dept-sales' }, [
                    'department-head',
                ]),
            ],
        });
        accessScopeService.getOwnDepartmentId.mockResolvedValue('dept-sales');
        accessScopeService.resolveTeamVisibilityScope.mockResolvedValue({ kind: 'own' });

        const result = await resolver.teamDirectory(ctx);
        expect(result).toEqual([
            {
                id: '1',
                firstName: 'Olga',
                lastName: 'DeptHead',
                roleCodes: ['department-head'],
                departmentId: 'dept-sales',
                branchId: null,
                position: null,
            },
        ]);
    });

    it('hides names for a different department when scope is not "all"', async () => {
        administratorService.findAll.mockResolvedValue({
            items: [mockAdministrator('2', 'Petr', 'Manager', { departmentId: 'dept-purchasing' })],
        });
        accessScopeService.getOwnDepartmentId.mockResolvedValue('dept-sales');
        accessScopeService.resolveTeamVisibilityScope.mockResolvedValue({ kind: 'department' });

        const [member] = await resolver.teamDirectory(ctx);
        expect(member.firstName).toBeNull();
        expect(member.lastName).toBeNull();
        expect(member.departmentId).toBe('dept-purchasing');
    });

    it('shows names for a different department when scope is "all"', async () => {
        administratorService.findAll.mockResolvedValue({
            items: [
                mockAdministrator('3', 'Nikolai', 'Director', { departmentId: 'dept-executive' }),
            ],
        });
        accessScopeService.getOwnDepartmentId.mockResolvedValue('dept-sales');
        accessScopeService.resolveTeamVisibilityScope.mockResolvedValue({ kind: 'all' });

        const [member] = await resolver.teamDirectory(ctx);
        expect(member.firstName).toBe('Nikolai');
        expect(member.lastName).toBe('Director');
    });

    it('exposes position/branch custom fields', async () => {
        administratorService.findAll.mockResolvedValue({
            items: [
                mockAdministrator('4', 'Ivan', 'Operator', {
                    departmentId: 'dept-sales',
                    branchId: 'branch-central',
                    position: 'Sales operator',
                }),
            ],
        });
        accessScopeService.getOwnDepartmentId.mockResolvedValue('dept-sales');
        accessScopeService.resolveTeamVisibilityScope.mockResolvedValue({ kind: 'own' });

        const [member] = await resolver.teamDirectory(ctx);
        expect(member.branchId).toBe('branch-central');
        expect(member.position).toBe('Sales operator');
    });
});
