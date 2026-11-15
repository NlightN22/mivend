import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import { Counterparty, CounterpartySnapshotService } from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyCommandBuilder } from '../../../counterparty-command.builder';
import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OutboundGateway } from '../../../outbound-gateway';
import { TradingPointCommandBuilder } from '../../../trading-point-command.builder';
import { VersionedEntityBuilders } from '../../../versioned-entity-builders';
import { VersionedEntityListener } from '../../../versioned-entity.listener';
import { VersionedEntityReconciler } from '../../../versioned-entity.reconciler';
import { testRequestContextService } from '../../test-request-context-service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'int', default: 0 }) version!: number;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'int', default: 0 }) version!: number;
}

@Entity('erp_user')
class TestErpUser {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) administratorId!: string | null;
}

@Entity('counterparty_team_member')
class TestTeamMember {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) administratorId!: string;
}

@Entity('contact_point')
class TestContactPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', nullable: true }) label!: string | null;
    @Column({ type: 'varchar' }) value!: string;
}

@Entity('counterparty_contact_point')
class TestContactLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

const { schema, extra } = testSchemaOptions('erp_integration_counterparty_outbound');
const mirrors = new Map<unknown, unknown>([[Counterparty, TestCounterparty]]);
let dataSource: DataSource;
let listener: VersionedEntityListener;
let reconciler: VersionedEntityReconciler;
let processor: IntegrationOutboxProcessorService;
const publish = vi.fn();

const outbox = (): Promise<IntegrationOutboxEntry[]> =>
    dataSource.getRepository(IntegrationOutboxEntry).find({ order: { id: 'ASC' } });
const enqueue = (version: number): Promise<void> =>
    listener.enqueueVersion(testRequestContext, 'counterparty.changed', 'cp-erp-1', version);
const setVersion = (version: number, shortName = `Acme v${version}`): Promise<unknown> =>
    dataSource
        .getRepository(TestCounterparty)
        .update({ erpId: 'cp-erp-1' }, { version, shortName });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [
            IntegrationOutboxEntry,
            TestCounterparty,
            TestTradingPoint,
            TestErpUser,
            TestTeamMember,
            TestContactPoint,
            TestContactLink,
        ],
        synchronize: true,
    });
    await dataSource.initialize();
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mirrors.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
    const gateway = new OutboundGateway(connection, new IntegrationOutboxService(connection));
    listener = new VersionedEntityListener(
        {} as never,
        gateway,
        new VersionedEntityBuilders(
            new TradingPointCommandBuilder(connection, gateway),
            new CounterpartyCommandBuilder(new CounterpartySnapshotService(connection), gateway),
        ),
        { instanceType: 'central' } as never,
    );
    reconciler = new VersionedEntityReconciler(connection, listener, testRequestContextService);
    processor = new IntegrationOutboxProcessorService(
        connection,
        { publish } as never,
        testRequestContextService,
    );
});

afterEach(async () => {
    publish.mockReset();
    await dataSource.query(
        `TRUNCATE "${schema}".integration_outbox, "${schema}".counterparty, "${schema}".erp_user,
         "${schema}".counterparty_team_member, "${schema}".contact_point,
         "${schema}".counterparty_contact_point RESTART IDENTITY CASCADE`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function seed(version: number): Promise<void> {
    const cp = await dataSource.getRepository(TestCounterparty).save({
        erpId: 'cp-erp-1',
        shortName: `Acme v${version}`,
        inn: '7700000001',
        assignedManagerId: 'admin-1',
        version,
    });
    await dataSource.getRepository(TestErpUser).save([
        { erpId: 'user-1', administratorId: 'admin-1' },
        { erpId: 'user-2', administratorId: 'admin-2' },
    ]);
    await dataSource.getRepository(TestTeamMember).save([
        { counterpartyId: String(cp.id), administratorId: 'admin-2' },
        { counterpartyId: String(cp.id), administratorId: 'admin-no-link' },
    ]);
    const point = await dataSource
        .getRepository(TestContactPoint)
        .save({ type: 'phone', label: 'Main', value: '+70000000001' });
    await dataSource
        .getRepository(TestContactLink)
        .save({ counterpartyId: cp.id, contactPointId: point.id, isPrimary: true });
}

describe('counterparty outbound (integration, real Postgres)', () => {
    it('one change gives exactly one pending row carrying the full record with the managers', async () => {
        await seed(1);
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ eventType: 'counterparty.changed', status: 'pending' });
        expect(rows[0].payload).toMatchObject({
            erpId: 'cp-erp-1',
            version: '1',
            counterpartySnapshot: {
                name: 'Acme v1',
                inn: '7700000001',
                managerId: 'user-1',
                managerIds: ['user-1', 'user-2'],
                contactInfos: [{ presentation: '+70000000001', isPrimary: true }],
            },
        });
    });

    it('enqueuing the same version twice has one effect, concurrently as well', async () => {
        await seed(1);
        await Promise.all([enqueue(1), enqueue(1)]);
        await enqueue(1);

        expect(await outbox()).toHaveLength(1);
        await processor.processPendingBatch();
        await enqueue(1);
        expect(publish).toHaveBeenCalledTimes(1);
    });

    it('an older version is never sent after a newer one', async () => {
        await seed(2);
        await enqueue(2);
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).toMatchObject({ version: '2' });
    });

    it('a newer version replaces an older one still waiting, the older is never sent', async () => {
        await seed(1);
        await enqueue(1);
        await setVersion(2);
        await enqueue(2);

        expect((await outbox()).map(r => [r.payload.version, r.status])).toEqual([
            ['1', 'skipped'],
            ['2', 'pending'],
        ]);
        await processor.processPendingBatch();
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0][1]).toMatchObject({ version: '2' });
    });

    it('the reconciler re-drives a version that never reached the outbox, once', async () => {
        await seed(3);

        expect(await reconciler.sweep()).toBe(1);
        expect(await reconciler.sweep()).toBe(0);
        expect((await outbox()).map(r => r.payload.version)).toEqual(['3']);
    });

    it('a counterparty never changed by mivend (version 0) is not sent', async () => {
        await seed(0);

        expect(await reconciler.sweep()).toBe(0);
        expect(await outbox()).toHaveLength(0);
    });

    it('a counterparty that no longer exists is a recorded skip with the reason', async () => {
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'skipped' });
        expect(rows[0].lastError).toContain('not found');
    });
});
