import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext } from '@vendure/core';

import { AccessScopeService } from '../../access-scope.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';

function mockAdmin(
    id: string,
    customFields: Record<string, unknown> = {},
): { id: string; customFields: Record<string, unknown>; user: { roles: { code: string }[] } } {
    return {
        id,
        customFields,
        user: { roles: [{ code: 'test-role' }] },
    };
}

describe('AccessScopeService', () => {
    let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
    let roleScopeConfigService: { maxScopeFor: ReturnType<typeof vi.fn> };
    let service: AccessScopeService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        administratorService = { findOneByUserId: vi.fn() };
        roleScopeConfigService = { maxScopeFor: vi.fn() };
        service = new AccessScopeService(
            administratorService as unknown as AdministratorService,
            roleScopeConfigService as unknown as RoleScopeConfigService,
        );
    });

    it('resolves "own" scope with the administrator id attached', async () => {
        administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-1'));
        roleScopeConfigService.maxScopeFor.mockResolvedValue('own');
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({ kind: 'own', administratorId: 'admin-1' });
    });

    it('resolves "department" scope with department/branch ids attached', async () => {
        administratorService.findOneByUserId.mockResolvedValue(
            mockAdmin('admin-2', { departmentId: 'dept-1', branchId: 'branch-a' }),
        );
        roleScopeConfigService.maxScopeFor.mockResolvedValue('department');
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({
            kind: 'department',
            administratorId: 'admin-2',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });
    });

    it('resolves "all" scope with no ownership identifiers', async () => {
        administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-3'));
        roleScopeConfigService.maxScopeFor.mockResolvedValue('all');
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({ kind: 'all' });
    });

    it('falls back to "own" with no administrator id when there is no active user', async () => {
        const anonymousCtx = { activeUserId: undefined } as unknown as RequestContext;
        const scope = await service.resolveCounterpartyScope(anonymousCtx);
        expect(scope).toEqual({ kind: 'own' });
        expect(administratorService.findOneByUserId).not.toHaveBeenCalled();
        expect(roleScopeConfigService.maxScopeFor).not.toHaveBeenCalled();
    });
});
