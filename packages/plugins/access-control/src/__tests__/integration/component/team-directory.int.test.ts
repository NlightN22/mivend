import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { AccessScopeService } from '../../../access-scope.service';
import type { DepartmentService } from '../../../department.service';
import type { ErpUserService } from '../../../erp-user.service';
import type { PositionService } from '../../../position.service';
import { TeamAdministratorService } from '../../../team-administrator.service';
import { TeamDirectoryService } from '../../../team-directory.service';
import type { AccessScope } from '../../../types';

class TestAdminCustomFields {
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @Column({ name: 'customFieldsDepartmentid', type: 'varchar', nullable: true })
    departmentId!: string | null;
    @Column({ name: 'customFieldsErpid', type: 'varchar', nullable: true })
    erpId!: string | null;
}

@Entity('role')
class TestRole {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('user')
class TestUser {
    @PrimaryGeneratedColumn() id!: number;

    @ManyToMany(() => TestRole)
    @JoinTable()
    roles!: TestRole[];
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) firstName!: string;
    @Column({ type: 'varchar' }) lastName!: string;

    @Column({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;

    @Column({ type: 'int', nullable: true }) userId!: number | null;

    @Column(() => TestAdminCustomFields)
    customFields!: TestAdminCustomFields;

    @OneToOne(() => TestUser)
    @JoinColumn({ name: 'userId' })
    user?: TestUser;
}

const ctx = { userHasPermissions: () => true } as unknown as RequestContext;
const operatorCtx = { userHasPermissions: () => false } as unknown as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_team_directory');
let dataSource: DataSource;
const resolveCounterpartyScope = vi.fn();
const getOwnDepartmentId = vi.fn();
const resolveTeamVisibilityScope = vi.fn();
let service: TeamDirectoryService;

async function addAdmin(
    firstName: string,
    lastName: string,
    fields: Partial<TestAdminCustomFields>,
    roleCode: string,
    deleted = false,
): Promise<void> {
    const role = await dataSource.getRepository(TestRole).save({ code: roleCode });
    const user = await dataSource.getRepository(TestUser).save({ roles: [role] });
    await dataSource.getRepository(TestAdministrator).save({
        firstName,
        lastName,
        userId: user.id,
        customFields: { branchId: null, departmentId: null, erpId: null, ...fields },
        deletedAt: deleted ? new Date() : null,
    });
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestAdministrator, TestUser, TestRole],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) => {
            if (entity !== Administrator) throw new Error('unexpected entity');
            return dataSource.getRepository(TestAdministrator);
        },
    } as unknown as TransactionalConnection;
    const accessScope = {
        resolveCounterpartyScope,
        getOwnDepartmentId,
        resolveTeamVisibilityScope,
    } as unknown as AccessScopeService;
    service = new TeamDirectoryService(
        connection,
        new TeamAdministratorService(connection, accessScope),
        accessScope,
        {
            findAll: async () => [
                { erpId: 'dept-sales', name: 'Sales' },
                { erpId: 'dept-stock', name: 'Stock' },
            ],
        } as unknown as DepartmentService,
        { findPositionErpIds: async () => new Map() } as unknown as ErpUserService,
        { findNamesByErpIds: async () => new Map() } as unknown as PositionService,
    );
    const sales = { branchId: 'branch-a', departmentId: 'dept-sales' };
    await addAdmin('Olga', 'Sales', { ...sales, erpId: 'e-1' }, 'department-head');
    await addAdmin('Ivan', 'Seller', { ...sales, erpId: 'e-2' }, 'manager');
    await addAdmin(
        'Petr',
        'Stockman',
        { branchId: 'branch-a', departmentId: 'dept-stock', erpId: 'e-3' },
        'operator',
    );
    await addAdmin('Anna', 'Nodept', { branchId: 'branch-a', erpId: 'e-4' }, 'manager');
    await addAdmin('Gone', 'Seller', { ...sales, erpId: 'e-5' }, 'manager', true);
    await addAdmin(
        'Boris',
        'Elsewhere',
        { branchId: 'branch-b', departmentId: 'dept-sales', erpId: 'e-6' },
        'manager',
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(() => {
    vi.clearAllMocks();
    getOwnDepartmentId.mockResolvedValue('dept-sales');
    resolveTeamVisibilityScope.mockResolvedValue({ kind: 'department' });
});

const branchA: AccessScope = { kind: 'department', administratorId: 1, branchId: 'branch-a' };
const allScope: AccessScope = { kind: 'all' };

async function lastNames(
    options: Parameters<TeamDirectoryService['findPage']>[1],
): Promise<string[]> {
    const page = await service.findPage(ctx, options);
    return page.items.map(i => i.lastName ?? `#${i.erpId}`).sort();
}

describe('TeamDirectoryService.findPage', () => {
    it('masks names outside the own department and keeps the rest of the row', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        const { items } = await service.findPage(ctx, { filter: { status: 'active' } });

        const stock = items.find(i => i.erpId === 'e-3');
        expect(stock).toMatchObject({
            firstName: null,
            lastName: null,
            departmentName: 'Stock',
            roleCodes: ['operator'],
            active: true,
        });
        expect(items.find(i => i.erpId === 'e-1')).toMatchObject({
            lastName: 'Sales',
            departmentName: 'Sales',
        });
    });

    it('shows every name when teamVisibility is all', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);
        resolveTeamVisibilityScope.mockResolvedValue({ kind: 'all' });

        expect(await lastNames({})).toEqual(['Nodept', 'Sales', 'Seller', 'Seller', 'Stockman']);
    });

    it('search never matches a masked name but still matches the ERP id', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        expect((await service.findPage(ctx, { search: 'Stockman' })).totalItems).toBe(0);
        expect((await service.findPage(ctx, { search: 'Petr' })).totalItems).toBe(0);
        expect(await lastNames({ search: 'e-3' })).toEqual(['#e-3']);
        expect(await lastNames({ search: 'Seller' })).toEqual(['Seller', 'Seller']);
    });

    it('search treats % and _ literally', async () => {
        resolveCounterpartyScope.mockResolvedValue(allScope);

        expect((await service.findPage(ctx, { search: '%' })).totalItems).toBe(0);
    });

    it('branch scope never leaks other branches; all scope sees them', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);
        expect((await service.findPage(ctx, { take: 0 })).totalItems).toBe(5);

        resolveCounterpartyScope.mockResolvedValue(allScope);
        expect((await service.findPage(ctx, { take: 0 })).totalItems).toBe(6);
    });

    it('take: 0 returns real chip counts for each status without rows', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        const count = async (status?: 'active' | 'inactive' | 'unassigned'): Promise<number> =>
            (await service.findPage(ctx, { take: 0, filter: { status } })).totalItems;
        const page = await service.findPage(ctx, { take: 0 });

        expect(page.items).toEqual([]);
        expect([await count('active'), await count('inactive'), await count('unassigned')]).toEqual(
            [3, 1, 1],
        );
    });

    it('filters by department and paginates with a stable total', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        const first = await service.findPage(ctx, {
            take: 1,
            filter: { departmentId: 'dept-sales' },
        });
        const second = await service.findPage(ctx, {
            skip: 1,
            take: 1,
            filter: { departmentId: 'dept-sales' },
        });

        expect(first.totalItems).toBe(3);
        expect([first.items[0].erpId, second.items[0].erpId]).toEqual(['e-1', 'e-2']);
    });

    it('filters by role code while rows keep all their roles', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        const result = await service.findPage(ctx, { filter: { roleCode: 'manager' } });

        expect(result.items.map(i => i.erpId).sort()).toEqual(['e-2', 'e-4']);
        expect(result.totalItems).toBe(2);
        expect(result.items.every(i => i.roleCodes.includes('manager'))).toBe(true);
    });

    it('a caller without a branch sees nobody', async () => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department', administratorId: 1 });

        expect(await service.findPage(ctx, {})).toEqual({ items: [], totalItems: 0 });
    });

    it('operator cannot see inactive administrators', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);
        resolveTeamVisibilityScope.mockResolvedValue({ kind: 'all' });

        const all = await service.findPage(operatorCtx, {});
        expect(all.items.map(i => i.erpId)).not.toContain('e-5');
        expect(all.items.every(i => i.active)).toBe(true);
        const inactive = await service.findPage(operatorCtx, { filter: { status: 'inactive' } });
        expect(inactive).toEqual({ items: [], totalItems: 0 });
        const counts = await service.findPage(operatorCtx, { take: 0 });
        expect(counts.totalItems).toBe(3 + 1);
    });
});
