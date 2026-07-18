import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import { AccessScopeService } from '@mivend/plugin-access-control';

// Real Postgres, no mocking — verifies AccessScopeService.applyOwnCounterpartyFilter's EXISTS
// subquery against a real counterparty_team_member table, mirroring
// counterparty.access-scope.test.ts's approach of a hand-rolled table matching production schema
// (VendureEntity's id column needs a bootstrap-time EntityIdStrategy that isn't available here).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
}

@Entity('counterparty_team_member')
@Index(['counterpartyId', 'administratorId'], { unique: true })
class TestCounterpartyTeamMember {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) role!: string;
}

let dataSource: DataSource;
let accessScopeService: AccessScopeService;

beforeAll(async () => {
    dataSource = new DataSource({
        type: 'postgres',
        host: process.env['TEST_DB_HOST'] ?? 'localhost',
        port: Number(process.env['TEST_DB_PORT'] ?? 5432),
        username: process.env['TEST_DB_USER'] ?? 'postgres',
        password: process.env['TEST_DB_PASSWORD'] ?? 'postgres',
        database: process.env['TEST_DB_NAME'] ?? 'mivend_test',
        entities: [TestCounterparty, TestCounterpartyTeamMember],
        synchronize: true,
        dropSchema: true,
    });
    await dataSource.initialize();

    // applyOwnCounterpartyFilter doesn't need AdministratorService/RoleScopeConfigService —
    // it's a pure query-builder helper, so those constructor deps are unused stubs here.
    accessScopeService = new AccessScopeService({} as never, {} as never);
});

afterAll(async () => {
    await dataSource.destroy();
});

beforeEach(async () => {
    await dataSource.getRepository(TestCounterpartyTeamMember).clear();
    await dataSource.getRepository(TestCounterparty).clear();
});

async function findVisibleErpIdsForOwnScope(administratorId: string): Promise<string[]> {
    const qb = dataSource.getRepository(TestCounterparty).createQueryBuilder('c');
    accessScopeService.applyOwnCounterpartyFilter(qb, 'c', administratorId);
    const rows = await qb.getMany();
    return rows.map(r => r.erpId).sort();
}

describe('AccessScopeService.applyOwnCounterpartyFilter (integration, real Postgres)', () => {
    it('grants "own" visibility to the Owner (assignedManagerId) with no team membership', async () => {
        await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-owned', assignedManagerId: 'admin-owner' });

        const visible = await findVisibleErpIdsForOwnScope('admin-owner');

        expect(visible).toEqual(['cp-owned']);
    });

    it('grants "own" visibility to a team member added on top of a different Owner', async () => {
        const cp = await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-teamed', assignedManagerId: 'admin-owner' });
        await dataSource.getRepository(TestCounterpartyTeamMember).save({
            counterpartyId: cp.id,
            administratorId: 'admin-backup',
            role: 'backup',
        });

        const visibleToBackup = await findVisibleErpIdsForOwnScope('admin-backup');
        const visibleToOwner = await findVisibleErpIdsForOwnScope('admin-owner');

        expect(visibleToBackup).toEqual(['cp-teamed']);
        expect(visibleToOwner).toEqual(['cp-teamed']);
    });

    it('revokes visibility once the team member row is removed', async () => {
        const cp = await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-revoke', assignedManagerId: 'admin-owner' });
        await dataSource.getRepository(TestCounterpartyTeamMember).save({
            counterpartyId: cp.id,
            administratorId: 'admin-observer',
            role: 'observer',
        });
        expect(await findVisibleErpIdsForOwnScope('admin-observer')).toEqual(['cp-revoke']);

        await dataSource.getRepository(TestCounterpartyTeamMember).delete({
            counterpartyId: cp.id,
            administratorId: 'admin-observer',
        });

        expect(await findVisibleErpIdsForOwnScope('admin-observer')).toEqual([]);
    });

    it('does not grant visibility to an administrator with no Owner/team relationship', async () => {
        const cp = await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-unrelated', assignedManagerId: 'admin-owner' });
        await dataSource.getRepository(TestCounterpartyTeamMember).save({
            counterpartyId: cp.id,
            administratorId: 'admin-backup',
            role: 'backup',
        });

        expect(await findVisibleErpIdsForOwnScope('admin-stranger')).toEqual([]);
    });

    it('rejects a duplicate team-member row via the unique composite index', async () => {
        const cp = await dataSource
            .getRepository(TestCounterparty)
            .save({ erpId: 'cp-dup', assignedManagerId: 'admin-owner' });
        await dataSource.getRepository(TestCounterpartyTeamMember).save({
            counterpartyId: cp.id,
            administratorId: 'admin-backup',
            role: 'backup',
        });

        await expect(
            dataSource.getRepository(TestCounterpartyTeamMember).save({
                counterpartyId: cp.id,
                administratorId: 'admin-backup',
                role: 'observer',
            }),
        ).rejects.toThrow();
    });
});
