import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdministratorService, RequestContext } from '@vendure/core';

import { AccessScopeService } from '../../access-scope.service';
import { VisibilityGrantReader } from '../../visibility-grant-reader.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';

function adminOf(id: string): unknown {
    return { id, customFields: { branchId: 'branch-a' }, user: { roles: [{ code: 'r' }] } };
}

describe('AccessScopeService per-request memo', () => {
    let findOneByUserId: ReturnType<typeof vi.fn>;
    let maxScopeFor: ReturnType<typeof vi.fn>;
    let activeManagerIds: ReturnType<typeof vi.fn>;
    let service: AccessScopeService;

    beforeEach(() => {
        findOneByUserId = vi
            .fn()
            .mockImplementation(async (_ctx: unknown, userId: string) =>
                adminOf(`admin-of-${userId}`),
            );
        maxScopeFor = vi.fn().mockResolvedValue('own');
        activeManagerIds = vi.fn().mockResolvedValue([]);
        service = new AccessScopeService(
            { findOneByUserId } as unknown as AdministratorService,
            { maxScopeFor } as unknown as RoleScopeConfigService,
            { activeManagerIds } as unknown as VisibilityGrantReader,
        );
    });

    it('resolves one scope per request and resource however many rows ask', async () => {
        const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
        const scopes = await Promise.all(
            Array.from({ length: 20 }, () => service.resolveCounterpartyScope(ctx)),
        );
        expect(new Set(scopes).size).toBe(1);
        expect(findOneByUserId).toHaveBeenCalledTimes(1);
        expect(maxScopeFor).toHaveBeenCalledTimes(1);
        expect(activeManagerIds).toHaveBeenCalledTimes(1);
    });

    it('keeps resources apart within one request', async () => {
        const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
        maxScopeFor.mockImplementation(async (_c: unknown, _r: unknown, resource: string) =>
            resource === 'order' ? 'all' : 'own',
        );
        expect((await service.resolveOrderScope(ctx)).kind).toBe('all');
        expect((await service.resolveCounterpartyScope(ctx)).kind).toBe('own');
    });

    it('never shares a scope between two users resolved in the same tick', async () => {
        const a = { activeUserId: 'ua' } as unknown as RequestContext;
        const b = { activeUserId: 'ub' } as unknown as RequestContext;
        const [sa, sb] = await Promise.all([
            service.resolveCounterpartyScope(a),
            service.resolveCounterpartyScope(b),
        ]);
        expect(sa.administratorId).toBe('admin-of-ua');
        expect(sb.administratorId).toBe('admin-of-ub');
    });

    it('does not widen scope: an unauthenticated ctx stays own without an administrator', async () => {
        const anon = { activeUserId: undefined } as unknown as RequestContext;
        findOneByUserId.mockClear();
        expect(await service.resolveCounterpartyScope(anon)).toEqual({ kind: 'own' });
        expect(findOneByUserId).not.toHaveBeenCalled();
    });

    it('does not keep a failed lookup: the next call retries and the error is not swallowed', async () => {
        const ctx = { activeUserId: 'u1' } as unknown as RequestContext;
        maxScopeFor.mockRejectedValueOnce(new Error('db down'));
        await expect(service.resolveCounterpartyScope(ctx)).rejects.toThrow('db down');
        expect((await service.resolveCounterpartyScope(ctx)).administratorId).toBe('admin-of-u1');
    });
});
