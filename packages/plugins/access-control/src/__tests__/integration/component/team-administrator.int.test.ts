import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    OneToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { AdministratorService, RequestContext, TransactionalConnection } from '@vendure/core';
import { Administrator } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { AccessScopeService } from '../../../access-scope.service';
import { TeamAdministratorService } from '../../../team-administrator.service';
import type { AccessScope } from '../../../types';

// Mirror tables: Vendure's real Administrator needs bootstrap()'s EntityIdStrategy.
class TestAdminCustomFields {
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
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
    @Column({ type: 'varchar' }) lastName!: string;

    @DeleteDateColumn({ type: 'timestamp', nullable: true })
    deletedAt!: Date | null;

    @Column({ type: 'int', nullable: true }) userId!: number | null;

    @Column(() => TestAdminCustomFields)
    customFields!: TestAdminCustomFields;

    @OneToOne(() => TestUser)
    @JoinColumn({ name: 'userId' })
    user?: TestUser;
}

const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_team_administrator');
let dataSource: DataSource;
const resolveCounterpartyScope = vi.fn();
const administratorService = { findAll: vi.fn() };
let service: TeamAdministratorService;
const ids: Record<string, number> = {};

async function addAdmin(
    lastName: string,
    branchId: string | null,
    roleCode: string,
    deleted = false,
): Promise<void> {
    const role = await dataSource.getRepository(TestRole).save({ code: roleCode });
    const user = await dataSource.getRepository(TestUser).save({ roles: [role] });
    const admin = await dataSource.getRepository(TestAdministrator).save({
        lastName,
        userId: user.id,
        customFields: { branchId },
        deletedAt: deleted ? new Date() : null,
    });
    ids[lastName] = admin.id;
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
    service = new TeamAdministratorService(
        connection,
        administratorService as unknown as AdministratorService,
        { resolveCounterpartyScope } as unknown as AccessScopeService,
    );
    await addAdmin('HeadA', 'branch-a', 'department-head');
    await addAdmin('ManagerA', 'branch-a', 'manager');
    await addAdmin('OperatorA', 'branch-a', 'operator');
    await addAdmin('GoneA', 'branch-a', 'manager', true);
    await addAdmin('ManagerB', 'branch-b', 'manager');
    await addAdmin('Unbranched', null, 'manager');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(() => {
    vi.clearAllMocks();
});

const branchA: AccessScope = { kind: 'department', administratorId: 1, branchId: 'branch-a' };

describe('TeamAdministratorService.findTeam', () => {
    it('branch scope lists every live colleague of the own branch with roles, whatever their role', async () => {
        resolveCounterpartyScope.mockResolvedValue(branchA);

        const team = await service.findTeam(ctx);

        expect(team.map(a => a.lastName).sort()).toEqual(['HeadA', 'ManagerA', 'OperatorA']);
        const manager = team.find(a => a.lastName === 'ManagerA');
        expect(manager?.user?.roles?.map(r => r.code)).toEqual(['manager']);
        expect(administratorService.findAll).not.toHaveBeenCalled();
    });

    it('branch scope without a branch lists nobody', async () => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'department', administratorId: 1 });

        expect(await service.findTeam(ctx)).toEqual([]);
    });

    it("own scope lists the whole team of the caller's branch", async () => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'own', administratorId: ids.ManagerA });

        const team = await service.findTeam(ctx);

        expect(team.map(a => a.lastName).sort()).toEqual(['HeadA', 'ManagerA', 'OperatorA']);
        expect(administratorService.findAll).not.toHaveBeenCalled();
    });

    it.each(['Unbranched', 'GoneA'])('own scope of %s lists nobody', async lastName => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'own', administratorId: ids[lastName] });

        expect(await service.findTeam(ctx)).toEqual([]);
    });

    it('own scope without an administrator lists nobody', async () => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'own' });

        expect(await service.findTeam(ctx)).toEqual([]);
    });

    it('"all" scope keeps the Vendure administrator list unchanged', async () => {
        resolveCounterpartyScope.mockResolvedValue({ kind: 'all' });
        administratorService.findAll.mockResolvedValue({ items: [{ id: 42 }] });

        expect(await service.findTeam(ctx)).toEqual([{ id: 42 }]);
    });
});

describe('TeamAdministratorService.findInBranch', () => {
    it('finds a same-branch administrator the caller could not grant roles to', async () => {
        const found = await service.findInBranch(ctx, 'branch-a', ids.ManagerA);

        expect(found?.lastName).toBe('ManagerA');
    });

    it.each(['ManagerB', 'Unbranched', 'GoneA'])('does not find %s', async lastName => {
        expect(await service.findInBranch(ctx, 'branch-a', ids[lastName])).toBeUndefined();
    });
});
