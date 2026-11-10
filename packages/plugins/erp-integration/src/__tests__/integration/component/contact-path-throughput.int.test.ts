import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    ContactPoint,
    ContactPointService,
    Counterparty,
    CounterpartyContactErp,
    CounterpartyContactPerson,
    CounterpartyContactPoint,
    ContactPerson,
    ErpContactPersonService,
} from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { resolve } from 'node:path';
import type { MigrationInterface } from 'typeorm';
import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { CounterpartyStreamHandler } from '../../../handlers/counterparty.handler';
import { IntegrationInboxService } from '../../../integration-inbox.service';
import { makeInboxProcessor } from './inbox-processor-helpers';

// Repeat with a prod-like burst: CONTACT_BENCH_ROWS=25000 make test-int (docs/ai/erp-streams-map.md "Burst throughput").
const ROWS = Number(process.env.CONTACT_BENCH_ROWS ?? 2000);
const CHANNELS = 4;
// Regression guard at ~70% of the slowest measured run (through the docker proxy), not a target.
const MIN_ROWS_PER_SECOND = 10;

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}
@Entity('contact_point')
class TestPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar' }) value!: string;
    @Column({ type: 'varchar', nullable: true }) normalizedValue!: string | null;
    @Column({ type: 'boolean' }) isUsable!: boolean;
    @Column({ type: 'varchar', nullable: true }) label!: string | null;
    @Column({ type: 'varchar', nullable: true }) comment!: string | null;
    @Column({ type: 'varchar' }) source!: string;
    @UpdateDateColumn() updatedAt!: Date;
}
@Entity('counterparty_contact_point')
class TestLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPointId!: number;
    @ManyToOne(() => TestPoint)
    @JoinColumn({ name: 'contactPointId' })
    contactPoint!: TestPoint;
    @Column({ type: 'boolean' }) isPrimary!: boolean;
}
@Entity('contact_person')
class TestPerson {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) erpId!: string | null;
}
@Entity('counterparty_contact_person')
class TestPersonLink {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'int' }) counterpartyId!: number;
    @Column({ type: 'int' }) contactPersonId!: number;
}
@Entity('counterparty_contact_erp')
class TestMirror {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'boolean' }) isDeleted!: boolean;
}

const stand = new Map<unknown, unknown>([
    [Counterparty, TestCounterparty],
    [ContactPoint, TestPoint],
    [CounterpartyContactPoint, TestLink],
    [ContactPerson, TestPerson],
    [CounterpartyContactPerson, TestPersonLink],
    [CounterpartyContactErp, TestMirror],
]);
const { schema, extra } = testSchemaOptions('contact_path_throughput');
const connectionOptions = {
    type: 'postgres' as const,
    ...testDataSourceConnectionOptions(),
    schema,
    extra,
};
let dataSource: DataSource;
let seq = 0;

beforeAll(async () => {
    await createTestSchema(schema);
    const setup = new DataSource({
        ...connectionOptions,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await setup.initialize();
    await setup.query(`DROP INDEX integration_inbox_event_reapply`);
    await setup.query(`
        CREATE TABLE counterparty (id SERIAL PRIMARY KEY, "erpId" varchar);
        CREATE UNIQUE INDEX counterparty_erp_id ON counterparty ("erpId");
        CREATE TABLE administrator (id SERIAL PRIMARY KEY);
        CREATE TABLE trading_point (id SERIAL PRIMARY KEY);
        CREATE TABLE organization_requisites (id SERIAL PRIMARY KEY);
        CREATE TABLE erp_user (id SERIAL PRIMARY KEY);
        CREATE TABLE counterparty_contact_erp (id SERIAL PRIMARY KEY, "erpId" varchar NOT NULL, "counterpartyId" varchar NOT NULL, "isDeleted" boolean NOT NULL DEFAULT false);
        CREATE UNIQUE INDEX counterparty_contact_erp_erp_id ON counterparty_contact_erp ("erpId");
        CREATE INDEX counterparty_contact_erp_counterparty ON counterparty_contact_erp ("counterpartyId");
        CREATE TABLE contact_person (
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            id SERIAL PRIMARY KEY, name varchar NOT NULL, phone varchar, email varchar,
            "isPrimary" boolean NOT NULL DEFAULT false, "tradingPointId" integer REFERENCES trading_point(id));`);
    const runner = setup.createQueryRunner();
    // The app's own migration builds the schema (FKs, indexes, triggers); loaded by path because plugins cannot import the app.
    const path = resolve(
        __dirname,
        '../../../../../../../apps/server/src/migrations/1791573000000-contact-points.ts',
    );
    const migration = (await import(/* @vite-ignore */ path)) as Record<
        string,
        new () => MigrationInterface
    >;
    await new migration.ContactPoints1791573000000().up(runner);
    await runner.release();
    await setup.destroy();

    dataSource = new DataSource({
        ...connectionOptions,
        entities: [
            IntegrationInboxEvent,
            TestCounterparty,
            TestPoint,
            TestLink,
            TestPerson,
            TestPersonLink,
            TestMirror,
        ],
    });
    await dataSource.initialize();
    await dataSource.query(
        `INSERT INTO counterparty ("erpId") SELECT 'cp-' || g FROM generate_series(1, ${ROWS}) g`,
    );
    await dataSource.query(
        `INSERT INTO contact_person (name, "erpId", uuid, source) SELECT 'P', 'ct-' || g, gen_random_uuid(), 'erp' FROM generate_series(1, ${ROWS}) g`,
    );
    await dataSource.query(
        `INSERT INTO counterparty_contact_erp ("erpId", "counterpartyId") SELECT 'ct-' || g, 'cp-' || g FROM generate_series(1, ${ROWS}) g`,
    );
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

function mapped(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (stand.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}

async function enqueueWave(version: string): Promise<void> {
    const repo = dataSource.getRepository(IntegrationInboxEvent);
    for (let from = 1; from <= ROWS; from += 1000) {
        const rows = [];
        for (let i = from; i < Math.min(from + 1000, ROWS + 1); i++) {
            seq += 1;
            rows.push({
                stream: 'counterparty' as const,
                entityId: `cp-${i}`,
                version,
                sourceEventId: `bench-${seq}`,
                status: 'pending' as const,
                attempts: 0,
                payload: {
                    name: `Counterparty ${i}`,
                    isActive: true,
                    contactInfos: Array.from({ length: CHANNELS }, (_, c) => ({
                        type: c === 1 ? 'АдресЭлектроннойПочты' : 'Телефон',
                        presentation:
                            c === 1
                                ? `c${i}@example.com`
                                : `+7912${String(i * 10 + c).padStart(7, '0')}`,
                        isPrimary: c === 0,
                    })),
                },
            });
        }
        await repo.insert(rows);
    }
}

async function drain(processor: ReturnType<typeof makeInboxProcessor>): Promise<number> {
    const started = performance.now();
    for (;;) {
        const { claimed } = await processor.processPendingBatch(['counterparty'], 500);
        if (claimed === 0) break;
    }
    return ROWS / ((performance.now() - started) / 1000);
}

// Real path on the migrated schema: inbox row -> processor -> counterparty handler -> channel replace -> late contact link.
describe('contact path throughput (real Postgres, migrated schema)', () => {
    it('applies counterparty events with contact lists fast enough for a burst, and replay is idempotent', async () => {
        const connection = mapped(createTestConnection(dataSource));
        const handler = new CounterpartyStreamHandler(
            { upsertActiveState: vi.fn().mockResolvedValue(true) } as never,
            {} as never,
            {
                assignCounterpartyIfInputsChanged: async (
                    _c: unknown,
                    _e: string,
                    write: () => unknown,
                ) => write(),
            } as never,
            new ContactPointService(connection),
            new ErpContactPersonService(connection),
        );
        const inbox = new IntegrationInboxService(createTestConnection(dataSource));
        const processor = makeInboxProcessor(
            dataSource,
            inbox,
            vi.fn((c: RequestContext, id: string, p: Record<string, unknown>) =>
                handler.apply(c, id, p),
            ),
        );

        await enqueueWave('1');
        const first = await drain(processor);
        const afterFirst = await dataSource.query(`SELECT count(*)::int AS n FROM contact_point`);
        await enqueueWave('2');
        const replay = await drain(processor);

        console.log(
            `contact path ${new Date().toISOString().slice(0, 10)}: ${ROWS} counterparties x ${CHANNELS} channels, first apply ${first.toFixed(0)} rows/s, replay ${replay.toFixed(0)} rows/s`,
        );
        // The savepoint guard turns a contact step error into this reason instead of failing the row.
        expect(
            await dataSource.query(
                `SELECT outcome_reason FROM integration_inbox_event WHERE outcome_reason IS NOT NULL LIMIT 3`,
            ),
        ).toEqual([]);
        expect(afterFirst).toEqual([{ n: ROWS * CHANNELS }]);
        expect(await dataSource.query(`SELECT count(*)::int AS n FROM contact_point`)).toEqual([
            { n: ROWS * CHANNELS },
        ]);
        expect(
            await dataSource.query(
                `SELECT count(*)::int AS n FROM integration_inbox_event WHERE status <> 'processed'`,
            ),
        ).toEqual([{ n: 0 }]);
        expect(first).toBeGreaterThan(MIN_ROWS_PER_SECOND);
        expect(replay).toBeGreaterThan(MIN_ROWS_PER_SECOND);
    }, 6_000_000);
});
