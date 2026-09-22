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

    it('resolveTeamVisibilityScope resolves against the "teamVisibility" resource', async () => {
        administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-4'));
        roleScopeConfigService.maxScopeFor.mockResolvedValue('all');
        const scope = await service.resolveTeamVisibilityScope(ctx);
        expect(scope).toEqual({ kind: 'all' });
        expect(roleScopeConfigService.maxScopeFor).toHaveBeenCalledWith(
            ctx,
            expect.anything(),
            'teamVisibility',
        );
    });

    it("getOwnDepartmentId returns the caller's departmentId custom field", async () => {
        administratorService.findOneByUserId.mockResolvedValue(
            mockAdmin('admin-5', { departmentId: 'dept-sales' }),
        );
        expect(await service.getOwnDepartmentId(ctx)).toBe('dept-sales');
    });

    it('getOwnDepartmentId returns null when there is no active user', async () => {
        const anonymousCtx = { activeUserId: undefined } as unknown as RequestContext;
        expect(await service.getOwnDepartmentId(anonymousCtx)).toBeNull();
        expect(administratorService.findOneByUserId).not.toHaveBeenCalled();
    });

    describe('assertCounterpartyWritable', () => {
        // departmentId is pure display information (ERP org data), never a scope gate; branchId
        // IS the real gate for "department" scope (security-first correction, 2026-09-20 round
        // 3) — deny-by-default, so a departmentId mismatch alone must not reject as long as
        // branchId matches, and a branchId mismatch (including a null Counterparty.branchId)
        // must reject.
        it('"department" scope ignores a departmentId mismatch when branchId matches', async () => {
            administratorService.findOneByUserId.mockResolvedValue(
                mockAdmin('admin-6', { departmentId: 'dept-1', branchId: 'branch-a' }),
            );
            roleScopeConfigService.maxScopeFor.mockResolvedValue('department');

            await expect(
                service.assertCounterpartyWritable(ctx, {
                    assignedManagerId: null,
                    departmentId: 'dept-OTHER',
                    branchId: 'branch-a',
                }),
            ).resolves.toBeUndefined();
        });

        it('"department" scope rejects a branchId mismatch even when departmentId matches', async () => {
            administratorService.findOneByUserId.mockResolvedValue(
                mockAdmin('admin-6b', { departmentId: 'dept-1', branchId: 'branch-a' }),
            );
            roleScopeConfigService.maxScopeFor.mockResolvedValue('department');

            await expect(
                service.assertCounterpartyWritable(ctx, {
                    assignedManagerId: null,
                    departmentId: 'dept-1',
                    branchId: 'branch-b',
                }),
            ).rejects.toThrow();
        });

        it('"department" scope rejects an unassigned (null) Counterparty.branchId — deny-by-default', async () => {
            administratorService.findOneByUserId.mockResolvedValue(
                mockAdmin('admin-6c', { departmentId: 'dept-1', branchId: 'branch-a' }),
            );
            roleScopeConfigService.maxScopeFor.mockResolvedValue('department');

            await expect(
                service.assertCounterpartyWritable(ctx, {
                    assignedManagerId: null,
                    departmentId: 'dept-1',
                    branchId: null,
                }),
            ).rejects.toThrow();
        });

        it('"own" scope rejects when assignedManagerId does not match the caller', async () => {
            administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-8'));
            roleScopeConfigService.maxScopeFor.mockResolvedValue('own');

            await expect(
                service.assertCounterpartyWritable(ctx, {
                    assignedManagerId: 'someone-else',
                    departmentId: null,
                    branchId: null,
                }),
            ).rejects.toThrow();
        });

        it('"all" scope never rejects', async () => {
            administratorService.findOneByUserId.mockResolvedValue(mockAdmin('admin-9'));
            roleScopeConfigService.maxScopeFor.mockResolvedValue('all');

            await expect(
                service.assertCounterpartyWritable(ctx, {
                    assignedManagerId: 'irrelevant',
                    departmentId: 'irrelevant',
                    branchId: 'irrelevant',
                }),
            ).resolves.toBeUndefined();
        });
    });
});
