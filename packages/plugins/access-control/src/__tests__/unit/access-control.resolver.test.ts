import { describe, it, expect, vi } from 'vitest';
import type { RequestContext } from '@vendure/core';

import { AccessControlResolver, AdministratorStatusResolver } from '../../access-control.resolver';
import { AdministratorActivationService } from '../../administrator-activation.service';
import { AdministratorProvisioningService } from '../../administrator-provisioning.service';
import { BranchService } from '../../branch.service';
import { BranchSettingsService } from '../../branch-settings.service';
import { CreditTermLimitService } from '../../credit-term-limit.service';
import { DepartmentService } from '../../department.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';
import { TeamAdministratorService } from '../../team-administrator.service';
import { WarehouseService } from '../../warehouse.service';

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
        const teamAdministratorService = { findTeam: vi.fn() };
        const resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as WarehouseService,
            {} as BranchSettingsService,
            {} as CreditTermLimitService,
            {} as AdministratorProvisioningService,
            {} as AdministratorActivationService,
            teamAdministratorService as unknown as TeamAdministratorService,
        );
        teamAdministratorService.findTeam.mockResolvedValue([
            mockAdministrator('5', 'Petr', 'Manager', { departmentId: 'dept-purchasing' }, [
                'manager',
            ]),
        ]);

        const [member] = await resolver.teamMembers({} as RequestContext);
        expect(member).toEqual({
            id: '5',
            firstName: 'Petr',
            lastName: 'Manager',
            roleCodes: ['manager'],
        });
    });
});

describe('AccessControlResolver.portalUsers', () => {
    it('delegates to AdministratorActivationService.findAllWithStatus with the given options/status', async () => {
        const administratorActivationService = { findAllWithStatus: vi.fn() };
        const resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as WarehouseService,
            {} as BranchSettingsService,
            {} as CreditTermLimitService,
            {} as AdministratorProvisioningService,
            administratorActivationService as unknown as AdministratorActivationService,
            {} as TeamAdministratorService,
        );
        const ctx = {} as RequestContext;
        administratorActivationService.findAllWithStatus.mockResolvedValue({
            items: [],
            totalItems: 0,
        });

        await resolver.portalUsers(ctx, { options: { take: 20 }, status: 'active' });

        expect(administratorActivationService.findAllWithStatus).toHaveBeenCalledWith(
            ctx,
            { take: 20 },
            'active',
        );
    });
});

describe('AccessControlResolver.resetAdministratorPassword', () => {
    it('returns success:true on a successful reset', async () => {
        const administratorProvisioningService = { completePasswordReset: vi.fn() };
        const resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as WarehouseService,
            {} as BranchSettingsService,
            {} as CreditTermLimitService,
            administratorProvisioningService as unknown as AdministratorProvisioningService,
            {} as AdministratorActivationService,
            {} as TeamAdministratorService,
        );
        administratorProvisioningService.completePasswordReset.mockResolvedValue({ success: true });

        const result = await resolver.resetAdministratorPassword({} as RequestContext, {
            token: 'tok-1',
            password: 'new-pass',
        });

        expect(result).toEqual({ success: true, reason: null });
    });

    it('surfaces the failure reason without throwing', async () => {
        const administratorProvisioningService = { completePasswordReset: vi.fn() };
        const resolver = new AccessControlResolver(
            {} as RoleScopeConfigService,
            {} as DepartmentService,
            {} as BranchService,
            {} as WarehouseService,
            {} as BranchSettingsService,
            {} as CreditTermLimitService,
            administratorProvisioningService as unknown as AdministratorProvisioningService,
            {} as AdministratorActivationService,
            {} as TeamAdministratorService,
        );
        administratorProvisioningService.completePasswordReset.mockResolvedValue({
            success: false,
            reason: 'expired',
        });

        const result = await resolver.resetAdministratorPassword({} as RequestContext, {
            token: 'tok-1',
            password: 'new-pass',
        });

        expect(result).toEqual({ success: false, reason: 'expired' });
    });
});

describe('AdministratorStatusResolver.isActive', () => {
    const resolver = new AdministratorStatusResolver();

    it('is true when deletedAt is null', () => {
        expect(resolver.isActive({ deletedAt: null } as never)).toBe(true);
    });

    it('is false when deletedAt is set', () => {
        expect(resolver.isActive({ deletedAt: new Date() } as never)).toBe(false);
    });
});
