import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyErpDriftService } from '../../counterparty-erp-drift.service';
import { CounterpartyErpMirrorService } from '../../counterparty-erp-mirror.service';
import { CounterpartyStreamStateService } from '../../counterparty-stream-state.service';
import { CounterpartyTeamService } from '../../counterparty-team.service';
import { CounterpartyVersionService } from '../../counterparty-version.service';
import { CounterpartyVersionedEvent } from '../../counterparty-versioned.event';
import { Counterparty } from '../../entities/counterparty.entity';
import { CounterpartyTeamMember } from '../../entities/counterparty-team-member.entity';
import type { ActiveStateFields } from '../../counterparty-active-state';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) kpp!: string | null;
    @Column({ type: 'varchar', nullable: true }) ogrnip!: string | null;
    @Column({ type: 'varchar', nullable: true }) okpo!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalType!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalFormId!: string | null;
    @Column({ type: 'varchar', nullable: true }) regionId!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) factualAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
    @Column({ type: 'varchar', nullable: true }) mainContractId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'int', default: 0 }) version!: number;
}

@Entity('counterparty_erp')
class TestMirror {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar', nullable: true }) fullName!: string | null;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) kpp!: string | null;
    @Column({ type: 'varchar', nullable: true }) ogrnip!: string | null;
    @Column({ type: 'varchar', nullable: true }) okpo!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalType!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalFormId!: string | null;
    @Column({ type: 'varchar', nullable: true }) regionId!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) factualAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerId!: string | null;
    @Column({ type: 'text', nullable: true }) managerIds!: string | null;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
    @Column({ type: 'varchar' }) role!: string;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) administratorId!: string | null;
}

const { schema, extra } = testSchemaOptions('counterparty_ownership');
const ctx = testRequestContext;
const published: CounterpartyVersionedEvent[] = [];
let dataSource: DataSource;
let streamState: CounterpartyStreamStateService;
let mirror: CounterpartyErpMirrorService;
let versions: CounterpartyVersionService;
let team: CounterpartyTeamService;
let drift: CounterpartyErpDriftService;

const rows = (): Promise<TestCounterparty[]> =>
    dataSource.getRepository(TestCounterparty).find({ order: { id: 'ASC' } });
const byErpId = (erpId: string): Promise<TestCounterparty> =>
    dataSource.getRepository(TestCounterparty).findOneByOrFail({ erpId });

// What the stream handler does for one event: mirror first, then the ownership-aware write.
async function arrive(erpId: string, fields: ActiveStateFields): Promise<void> {
    await mirror.write(ctx, erpId, { ...fields, managerId: fields.managerErpId });
    await streamState.upsertActiveState(ctx, erpId, fields, async (txCtx, created) => {
        await team.seedFromErp(txCtx, created.id, ['admin-team']);
    });
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestMirror, TestTeamMember, TestErpUser],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const mapped = new Map<unknown, unknown>([
        [Counterparty, TestCounterparty],
        [CounterpartyTeamMember, TestTeamMember],
    ]);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mapped.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
    const eventBus = {
        publish: (e: unknown) => e instanceof CounterpartyVersionedEvent && published.push(e),
    };
    streamState = new CounterpartyStreamStateService(connection, eventBus as never);
    versions = new CounterpartyVersionService(connection, eventBus as never);
    team = new CounterpartyTeamService(connection, {} as never, versions);
    drift = new CounterpartyErpDriftService(connection);
    mirror = {
        write: vi.fn(async (c: never, erpId: string, f: Record<string, unknown>) => {
            const repo = base.getRepository(c, TestMirror as never);
            const row = (await repo.findOne({ where: { erpId } })) ?? repo.create({ erpId });
            for (const [k, v] of Object.entries(f)) {
                if (v !== undefined) (row as unknown as Record<string, unknown>)[k] = v;
            }
            await repo.save(row);
        }),
    } as unknown as CounterpartyErpMirrorService;
});

afterEach(async () => {
    published.length = 0;
    await dataSource.query(
        `TRUNCATE "${schema}".counterparty, "${schema}".counterparty_erp,
         "${schema}".counterparty_team_member, "${schema}".erp_user RESTART IDENTITY CASCADE`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const first: ActiveStateFields = {
    name: 'Acme',
    isActive: true,
    inn: '7700000001',
    phone: '+70000000001',
    legalAddress: 'Street 1',
    departmentId: 'dept-1',
    assignedManagerId: 'admin-1',
    managerErpId: 'user-1',
};

describe('counterparty ownership split (integration, real Postgres)', () => {
    it('the first arrival seeds the record and the team without moving the version', async () => {
        await arrive('cp-1', first);

        const row = await byErpId('cp-1');
        expect(row).toMatchObject({
            shortName: 'Acme',
            inn: '7700000001',
            phone: '+70000000001',
            assignedManagerId: 'admin-1',
            version: 0,
        });
        expect(await dataSource.getRepository(TestTeamMember).count()).toBe(1);
        expect(published).toHaveLength(0);
    });

    it('a later event cannot change a portal-owned field but still updates the ERP-owned ones', async () => {
        await arrive('cp-1', first);
        await arrive('cp-1', {
            ...first,
            name: 'Acme renamed by ERP',
            inn: '7700000002',
            phone: '+70000000002',
            legalAddress: 'Street 2',
            isActive: false,
            departmentId: 'dept-2',
            managerErpId: 'user-9',
        });

        expect(await byErpId('cp-1')).toMatchObject({
            shortName: 'Acme',
            legalName: 'Acme',
            inn: '7700000001',
            phone: '+70000000001',
            legalAddress: 'Street 1',
            isActive: false,
            departmentId: 'dept-2',
            managerErpId: 'user-9',
        });
        expect(
            await dataSource.getRepository(TestMirror).findOneByOrFail({ erpId: 'cp-1' }),
        ).toMatchObject({ name: 'Acme renamed by ERP', inn: '7700000002' });
    });

    it('a portal reassignment survives the next counterparty event, and an event fills only an empty owner', async () => {
        await arrive('cp-1', first);
        const id = (await byErpId('cp-1')).id;
        await dataSource
            .getRepository(TestCounterparty)
            .update(id, { assignedManagerId: 'admin-9' });
        await versions.bump(ctx, id);

        await arrive('cp-1', first);
        expect((await byErpId('cp-1')).assignedManagerId).toBe('admin-9');

        await dataSource.getRepository(TestCounterparty).update(id, { assignedManagerId: null });
        await arrive('cp-1', first);
        expect((await byErpId('cp-1')).assignedManagerId).toBe('admin-1');
    });

    it('concurrent edits get distinct increasing versions, each published once', async () => {
        await arrive('cp-1', first);
        await arrive('cp-2', { ...first, name: 'Other' });
        const id = (await byErpId('cp-1')).id;

        const results = await Promise.all([1, 2, 3, 4, 5].map(() => versions.bump(ctx, id)));

        expect([...results].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        expect(published.map(e => e.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
        expect(new Set(published.map(e => e.erpId))).toEqual(new Set(['cp-1']));
        expect((await byErpId('cp-2')).version).toBe(0);
    });

    it('bumpMany moves only the listed records', async () => {
        await arrive('cp-1', first);
        await arrive('cp-2', { ...first, name: 'Other' });
        await arrive('cp-3', { ...first, name: 'Third' });
        const all = await rows();

        await versions.bumpMany(ctx, [all[0].id, all[1].id]);

        expect((await rows()).map(r => r.version)).toEqual([1, 1, 0]);
    });

    it('drift lists only edited records and managers without an ERP link', async () => {
        await arrive('cp-1', first);
        await arrive('cp-2', {
            ...first,
            name: 'Other',
            assignedManagerId: 'admin-2',
            managerErpId: 'user-2',
        });
        await dataSource.getRepository(TestErpUser).save([
            { erpId: 'user-1', administratorId: 'admin-1' },
            { erpId: 'user-2', administratorId: 'admin-2' },
            { erpId: 'user-team', administratorId: 'admin-team' },
        ]);
        expect((await drift.listDifferingFromErp(ctx)).totalItems).toBe(0);

        const edited = await byErpId('cp-1');
        await dataSource.getRepository(TestCounterparty).update(edited.id, {
            shortName: 'Edited here',
            assignedManagerId: 'admin-unlinked',
        });
        await versions.bump(ctx, edited.id);

        expect((await drift.listDifferingFromErp(ctx)).items.map(c => c.erpId)).toEqual(['cp-1']);
        expect((await drift.listNotConfirmedByErp(ctx)).items.map(c => c.erpId)).toEqual(['cp-1']);
        expect((await drift.listWithUnlinkedManagers(ctx)).items.map(c => c.erpId)).toEqual([
            'cp-1',
        ]);
    });
});
