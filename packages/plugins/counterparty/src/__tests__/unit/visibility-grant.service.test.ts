import { describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UserInputError } from '@vendure/core';
import type { RequestContext } from '@vendure/core';

import { VisibilityGrantService } from '../../visibility/visibility-grant.service';

const DAY = 86_400_000;

function setup(options: {
    unrestricted?: boolean;
    team?: number[];
    granted?: string[];
    replica?: boolean;
}) {
    const saved: Array<Record<string, unknown>> = [];
    const qb = {
        where: () => qb,
        andWhere: vi.fn((..._args: unknown[]) => qb),
        getCount: vi.fn().mockResolvedValue(0),
    };
    const repo = {
        query: vi.fn().mockResolvedValue([]),
        find: vi.fn(async ({ where }: { where: unknown[] }) => where.map(() => ({}))),
        create: (input: Record<string, unknown>) => input,
        save: vi.fn(async (input: Record<string, unknown>) => {
            saved.push(input);
            return { id: 1, ...input };
        }),
        createQueryBuilder: () => qb,
        findOne: vi.fn(),
        update: vi.fn(),
    };
    const connection = {
        withTransaction: (ctx: unknown, work: (c: unknown) => unknown) => work(ctx),
        getRepository: () => repo,
    };
    const versioning = { recordChange: vi.fn() };
    const service = new VisibilityGrantService(
        connection as never,
        { findOneByUserId: vi.fn().mockResolvedValue({ id: 10 }) } as never,
        { findTeam: vi.fn().mockResolvedValue((options.team ?? []).map(id => ({ id }))) } as never,
        { activeManagerIds: vi.fn().mockResolvedValue(options.granted ?? []) } as never,
        versioning as never,
        { isReplica: options.replica ?? false } as never,
    );
    const ctx = {
        activeUserId: 'user-10',
        userHasPermissions: () => options.unrestricted ?? false,
    } as unknown as RequestContext;
    return { service, ctx, versioning, saved, repo, qb };
}

const input = (over: Record<string, unknown> = {}) => ({
    granteeAdministratorId: 20,
    managerAdministratorId: 30,
    reason: 'covers two branches',
    ...over,
});

describe('VisibilityGrantService.grant', () => {
    it('ManageAccessControl holders grant anything and the grant is audited with the actor', async () => {
        const { service, ctx, versioning, saved } = setup({ unrestricted: true });
        await service.grant(ctx, input());
        expect(saved[0]).toMatchObject({
            granteeAdministratorId: '20',
            subjectKind: 'manager',
            subjectRef: '30',
            grantedByAdministratorId: '10',
            validFrom: null,
            validTo: null,
        });
        expect(versioning.recordChange).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                entityName: 'VisibilityGrant',
                action: 'create',
                comment: 'covers two branches',
            }),
        );
    });

    it('the dedicated permission alone grants managers the caller sees', async () => {
        const { service, ctx } = setup({ team: [20, 30] });
        await expect(service.grant(ctx, input())).resolves.toBeDefined();
    });

    it('a manager reached through the caller own grants counts as visible', async () => {
        const { service, ctx } = setup({ team: [20], granted: ['30'] });
        await expect(service.grant(ctx, input())).resolves.toBeDefined();
    });

    it('refuses a manager outside the caller visible managers', async () => {
        const { service, ctx, saved, versioning } = setup({ team: [20] });
        await expect(service.grant(ctx, input())).rejects.toBeInstanceOf(ForbiddenError);
        expect(saved).toHaveLength(0);
        expect(versioning.recordChange).not.toHaveBeenCalled();
    });

    it('refuses a grantee outside the caller team', async () => {
        const { service, ctx } = setup({ team: [30] });
        await expect(service.grant(ctx, input())).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('a caller cannot widen their own scope (grantee is the caller)', async () => {
        const { service, ctx } = setup({ team: [10, 30] });
        await expect(
            service.grant(ctx, input({ granteeAdministratorId: 10 })),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it.each([
        ['an empty reason', { reason: '  ' }],
        ['a grant of a manager to itself', { granteeAdministratorId: 30 }],
        [
            'an end before the start',
            { validFrom: new Date(Date.now() + 2 * DAY), validTo: new Date(Date.now() + DAY) },
        ],
        ['an end in the past', { validTo: new Date(Date.now() - DAY) }],
    ])('rejects %s', async (_name, over) => {
        const { service, ctx, saved } = setup({ unrestricted: true });
        await expect(service.grant(ctx, input(over))).rejects.toBeInstanceOf(UserInputError);
        expect(saved).toHaveLength(0);
    });

    it('ignores expired grants in the overlap check', async () => {
        const { service, ctx, qb } = setup({ unrestricted: true });
        await service.grant(ctx, input());
        const clauses = qb.andWhere.mock.calls.map(c => String(c[0]));
        expect(clauses).toContain('(g.validTo IS NULL OR g.validTo > :now)');
    });

    it('rejects an overlapping grant of the same manager', async () => {
        const { service, ctx, qb, saved } = setup({ unrestricted: true });
        qb.getCount.mockResolvedValue(1);
        await expect(service.grant(ctx, input())).rejects.toBeInstanceOf(UserInputError);
        expect(saved).toHaveLength(0);
    });

    it('is refused on a replica instance', async () => {
        const { service, ctx } = setup({ unrestricted: true, replica: true });
        await expect(service.grant(ctx, input())).rejects.toBeInstanceOf(UserInputError);
    });
});

describe('VisibilityGrantService.revoke', () => {
    const openRow = (over: Record<string, unknown> = {}) => ({
        id: 1,
        subjectRef: '30',
        grantedByAdministratorId: '99',
        revokedAt: null,
        ...over,
    });

    it('records the revoke with the actor and keeps the row', async () => {
        const { service, ctx, repo, versioning } = setup({ unrestricted: true });
        repo.findOne.mockResolvedValue(openRow());
        const row = await service.revoke(ctx, 1, ' no longer needed ');
        expect(row.revokedByAdministratorId).toBe('10');
        expect(repo.update).toHaveBeenCalledWith(
            1,
            expect.objectContaining({ revokedByAdministratorId: '10' }),
        );
        expect(versioning.recordChange).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ action: 'deactivate', comment: 'no longer needed' }),
        );
    });

    it('a second revoke is a no-op with no second audit entry', async () => {
        const { service, ctx, repo, versioning } = setup({ unrestricted: true });
        repo.findOne.mockResolvedValue(openRow({ revokedAt: new Date() }));
        await service.revoke(ctx, 1);
        expect(repo.update).not.toHaveBeenCalled();
        expect(versioning.recordChange).not.toHaveBeenCalled();
    });

    it('refuses a caller who neither made the grant nor sees its manager', async () => {
        const { service, ctx, repo } = setup({ team: [20] });
        repo.findOne.mockResolvedValue(openRow());
        await expect(service.revoke(ctx, 1)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('lets the granter revoke their own grant', async () => {
        const { service, ctx, repo } = setup({});
        repo.findOne.mockResolvedValue(openRow({ grantedByAdministratorId: '10' }));
        await expect(service.revoke(ctx, 1)).resolves.toBeDefined();
    });
});
