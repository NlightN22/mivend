import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import { VisibilityGrant } from '@mivend/plugin-access-control';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { VisibilityGrantQueryService } from '../../visibility/visibility-grant-query.service';

@Entity('visibility_grant')
class TestGrant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) granteeAdministratorId!: string;
    @Column({ type: 'varchar' }) subjectRef!: string;
    @Column({ type: 'varchar', nullable: true }) grantedByAdministratorId!: string | null;
}

const { schema, extra } = testSchemaOptions('visibility_grant_history');
let dataSource: DataSource;
let service: VisibilityGrantQueryService;
const ids: Record<'mine' | 'team' | 'foreign', string> = { mine: '', team: '', foreign: '' };

const ctxWith = (accessControl: boolean): RequestContext =>
    ({
        activeUserId: 'user-1',
        userHasPermissions: () => accessControl,
    }) as unknown as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestGrant],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const conn = {
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (entity === VisibilityGrant ? TestGrant : entity) as never),
    } as unknown as TransactionalConnection;
    service = new VisibilityGrantQueryService(
        conn,
        { findOneByUserId: async () => ({ id: 10 }) } as never,
        { findTeam: async () => [{ id: 20 }] } as never,
        {} as never,
    );
    const repo = dataSource.getRepository(TestGrant);
    const save = async (grantee: string, by: string): Promise<string> =>
        String(
            (
                await repo.save(
                    repo.create({
                        granteeAdministratorId: grantee,
                        subjectRef: '99',
                        grantedByAdministratorId: by,
                    }),
                )
            ).id,
        );
    ids.mine = await save('30', '10');
    ids.team = await save('20', '40');
    ids.foreign = await save('50', '60');
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('VisibilityGrantQueryService.visibleIds (history scope)', () => {
    it('without ManageAccessControl: grants the caller made or whose grantee is in the team', async () => {
        const all = [ids.mine, ids.team, ids.foreign, 'not-a-number'];
        expect(await service.visibleIds(ctxWith(false), all)).toEqual(
            new Set([ids.mine, ids.team]),
        );
    });

    it('with ManageAccessControl: every requested grant that exists', async () => {
        const all = [ids.mine, ids.team, ids.foreign, '999999'];
        expect(await service.visibleIds(ctxWith(true), all)).toEqual(
            new Set([ids.mine, ids.team, ids.foreign]),
        );
    });

    it('no ids, no query result', async () => {
        expect((await service.visibleIds(ctxWith(true), [])).size).toBe(0);
    });
});
