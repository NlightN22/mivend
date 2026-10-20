import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    JoinColumn,
    JoinTable,
    ManyToMany,
    ManyToOne,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Administrator } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { RoleAccessScope } from '../../../entities/role-access-scope.entity';
import { RoleScopeConfigService } from '../../../role-scope-config.service';
import { UnsortedAdministratorService } from '../../../unsorted-administrator.service';

@Entity('role')
class TestRole {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('user')
class TestUser {
    @PrimaryGeneratedColumn() id!: number;
    @ManyToMany(() => TestRole)
    @JoinTable({
        name: 'user_roles_role',
        joinColumn: { name: 'userId' },
        inverseJoinColumn: { name: 'roleId' },
    })
    roles!: TestRole[];
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', default: '' }) firstName!: string;
    @Column({ type: 'varchar', default: '' }) lastName!: string;
    @Column({ type: 'varchar', default: '' }) emailAddress!: string;
    @DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
    @Column({ name: 'customFieldsBranchid', type: 'varchar', nullable: true })
    branchId!: string | null;
    @ManyToOne(() => TestUser)
    @JoinColumn({ name: 'userId' })
    user!: TestUser;
}

@Entity('role_access_scope')
class TestRoleAccessScope {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) roleCode!: string;
    @Column({ type: 'text' }) accessScopeConfig!: string;
}

const { schema, extra } = testSchemaOptions('unsorted_administrators');
let dataSource: DataSource;
let service: UnsortedAdministratorService;
const ctx = {} as RequestContext;

function connection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    const mirrors = new Map<unknown, unknown>([
        [Administrator, TestAdministrator],
        [RoleAccessScope, TestRoleAccessScope],
    ]);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mirrors.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRole, TestUser, TestAdministrator, TestRoleAccessScope],
        synchronize: true,
    });
    await dataSource.initialize();
    const conn = connection();
    service = new UnsortedAdministratorService(conn, new RoleScopeConfigService(conn));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE administrator, "user", role, role_access_scope, user_roles_role RESTART IDENTITY CASCADE',
    );
    const roles = dataSource.getRepository(TestRole);
    const branchRole = await roles.save({ code: 'branch-role' });
    const allRole = await roles.save({ code: 'all-role' });
    const superRole = await roles.save({ code: '__super_admin_role__' });
    const scopes = dataSource.getRepository(TestRoleAccessScope);
    await scopes.save([
        { roleCode: 'branch-role', accessScopeConfig: '{"counterparty":"department"}' },
        { roleCode: 'all-role', accessScopeConfig: '{"counterparty":"all"}' },
    ]);
    const add = async (
        email: string,
        branchId: string | null,
        role: TestRole,
        extraRole?: TestRole,
    ): Promise<void> => {
        const user = await dataSource
            .getRepository(TestUser)
            .save({ roles: extraRole ? [role, extraRole] : [role] });
        await dataSource
            .getRepository(TestAdministrator)
            .save({ emailAddress: email, branchId, user });
    };
    await add('unsorted@example.test', null, branchRole);
    await add('sorted@example.test', 'branch-a', branchRole);
    await add('director@example.test', null, allRole);
    await add('root@example.test', null, superRole);
    await add('mixed@example.test', null, branchRole, allRole);
    const deleted = await dataSource.getRepository(TestAdministrator).save({
        emailAddress: 'gone@example.test',
        branchId: null,
        user: await dataSource.getRepository(TestUser).save({ roles: [branchRole] }),
    });
    await dataSource.getRepository(TestAdministrator).softDelete(deleted.id);
});

describe('UnsortedAdministratorService (real Postgres)', () => {
    it('lists live branchless administrators whose roles do not see everything', async () => {
        const page = await service.findPage(ctx);
        expect(page.items.map(a => a.emailAddress)).toEqual(['unsorted@example.test']);
        expect(page.totalItems).toBe(1);
    });

    it('paginates without leaking the excluded rows into the total', async () => {
        const page = await service.findPage(ctx, { take: 1, skip: 1 });
        expect(page.items).toEqual([]);
        expect(page.totalItems).toBe(1);
    });
});
