import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestContext, Role, TransactionalConnection } from '@vendure/core';

import { RoleScopeConfigService } from '../../role-scope-config.service';
import { RoleAccessScope } from '../../entities/role-access-scope.entity';

function role(code: string): Role {
    return { code } as unknown as Role;
}

function scopeRow(roleCode: string, config: Record<string, string> | string): RoleAccessScope {
    return {
        roleCode,
        accessScopeConfig: typeof config === 'string' ? config : JSON.stringify(config),
    } as RoleAccessScope;
}

function createMockRepo(): Record<string, ReturnType<typeof vi.fn>> {
    return {
        find: vi.fn(),
        findOne: vi.fn(),
        create: vi.fn((x: unknown) => x),
        save: vi.fn(async (x: unknown) => x),
    } as unknown as Record<string, ReturnType<typeof vi.fn>>;
}

describe('RoleScopeConfigService', () => {
    let repo: ReturnType<typeof createMockRepo>;
    let connection: { getRepository: (...args: unknown[]) => ReturnType<typeof createMockRepo> };
    let service: RoleScopeConfigService;
    const ctx = {} as unknown as RequestContext;

    beforeEach(() => {
        repo = createMockRepo();
        connection = { getRepository: () => repo };
        service = new RoleScopeConfigService(connection as unknown as TransactionalConnection);
    });

    it('returns "own" for a role scoped to own', async () => {
        repo.find.mockResolvedValue([scopeRow('sales-rep', { counterparty: 'own' })]);
        expect(await service.maxScopeFor(ctx, [role('sales-rep')], 'counterparty')).toBe('own');
    });

    it('returns "department" for a role scoped to department', async () => {
        repo.find.mockResolvedValue([scopeRow('branch-manager', { counterparty: 'department' })]);
        expect(await service.maxScopeFor(ctx, [role('branch-manager')], 'counterparty')).toBe(
            'department',
        );
    });

    it('returns "all" for a role scoped to all', async () => {
        repo.find.mockResolvedValue([scopeRow('central-admin', { counterparty: 'all' })]);
        expect(await service.maxScopeFor(ctx, [role('central-admin')], 'counterparty')).toBe('all');
    });

    it('picks the widest scope across multiple roles', async () => {
        repo.find.mockResolvedValue([
            scopeRow('sales-rep', { counterparty: 'own' }),
            scopeRow('branch-manager', { counterparty: 'department' }),
        ]);
        const result = await service.maxScopeFor(
            ctx,
            [role('sales-rep'), role('branch-manager')],
            'counterparty',
        );
        expect(result).toBe('department');
    });

    it('falls back to "own" when there is no config row for the role, never "all"', async () => {
        repo.find.mockResolvedValue([]);
        expect(await service.maxScopeFor(ctx, [role('unrecognized-role')], 'counterparty')).toBe(
            'own',
        );
    });

    it('falls back to "own" when the resource is not present in the config', async () => {
        repo.find.mockResolvedValue([scopeRow('order-only-role', { order: 'all' })]);
        expect(await service.maxScopeFor(ctx, [role('order-only-role')], 'counterparty')).toBe(
            'own',
        );
    });

    it('falls back to "own" on invalid JSON instead of throwing', async () => {
        repo.find.mockResolvedValue([scopeRow('broken-role', '{not json')]);
        expect(await service.maxScopeFor(ctx, [role('broken-role')], 'counterparty')).toBe('own');
    });

    it('returns "own" immediately with no query when there are no roles', async () => {
        expect(await service.maxScopeFor(ctx, [], 'counterparty')).toBe('own');
        expect(repo.find).not.toHaveBeenCalled();
    });

    describe('getScopeFor', () => {
        it('returns the parsed config for an existing role row', async () => {
            repo.findOne.mockResolvedValue(
                scopeRow('department-head', { counterparty: 'department', order: 'department' }),
            );
            expect(await service.getScopeFor(ctx, 'department-head')).toEqual({
                counterparty: 'department',
                order: 'department',
            });
        });

        it('returns null for a role with no config row', async () => {
            repo.findOne.mockResolvedValue(null);
            expect(await service.getScopeFor(ctx, 'unrecognized-role')).toBeNull();
        });

        it('returns null (not throw) on invalid JSON', async () => {
            repo.findOne.mockResolvedValue(scopeRow('broken-role', '{not json'));
            expect(await service.getScopeFor(ctx, 'broken-role')).toBeNull();
        });
    });
});
