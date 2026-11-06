import { describe, expect, it, vi } from 'vitest';
import type { RequestContext, TransactionalConnection } from '@vendure/core';

import type { AccessScopeService } from '../../access-scope.service';
import type { DepartmentService } from '../../department.service';
import type { ErpUserService } from '../../erp-user.service';
import type { PositionService } from '../../position.service';
import type { TeamAdministratorService } from '../../team-administrator.service';
import { TeamDirectoryService } from '../../team-directory.service';

const ctx = { userHasPermissions: () => true } as unknown as RequestContext;
const operatorCtx = { userHasPermissions: () => false } as unknown as RequestContext;

interface Built {
    service: TeamDirectoryService;
    qb: Record<string, unknown>;
}

function build(
    admins: unknown[],
    visibility: 'all' | 'department',
    ownDepartmentId = 'dept-sales',
): Built {
    const qb: Record<string, unknown> = {};
    for (const m of ['withDeleted', 'andWhere', 'leftJoinAndSelect', 'orderBy', 'skip', 'take']) {
        qb[m] = vi.fn().mockReturnValue(qb);
    }
    qb.getManyAndCount = vi.fn().mockResolvedValue([admins, admins.length]);
    qb.getCount = vi.fn().mockResolvedValue(7);
    const connection = {
        getRepository: () => ({ createQueryBuilder: () => qb }),
    } as unknown as TransactionalConnection;
    const service = new TeamDirectoryService(
        connection,
        {
            resolveBranch: async () => ({ kind: 'branch', branchId: 'branch-a' }),
        } as unknown as TeamAdministratorService,
        {
            getOwnDepartmentId: async () => ownDepartmentId,
            resolveTeamVisibilityScope: async () => ({ kind: visibility }),
        } as unknown as AccessScopeService,
        {
            findAll: async () => [{ erpId: 'dept-sales', name: 'Sales' }],
        } as unknown as DepartmentService,
        {
            findPositionErpIds: async () => new Map([['u-1', 'pos-1']]),
        } as unknown as ErpUserService,
        {
            findNamesByErpIds: async () => new Map([['pos-1', 'Sales operator']]),
        } as unknown as PositionService,
    );
    return { service, qb };
}

function admin(
    id: number,
    departmentId: string | null,
    deletedAt: Date | null = null,
): Record<string, unknown> {
    return {
        id,
        firstName: 'First',
        lastName: `Last${id}`,
        deletedAt,
        customFields: { departmentId, branchId: 'branch-a', erpId: `u-${id}` },
        user: { roles: [{ code: 'manager' }] },
    };
}

describe('TeamDirectoryService.findPage', () => {
    it('masks names outside the own department, keeps department, position and active flag', async () => {
        const { service } = build(
            [admin(1, 'dept-sales'), admin(2, 'dept-stock', new Date())],
            'department',
        );

        const { items } = await service.findPage(ctx, {});

        expect(items[0]).toMatchObject({
            lastName: 'Last1',
            departmentName: 'Sales',
            position: 'Sales operator',
            active: true,
        });
        expect(items[1]).toMatchObject({
            firstName: null,
            lastName: null,
            departmentId: 'dept-stock',
            departmentName: null,
            active: false,
        });
    });

    it('shows every name when teamVisibility is all', async () => {
        const { service } = build([admin(2, 'dept-stock')], 'all');

        expect((await service.findPage(ctx, {})).items[0].lastName).toBe('Last2');
    });

    it('take 0 runs a bare count without joins', async () => {
        const { service, qb } = build([], 'all');

        expect(await service.findPage(ctx, { take: 0 })).toEqual({ items: [], totalItems: 7 });
        expect(qb.leftJoinAndSelect).not.toHaveBeenCalled();
    });

    it('without ManageAdministratorLifecycle: live rows only, inactive filter is empty, take is capped', async () => {
        const { service, qb } = build([admin(1, 'dept-sales')], 'all');

        await service.findPage(operatorCtx, { take: 1000 });
        expect(qb.withDeleted).not.toHaveBeenCalled();
        expect(qb.take).toHaveBeenCalledWith(100);

        expect(await service.findPage(operatorCtx, { filter: { status: 'inactive' } })).toEqual({
            items: [],
            totalItems: 0,
        });
        expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);

        await service.findPage(ctx, {});
        expect(qb.withDeleted).toHaveBeenCalledTimes(1);
    });
});
