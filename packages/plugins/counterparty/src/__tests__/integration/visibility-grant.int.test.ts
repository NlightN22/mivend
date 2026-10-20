import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    DeleteDateColumn,
    Entity,
    IsNull,
    PrimaryGeneratedColumn,
} from 'typeorm';
import { Administrator } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    AccessScopeService,
    TeamAdministratorService,
    VisibilityGrant,
    VisibilityGrantReader,
} from '@mivend/plugin-access-control';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';
import { VisibilityGrantService } from '../../visibility/visibility-grant.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'bigint', default: 0 }) creditLimit!: number;
    @Column({ type: 'bigint', default: 0 }) creditBalance!: number;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) role!: string;
}

@Entity('administrator')
class TestAdministrator {
    @PrimaryGeneratedColumn() id!: number;
    @DeleteDateColumn({ type: 'timestamp', nullable: true }) deletedAt!: Date | null;
}

@Entity('visibility_grant')
class TestGrant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) granteeAdministratorId!: string;
    @Column({ type: 'varchar' }) subjectKind!: string;
    @Column({ type: 'varchar' }) subjectRef!: string;
    @Column({ type: 'timestamp', nullable: true }) validFrom!: Date | null;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'text' }) reason!: string;
    @Column({ type: 'varchar', nullable: true }) grantedByAdministratorId!: string | null;
    @Column({ type: 'timestamp', nullable: true }) revokedAt!: Date | null;
    @Column({ type: 'varchar', nullable: true }) revokedByAdministratorId!: string | null;
}

const { schema, extra } = testSchemaOptions('visibility_grant');
const DAY = 86_400_000;
let dataSource: DataSource;
let conn: TransactionalConnection;
let reader: VisibilityGrantReader;
let grants: VisibilityGrantService;
let counterparties: CounterpartyService;
let maxScope: 'own' | 'department' = 'department';
let adminIds: Record<'viewer' | 'head' | 'm7' | 'm8', number>;
const recordChange = vi.fn();

const ctx = {
    activeUserId: 'user-1',
    userHasPermissions: () => true,
} as unknown as RequestContext;

function mirrored(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    const mirrors = new Map<unknown, unknown>([
        [Counterparty, TestCounterparty],
        [Administrator, TestAdministrator],
        [VisibilityGrant, TestGrant],
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
        entities: [TestCounterparty, TestTeamMember, TestAdministrator, TestGrant],
        synchronize: true,
    });
    await dataSource.initialize();
    conn = mirrored();
    reader = new VisibilityGrantReader(conn);
    const viewerRow = () => ({
        id: adminIds.viewer,
        customFields: { branchId: 'branch-a' },
        user: { roles: [{ code: 'r' }] },
    });
    const accessScope = new AccessScopeService(
        { findOneByUserId: async () => viewerRow() } as never,
        { maxScopeFor: async () => maxScope } as never,
        reader,
    );
    counterparties = new CounterpartyService(
        conn,
        {} as never,
        {} as never,
        accessScope,
        {} as never,
    );
    grants = new VisibilityGrantService(
        conn,
        { findOneByUserId: async () => ({ id: adminIds.head }) } as never,
        { findTeam: async () => [] } as unknown as TeamAdministratorService,
        reader,
        { recordChange } as never,
        { isReplica: false } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of [TestGrant, TestTeamMember, TestCounterparty, TestAdministrator]) {
        await dataSource.getRepository(entity).createQueryBuilder().delete().execute();
    }
    recordChange.mockReset();
    maxScope = 'department';
    const repo = dataSource.getRepository(TestAdministrator);
    const [viewer, head, m7, m8] = await repo.save([{}, {}, {}, {}]);
    adminIds = { viewer: viewer.id, head: head.id, m7: m7.id, m8: m8.id };
    const cp = (erpId: string, assignedManagerId: string | null, branchId: string | null) => ({
        erpId,
        legalName: erpId,
        shortName: erpId,
        assignedManagerId,
        branchId,
    });
    await dataSource
        .getRepository(TestCounterparty)
        .save([
            cp('cp-branch-a', 'other', 'branch-a'),
            cp('cp-own', String(adminIds.viewer), 'branch-b'),
            cp('cp-m7-b', String(adminIds.m7), 'branch-b'),
            cp('cp-m7-unsorted', String(adminIds.m7), null),
            cp('cp-m8-b', String(adminIds.m8), 'branch-b'),
        ]);
});

async function insertGrant(over: Partial<TestGrant> = {}): Promise<TestGrant> {
    return dataSource.getRepository(TestGrant).save({
        granteeAdministratorId: String(adminIds.viewer),
        subjectKind: 'manager',
        subjectRef: String(adminIds.m7),
        reason: 'test',
        ...over,
    });
}

const erpIds = async (): Promise<string[]> =>
    (await counterparties.findVisible(ctx)).map(c => c.erpId).sort();

describe('VisibilityGrantReader validity window (real Postgres)', () => {
    const now = new Date('2030-06-15T12:00:00Z');
    const manager = (ref: string, over: Partial<TestGrant>) =>
        insertGrant({ subjectRef: ref, ...over });

    it('applies permanent grants and open windows, not future, expired or revoked ones', async () => {
        await manager('permanent', {});
        await manager('started', { validFrom: new Date(now.getTime() - DAY) });
        await manager('running', {
            validFrom: new Date(now.getTime() - DAY),
            validTo: new Date(now.getTime() + DAY),
        });
        await manager('future', { validFrom: new Date(now.getTime() + DAY) });
        await manager('expired', { validTo: new Date(now.getTime() - DAY) });
        await manager('ends-now', { validTo: now });
        await manager('revoked', { revokedAt: new Date(now.getTime() - DAY) });
        await manager('other-grantee', { granteeAdministratorId: '999' });
        const ids = await reader.activeManagerIds(ctx, String(adminIds.viewer), now);
        expect(ids.sort()).toEqual(['permanent', 'running', 'started']);
    });
});

describe('visible counterparties are the union of the layers (real Postgres)', () => {
    it('without a grant a branch-scoped caller sees the branch and own clients only', async () => {
        expect(await erpIds()).toEqual(['cp-branch-a', 'cp-own']);
    });

    it('an active grant adds exactly that manager, including an unsorted row', async () => {
        await insertGrant();
        const ids = await erpIds();
        expect(ids).toEqual(['cp-branch-a', 'cp-m7-b', 'cp-m7-unsorted', 'cp-own']);
        expect(ids).not.toContain('cp-m8-b');
    });

    it('pagination totals, KPIs and single reads do not leak hidden rows', async () => {
        await insertGrant();
        const page = await counterparties.findVisiblePage(ctx, { take: 1, skip: 0 });
        expect(page.totalItems).toBe(4);
        expect(page.items).toHaveLength(1);
        expect((await counterparties.getSummary(ctx)).totalCount).toBe(4);
        const hidden = await dataSource
            .getRepository(TestCounterparty)
            .findOneByOrFail({ erpId: 'cp-m8-b' });
        const shown = await dataSource
            .getRepository(TestCounterparty)
            .findOneByOrFail({ erpId: 'cp-m7-b' });
        expect(await counterparties.findOneVisible(ctx, hidden.id)).toBeNull();
        expect((await counterparties.findOneVisible(ctx, shown.id))?.erpId).toBe('cp-m7-b');
    });

    it('expired and revoked grants stop applying, nothing is deleted', async () => {
        await insertGrant({ validTo: new Date(Date.now() - DAY) });
        await insertGrant({ subjectRef: String(adminIds.m8), revokedAt: new Date() });
        expect(await erpIds()).toEqual(['cp-branch-a', 'cp-own']);
        expect(await dataSource.getRepository(TestGrant).count()).toBe(2);
    });

    it('an own-scoped caller keeps own clients and gains the granted manager', async () => {
        maxScope = 'own';
        await insertGrant();
        expect(await erpIds()).toEqual(['cp-m7-b', 'cp-m7-unsorted', 'cp-own']);
    });
});

describe('grant and revoke against concurrent writers and readers (real Postgres)', () => {
    const input = () => ({
        granteeAdministratorId: adminIds.viewer,
        managerAdministratorId: adminIds.m7,
        reason: 'race',
    });

    it('re-grants the same manager after an expiry and after a revoke', async () => {
        await insertGrant({ validTo: new Date(Date.now() - DAY) });
        await expect(grants.grant(ctx, input())).resolves.toBeDefined();
        const [open] = await dataSource
            .getRepository(TestGrant)
            .find({ where: { validTo: IsNull(), revokedAt: IsNull() } });
        await grants.revoke(ctx, open.id);
        await expect(grants.grant(ctx, input())).resolves.toBeDefined();
    });

    it('still rejects a genuinely overlapping grant', async () => {
        await insertGrant({ validTo: new Date(Date.now() + DAY) });
        await expect(grants.grant(ctx, input())).rejects.toThrow(/overlapping/);
    });

    it('two concurrent re-grants after an expiry leave exactly one new row', async () => {
        await insertGrant({ validTo: new Date(Date.now() - DAY) });
        const results = await Promise.allSettled([
            grants.grant(ctx, input()),
            grants.grant(ctx, input()),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await dataSource.getRepository(TestGrant).count()).toBe(2);
    });

    it('two identical grants at once leave exactly one row and one audit entry', async () => {
        const results = await Promise.allSettled([
            grants.grant(ctx, input()),
            grants.grant(ctx, input()),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        expect(await dataSource.getRepository(TestGrant).count()).toBe(1);
        expect(recordChange).toHaveBeenCalledTimes(1);
    });

    it('two revokes at once record exactly one audit entry', async () => {
        const grant = await insertGrant();
        await Promise.all([grants.revoke(ctx, grant.id, 'a'), grants.revoke(ctx, grant.id, 'b')]);
        expect(recordChange).toHaveBeenCalledTimes(1);
        expect(
            (await dataSource.getRepository(TestGrant).findOneByOrFail({ id: grant.id })).revokedAt,
        ).not.toBeNull();
    });

    it('a read racing a grant or revoke sees the manager entirely or not at all', async () => {
        const seen: string[][] = [];
        const readers = Array.from({ length: 10 }, async () => {
            seen.push(await erpIds());
        });
        const created = await grants.grant(ctx, input());
        await Promise.all([...readers, grants.revoke(ctx, created.id)]);
        const withManager = ['cp-branch-a', 'cp-m7-b', 'cp-m7-unsorted', 'cp-own'];
        for (const ids of seen) {
            expect([withManager, ['cp-branch-a', 'cp-own']]).toContainEqual(ids);
        }
        expect(await erpIds()).toEqual(['cp-branch-a', 'cp-own']);
    });
});
