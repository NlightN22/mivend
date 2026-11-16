import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    Index,
    JoinTable,
    ManyToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { ChannelService, ProcessContext, RequestContext } from '@vendure/core';
import { Role, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { DEFAULT_ROLES } from '../../default-roles';
import { RoleProvisioningService } from '../../role-provisioning.service';
import { RoleScopeConfigService } from '../../role-scope-config.service';

@Entity('channel')
class TestChannel {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
}

@Entity('role')
class TestRole {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) code!: string;
    @Column({ type: 'varchar' }) description!: string;
    @Column({ type: 'simple-array' }) permissions!: string[];
    @ManyToMany(() => TestChannel)
    @JoinTable({ name: 'role_channels_channel' })
    channels!: TestChannel[];
}

@Entity('role_access_scope')
class TestScope {
    @PrimaryGeneratedColumn() id!: number;
    @Index({ unique: true })
    @Column({ type: 'varchar' })
    roleCode!: string;
    @Column({ type: 'text' }) accessScopeConfig!: string;
}

const ctx = {} as RequestContext;
const { schema, extra } = testSchemaOptions('access_control_role_bootstrap');
let dataSource: DataSource;
let service: RoleProvisioningService;
let scopes: RoleScopeConfigService;

async function snapshot(): Promise<string> {
    const roles = await dataSource.getRepository(TestRole).find({ order: { code: 'ASC' } });
    const rows = await dataSource.getRepository(TestScope).find({ order: { roleCode: 'ASC' } });
    return JSON.stringify({
        roles: roles.map(r => [r.id, r.code, r.description, r.permissions]),
        rows: rows.map(r => [r.id, r.roleCode, r.accessScopeConfig]),
    });
}

describe('role bootstrap against a real database', () => {
    beforeAll(async () => {
        await createTestSchema(schema);
        dataSource = new DataSource({
            type: 'postgres',
            ...testDataSourceConnectionOptions(),
            schema,
            extra,
            entities: [TestChannel, TestRole, TestScope],
            synchronize: true,
        });
        await dataSource.initialize();
        const connection = {
            getRepository: (_ctx: unknown, entity: unknown) =>
                dataSource.getRepository(entity === Role ? TestRole : TestScope),
        } as unknown as TransactionalConnection;
        scopes = new RoleScopeConfigService(connection);
        const channelService = {
            getDefaultChannel: async () =>
                dataSource.getRepository(TestChannel).findOneByOrFail({}),
        } as unknown as ChannelService;
        service = new RoleProvisioningService(connection, channelService, scopes, {
            isWorker: false,
        } as ProcessContext);
    });

    beforeEach(async () => {
        await dataSource.query(
            'TRUNCATE role, role_access_scope, channel RESTART IDENTITY CASCADE',
        );
        await dataSource.getRepository(TestChannel).save({ code: '__default_channel__' });
    });

    afterAll(async () => {
        await dataSource?.destroy();
        await dropTestSchema(schema);
    });

    it('creates every default role and scope row on a fresh database, the second run changes nothing', async () => {
        await service.onApplicationBootstrap();
        const first = await snapshot();
        expect(await dataSource.getRepository(TestRole).count()).toBe(DEFAULT_ROLES.length);
        expect(await dataSource.getRepository(TestScope).count()).toBe(DEFAULT_ROLES.length);

        await service.onApplicationBootstrap();
        expect(await snapshot()).toBe(first);
    });

    it('keeps edited permissions, description and scope config across a re-provision', async () => {
        await service.onApplicationBootstrap();
        const code = DEFAULT_ROLES[0].code;
        await dataSource
            .getRepository(TestRole)
            .update(
                { code },
                { description: 'edited', permissions: ['Authenticated', 'ReadOrder'] },
            );
        await scopes.setScopeFor(ctx, code, { order: 'all' });
        const edited = await snapshot();

        await service.onApplicationBootstrap();

        expect(await snapshot()).toBe(edited);
        const role = await dataSource.getRepository(TestRole).findOneByOrFail({ code });
        expect(role.description).toBe('edited');
        expect(await scopes.getScopeFor(ctx, code)).toEqual({ order: 'all' });
    });

    it('recreates a deleted role and a deleted scope row with the defaults', async () => {
        await service.onApplicationBootstrap();
        const definition = DEFAULT_ROLES[1];
        await dataSource.query('DELETE FROM role_channels_channel');
        await dataSource.getRepository(TestRole).delete({ code: definition.code });
        await dataSource.getRepository(TestScope).delete({ roleCode: definition.code });

        await service.onApplicationBootstrap();

        const role = await dataSource
            .getRepository(TestRole)
            .findOneByOrFail({ code: definition.code });
        expect(role.description).toBe(definition.description);
        expect(role.permissions).toEqual(['Authenticated', ...definition.permissions]);
        expect(await scopes.getScopeFor(ctx, definition.code)).toEqual(
            definition.accessScopeConfig,
        );
    });

    it('reports a deleted scope row as missing and an edited one as present', async () => {
        await service.onApplicationBootstrap();
        await scopes.setScopeFor(ctx, DEFAULT_ROLES[0].code, { order: 'all' });
        await dataSource.getRepository(TestScope).delete({ roleCode: DEFAULT_ROLES[1].code });

        const status = await scopes.getProvisioningStatus(ctx);
        expect(status.filter(s => s.missing).map(s => s.roleCode)).toEqual([DEFAULT_ROLES[1].code]);
    });
});
