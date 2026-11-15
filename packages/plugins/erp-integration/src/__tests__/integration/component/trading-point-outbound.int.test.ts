import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import { Counterparty, TradingPoint } from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { IntegrationOutboxEntry } from '../../../entities/integration-outbox-entry.entity';
import { IntegrationOutboxProcessorService } from '../../../integration-outbox-processor.service';
import { IntegrationOutboxService } from '../../../integration-outbox.service';
import { OutboundGateway } from '../../../outbound-gateway';
import { TradingPointChangedListener } from '../../../trading-point-changed.listener';
import { TradingPointCommandBuilder } from '../../../trading-point-command.builder';
import { TradingPointReconciler } from '../../../trading-point-reconciler.service';
import { testRequestContextService } from '../../test-request-context-service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) address!: string;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
    @Column({ type: 'varchar', nullable: true }) workingHours!: string | null;
    @Column({ type: 'varchar', nullable: true }) deliveryComment!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', default: 'active' }) customerStatus!: string;
    @Column({ type: 'int', default: 0 }) version!: number;
    @OneToMany(() => TestContact, c => c.tradingPoint, { eager: true, cascade: true })
    contacts!: TestContact[];
}

@Entity('contact_person')
class TestContact {
    @PrimaryGeneratedColumn('increment') id!: number;
    @ManyToOne(() => TestTradingPoint, tp => tp.contacts, { onDelete: 'CASCADE' })
    @JoinColumn()
    tradingPoint!: TestTradingPoint;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) email!: string | null;
    @Column({ type: 'boolean', default: false }) isPrimary!: boolean;
}

const { schema, extra } = testSchemaOptions('erp_integration_trading_point_outbound');
const mirrors = new Map<unknown, unknown>([
    [TradingPoint, TestTradingPoint],
    [Counterparty, TestCounterparty],
]);
let dataSource: DataSource;
let listener: TradingPointChangedListener;
let reconciler: TradingPointReconciler;
let processor: IntegrationOutboxProcessorService;
let uuid: string;
const publish = vi.fn();

const outbox = (): Promise<IntegrationOutboxEntry[]> =>
    dataSource.getRepository(IntegrationOutboxEntry).find({ order: { id: 'ASC' } });
const setVersion = (version: number, name = `Point v${version}`): Promise<unknown> =>
    dataSource.getRepository(TestTradingPoint).update({ uuid }, { version, name });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationOutboxEntry, TestCounterparty, TestTradingPoint, TestContact],
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
    listener = new TradingPointChangedListener(
        {} as never,
        gateway,
        new TradingPointCommandBuilder(connection, gateway),
        { instanceType: 'central' } as never,
    );
    reconciler = new TradingPointReconciler(connection, listener, testRequestContextService);
    processor = new IntegrationOutboxProcessorService(
        connection,
        { publish } as never,
        testRequestContextService,
    );
});

afterEach(async () => {
    publish.mockReset();
    await dataSource.query(
        `TRUNCATE "${schema}".integration_outbox, "${schema}".contact_person, "${schema}".trading_point, "${schema}".counterparty RESTART IDENTITY CASCADE`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function seedPoint(version: number): Promise<void> {
    const cp = await dataSource.getRepository(TestCounterparty).save({ erpId: 'erp-cp-1' });
    const tp = await dataSource.getRepository(TestTradingPoint).save({
        erpId: 'erp-point-1',
        counterpartyId: String(cp.id),
        name: `Point v${version}`,
        address: 'Test Street 1',
        latitude: 10,
        longitude: 20,
        version,
        contacts: [{ name: 'Ivan', phone: '+70000000001', email: null, isPrimary: true }],
    });
    uuid = tp.uuid;
}

const enqueue = (version: number): Promise<void> =>
    listener.enqueueVersion(testRequestContext, uuid, version);

describe('trading point outbound (integration, real Postgres)', () => {
    it('one change gives exactly one pending row carrying the full record', async () => {
        await seedPoint(1);
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ eventType: 'trading-point.changed', status: 'pending' });
        expect(rows[0].payload).toMatchObject({
            uuid,
            version: '1',
            name: 'Point v1',
            counterpartyId: 'erp-cp-1',
            address: 'Test Street 1',
            contactPhone: '+70000000001',
        });
    });

    it('enqueuing the same version twice has one effect, concurrently as well', async () => {
        await seedPoint(1);
        await Promise.all([enqueue(1), enqueue(1)]);
        await enqueue(1);

        expect(await outbox()).toHaveLength(1);
        await processor.processPendingBatch();
        await enqueue(1);
        expect(publish).toHaveBeenCalledTimes(1);
        expect((await outbox()).filter(r => r.status !== 'published')).toHaveLength(0);
    });

    it('a late event for an older version sends nothing new, the current record already queued', async () => {
        await seedPoint(2);
        await enqueue(2);
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0].payload).toMatchObject({ version: '2' });
    });

    it('a newer version replaces an older one that is still waiting, so the older is never sent', async () => {
        await seedPoint(1);
        await enqueue(1);
        await setVersion(2);
        await enqueue(2);

        const rows = await outbox();
        expect(rows.map(r => [r.payload.version, r.status])).toEqual([
            ['1', 'skipped'],
            ['2', 'pending'],
        ]);
        await processor.processPendingBatch();
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish.mock.calls[0][1]).toMatchObject({ version: '2' });
    });

    it('after the older version was published, the newer one follows it', async () => {
        await seedPoint(1);
        await enqueue(1);
        await processor.processPendingBatch();
        await setVersion(2);
        await enqueue(2);
        await processor.processPendingBatch();

        expect(publish.mock.calls.map(c => (c[1] as { version: string }).version)).toEqual([
            '1',
            '2',
        ]);
    });

    it('a point that no longer exists is a recorded skip with the reason', async () => {
        await seedPoint(1);
        await dataSource.getRepository(TestTradingPoint).delete({ uuid });
        await enqueue(1);

        const rows = await outbox();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ status: 'skipped' });
        expect(rows[0].lastError).toContain('not found');
    });

    it('the reconciler re-drives a version that never reached the outbox, once', async () => {
        await seedPoint(3);

        expect(await reconciler.sweep()).toBe(1);
        expect(await reconciler.sweep()).toBe(0);
        expect(await outbox()).toHaveLength(1);
    });

    it('a skipped row does not count as coverage, the reconciler still re-drives the version', async () => {
        await seedPoint(2);
        await dataSource.getRepository(IntegrationOutboxEntry).insert({
            eventId: '00000000-0000-4000-8000-000000000001',
            eventType: 'trading-point.changed',
            payload: { uuid, version: 2 },
            status: 'skipped',
        });

        expect(await reconciler.sweep()).toBe(1);
        expect((await outbox()).map(r => r.status)).toEqual(['skipped', 'pending']);
    });

    it('a point never changed by mivend (version 0) is not sent', async () => {
        await seedPoint(0);

        expect(await reconciler.sweep()).toBe(0);
        expect(await outbox()).toHaveLength(0);
    });
});
