import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PERMISSIONS_ADDED_BY_RELEASE } from '../../default-role-release-grants';
import {
    grantMissingDefaultPermissions,
    type ReleaseGrantLists,
    type SqlClient,
} from '../../grant-missing-permissions';

@Entity('role')
class TestRole {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'text' }) permissions!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('role_access_scope')
class TestScope {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) roleCode!: string;
    @Column({ type: 'text' }) accessScopeConfig!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
}

@Entity('role_default_grant')
@Index(['roleCode', 'grantKey'], { unique: true })
class TestGrant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) roleCode!: string;
    @Column({ type: 'varchar' }) grantKey!: string;
}

const RIGHT = 'ReadDeletedContractPowerOfAttorney';
const ROLE = 'department-head';
const { schema, extra } = testSchemaOptions('access_control_grant_defaults');
let dataSource: DataSource;

// Pinned to the 1.1.8 right so later release entries do not change what these tests expect.
const POA_GRANTS: ReleaseGrantLists = {
    permissions: PERMISSIONS_ADDED_BY_RELEASE.filter(g => g.permission === RIGHT),
    scopeKeys: [],
};

async function run(lists: ReleaseGrantLists = POA_GRANTS): Promise<unknown> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const client: SqlClient = {
        query: async (sql, params) => ({ rows: await runner.query(sql, params) }),
    };
    try {
        return await grantMissingDefaultPermissions(client, lists);
    } finally {
        await runner.release();
    }
}

async function permissionsOf(code: string): Promise<string[]> {
    const role = await dataSource.getRepository(TestRole).findOneByOrFail({ code });
    return role.permissions.split(',');
}

describe('grantMissingDefaultPermissions against a real database', () => {
    beforeAll(async () => {
        await createTestSchema(schema);
        dataSource = new DataSource({
            type: 'postgres',
            ...testDataSourceConnectionOptions(),
            schema,
            extra,
            entities: [TestRole, TestScope, TestGrant],
            synchronize: true,
        });
        await dataSource.initialize();
    });

    beforeEach(async () => {
        await dataSource.query(
            'TRUNCATE role, role_access_scope, role_default_grant RESTART IDENTITY',
        );
    });

    afterAll(async () => {
        await dataSource?.destroy();
        await dropTestSchema(schema);
    });

    it('is a no-op on a fresh database without roles', async () => {
        expect(await run()).toEqual([]);
        expect(await dataSource.getRepository(TestGrant).count()).toBe(0);
    });

    it('adds the right once, keeps an admin-added right, skips an absent role', async () => {
        await dataSource
            .getRepository(TestRole)
            .save({ code: ROLE, permissions: 'Authenticated,AdminAdded' });
        await run();

        expect(await permissionsOf(ROLE)).toEqual(['Authenticated', 'AdminAdded', RIGHT]);
        expect(await dataSource.getRepository(TestRole).count()).toBe(1);
        const recorded = await dataSource.getRepository(TestGrant).find();
        expect(recorded.map(r => [r.roleCode, r.grantKey])).toEqual([[ROLE, RIGHT]]);
    });

    it('records without change a role that already holds the right', async () => {
        await dataSource
            .getRepository(TestRole)
            .save({ code: ROLE, permissions: `Authenticated,${RIGHT}` });
        await run();
        expect(await permissionsOf(ROLE)).toEqual(['Authenticated', RIGHT]);
        expect(await dataSource.getRepository(TestGrant).count()).toBe(1);
    });

    it('does not re-add a recorded right an admin removed by hand', async () => {
        await dataSource.getRepository(TestRole).save({ code: ROLE, permissions: 'Authenticated' });
        await run();
        await dataSource
            .getRepository(TestRole)
            .update({ code: ROLE }, { permissions: 'Authenticated' });

        await run();

        expect(await permissionsOf(ROLE)).toEqual(['Authenticated']);
    });

    it('two parallel runs give one result and no duplicates', async () => {
        for (const grant of POA_GRANTS.permissions) {
            await dataSource
                .getRepository(TestRole)
                .save({ code: grant.roleCode, permissions: 'Authenticated' });
        }
        await Promise.all([run(), run()]);

        for (const grant of POA_GRANTS.permissions) {
            expect(await permissionsOf(grant.roleCode)).toEqual(['Authenticated', RIGHT]);
        }
        expect(await dataSource.getRepository(TestGrant).count()).toBe(
            POA_GRANTS.permissions.length,
        );
    });

    it('adds a missing scope key once without changing existing keys', async () => {
        const lists: ReleaseGrantLists = {
            permissions: [],
            scopeKeys: [{ release: 'r', roleCode: 'manager', resource: 'proformaInvoice' }],
        };
        await dataSource
            .getRepository(TestRole)
            .save({ code: 'manager', permissions: 'Authenticated' });
        await dataSource
            .getRepository(TestScope)
            .save({ roleCode: 'manager', accessScopeConfig: JSON.stringify({ order: 'all' }) });

        await run(lists);
        const row = await dataSource
            .getRepository(TestScope)
            .findOneByOrFail({ roleCode: 'manager' });
        expect(JSON.parse(row.accessScopeConfig)).toEqual({ order: 'all', proformaInvoice: 'own' });

        await dataSource
            .getRepository(TestScope)
            .update(
                { roleCode: 'manager' },
                { accessScopeConfig: JSON.stringify({ order: 'all' }) },
            );
        await run(lists);
        const again = await dataSource
            .getRepository(TestScope)
            .findOneByOrFail({ roleCode: 'manager' });
        expect(JSON.parse(again.accessScopeConfig)).toEqual({ order: 'all' });
    });
});
