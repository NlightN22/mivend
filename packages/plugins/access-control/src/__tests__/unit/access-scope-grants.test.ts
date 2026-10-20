import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '@vendure/core';
import type { AdministratorService, RequestContext } from '@vendure/core';

import { AccessScopeService } from '../../access-scope.service';
import type { RoleScopeConfigService } from '../../role-scope-config.service';
import type { VisibilityGrantReader } from '../../visibility-grant-reader.service';
import type { AccessScope } from '../../types';

const ctx = { activeUserId: 'user-1' } as unknown as RequestContext;

function build(maxScope: 'own' | 'department' | 'all', granted: string[]) {
    const reader = { activeManagerIds: vi.fn().mockResolvedValue(granted) };
    const service = new AccessScopeService(
        {
            findOneByUserId: vi.fn().mockResolvedValue({
                id: 5,
                customFields: { branchId: 'branch-a' },
                user: { roles: [{ code: 'r' }] },
            }),
        } as unknown as AdministratorService,
        { maxScopeFor: vi.fn().mockResolvedValue(maxScope) } as unknown as RoleScopeConfigService,
        reader as unknown as VisibilityGrantReader,
    );
    return { service, reader };
}

const row = (assignedManagerId: string | null, branchId: string | null) => ({
    assignedManagerId,
    branchId,
    departmentId: null,
});

describe('scope resolver with visibility grants (#123)', () => {
    it('returns the granted managers next to the own scope', async () => {
        const { service, reader } = build('own', ['7', '8']);
        expect(await service.resolveCounterpartyScope(ctx)).toEqual({
            kind: 'own',
            administratorId: 5,
            grantedManagerIds: ['7', '8'],
        });
        expect(reader.activeManagerIds).toHaveBeenCalledWith(ctx, '5');
    });

    it('keeps the primary branch and adds the granted managers for a branch-scoped role', async () => {
        const { service } = build('department', ['7']);
        const scope = await service.resolveOrderScope(ctx);
        expect(scope).toMatchObject({ kind: 'department', branchId: 'branch-a' });
        expect(scope.grantedManagerIds).toEqual(['7']);
    });

    it('does not read grants for an all-scope role', async () => {
        const { service, reader } = build('all', ['7']);
        expect(await service.resolveCounterpartyScope(ctx)).toEqual({ kind: 'all' });
        expect(reader.activeManagerIds).not.toHaveBeenCalled();
    });

    it('denies by default: no grants means no manager clause for an own scope', async () => {
        const { service } = build('own', []);
        const scope = await service.resolveCounterpartyScope(ctx);
        expect(service.managerClause(scope, 'c')).toBeNull();
    });
});

describe('manager clause', () => {
    const { service } = build('all', []);

    it('adds the caller itself for a branch-scoped caller', () => {
        const scope: AccessScope = {
            kind: 'department',
            administratorId: 5,
            grantedManagerIds: ['7'],
        };
        expect(service.managerClause(scope, 'c')).toEqual({
            sql: 'c."assignedManagerId" IN (:...visibleManagerIds)',
            params: { visibleManagerIds: ['5', '7'] },
        });
    });

    it('uses only granted managers for an own scope (own clients have their own filter)', () => {
        const scope: AccessScope = { kind: 'own', administratorId: 5, grantedManagerIds: ['7'] };
        expect(service.managerClause(scope, 'c')?.params).toEqual({ visibleManagerIds: ['7'] });
    });
});

describe('assertCounterpartyWritableInScope with grants', () => {
    const { service } = build('all', []);

    it('own: a granted manager is writable, another manager is not', () => {
        const scope: AccessScope = { kind: 'own', administratorId: 5, grantedManagerIds: ['7'] };
        expect(() =>
            service.assertCounterpartyWritableInScope(scope, row('7', null)),
        ).not.toThrow();
        expect(() => service.assertCounterpartyWritableInScope(scope, row('9', null))).toThrow(
            ForbiddenError,
        );
    });

    it('department: a granted manager wins over a foreign branch, nothing else does', () => {
        const scope: AccessScope = {
            kind: 'department',
            administratorId: 5,
            branchId: 'branch-a',
            grantedManagerIds: ['7'],
        };
        expect(() =>
            service.assertCounterpartyWritableInScope(scope, row('7', 'branch-b')),
        ).not.toThrow();
        expect(() =>
            service.assertCounterpartyWritableInScope(scope, row('9', 'branch-b')),
        ).toThrow(ForbiddenError);
        expect(() =>
            service.assertCounterpartyWritableInScope(scope, row(null, 'branch-b')),
        ).toThrow(ForbiddenError);
    });

    it('department: a branchless caller writes only granted managers rows', () => {
        const scope: AccessScope = {
            kind: 'department',
            administratorId: 5,
            grantedManagerIds: [],
        };
        expect(() => service.assertCounterpartyWritableInScope(scope, row('9', null))).toThrow(
            ForbiddenError,
        );
    });
});
