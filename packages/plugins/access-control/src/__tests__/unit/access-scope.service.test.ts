import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext } from '@vendure/core';

import { AccessScopeService } from '../../access-scope.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';

function mockAdmin(id: string, maxScope: string, customFields: Record<string, unknown> = {}) {
    return {
        id,
        customFields,
        user: {
            roles: [
                {
                    code: 'test-role',
                    customFields: { accessScopeConfig: JSON.stringify({ counterparty: maxScope }) },
                },
            ],
        },
    };
}

describe('AccessScopeService', () => {
    let administratorService: { findOneByUserId: ReturnType<typeof vi.fn> };
    let service: AccessScopeService;
    const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

    beforeEach(() => {
        administratorService = { findOneByUserId: vi.fn() };
        service = new AccessScopeService(
            administratorService as unknown as AdministratorService,
            new RoleScopeConfigService(),
        );
    });

    it('resolves "own" scope with the administrator id attached', async () => {
        administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-1', 'own'));
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({ kind: 'own', administratorId: 'admin-1' });
    });

    it('resolves "department" scope with department/branch ids attached', async () => {
        administratorService.findOneByUserId.mockResolvedValue(
            mockAdmin('admin-2', 'department', { departmentId: 'dept-1', branchId: 'branch-a' }),
        );
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({
            kind: 'department',
            administratorId: 'admin-2',
            departmentId: 'dept-1',
            branchId: 'branch-a',
        });
    });

    it('resolves "all" scope with no ownership identifiers', async () => {
        administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-3', 'all'));
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(scope).toEqual({ kind: 'all' });
    });

    it('falls back to "own" with no administrator id when there is no active user', async () => {
        const anonymousCtx = { activeUserId: undefined } as unknown as RequestContext;
        const scope = await service.resolveCounterpartyScope(anonymousCtx);
        expect(scope).toEqual({ kind: 'own' });
        expect(administratorService.findOneByUserId).not.toHaveBeenCalled();
    });
});
