import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    Column,
    DataSource,
    Entity,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryGeneratedColumn,
} from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { TradingPoint } from '../../entities/trading-point.entity';
import { TradingPointChange } from '../../entities/trading-point-change.entity';
import { savePendingChange } from '../../trading-point-change';
import { TradingPointChangeService } from '../../trading-point-change.service';
import { TradingPointService } from '../../trading-point.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar', nullable: true }) uuid!: string | null;
    @Column({ type: 'boolean', default: true }) customerOwned!: boolean;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) address!: string;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
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
}

const { schema, extra } = testSchemaOptions('trading_point_update_race');
const mirrors = new Map<unknown, unknown>([
    [TradingPoint, TestTradingPoint],
    [ContactPerson, TestContact],
    [Counterparty, TestCounterparty],
]);
const recordChange = vi.fn();
let dataSource: DataSource;
let service: TradingPointService;
let changeService: TradingPointChangeService;
let pointId: number;

function connection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
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
        entities: [TestCounterparty, TestTradingPoint, TestContact, TradingPointChange],
        synchronize: true,
    });
    await dataSource.initialize();
    const slowScope = {
        assertCounterpartyWritable: () => new Promise(resolve => setTimeout(resolve, 150)),
    };
    service = new TradingPointService(
        connection(),
        {} as never,
        slowScope as never,
        { recordChange } as never,
        {} as never,
    );
    changeService = new TradingPointChangeService(
        connection(),
        service,
        { findOneVisible: async () => ({}) } as never,
        { publish: vi.fn() } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    recordChange.mockReset();
    await dataSource.query(
        `TRUNCATE "${schema}".trading_point_change, "${schema}".contact_person, "${schema}".trading_point, "${schema}".counterparty RESTART IDENTITY CASCADE`,
    );
    const cp = await dataSource.getRepository(TestCounterparty).save({});
    const tp = await dataSource.getRepository(TestTradingPoint).save({
        counterpartyId: String(cp.id),
        name: 'orig',
        address: 'Test Street 12',
        latitude: 10,
        longitude: 10,
    });
    pointId = tp.id;
});

function edit(name: string): Promise<unknown> {
    return dataSource.transaction(em =>
        service.updateDetails({ em } as unknown as RequestContext, pointId, { name }),
    );
}

describe('TradingPointService.updateDetails (real Postgres, concurrent writers)', () => {
    it('serializes two edits of one point so each recorded diff starts from the previous state', async () => {
        await Promise.all([edit('first'), edit('second')]);

        const diffs = recordChange.mock.calls.map(
            ([, input]) => input.changedFields.name as { from: string; to: string },
        );
        expect(diffs).toHaveLength(2);
        const [a, b] = diffs;
        expect(a.from).toBe('orig');
        expect(b.from).toBe(a.to);
        const row = await dataSource
            .getRepository(TestTradingPoint)
            .findOneByOrFail({ id: pointId });
        expect(row.name).toBe(b.to);
    });

    describe('customerEdit vs staff location change on one point', () => {
        const customerEdit = (): Promise<unknown> =>
            dataSource.transaction(async em => {
                const row = await em
                    .getRepository(TestTradingPoint)
                    .findOneByOrFail({ id: pointId });
                return service.customerEdit(
                    { em } as unknown as RequestContext,
                    pointId,
                    row.counterpartyId,
                    { name: 'customer', address: 'Test Street 12' },
                );
            });
        const staffMove = (): Promise<unknown> =>
            dataSource.transaction(em =>
                service.updateDetails({ em } as unknown as RequestContext, pointId, {
                    latitude: 55,
                    longitude: 37,
                }),
            );
        const pause = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

        it.each([
            ['staff first', true],
            ['customer first', false],
        ])('keeps the staff location and the customer name (%s)', async (_label, staffFirst) => {
            const first = staffFirst ? staffMove() : customerEdit();
            await pause(30);
            const second = staffFirst ? customerEdit() : staffMove();
            await Promise.all([first, second]);

            const row = await dataSource
                .getRepository(TestTradingPoint)
                .findOneByOrFail({ id: pointId });
            expect([row.latitude, row.longitude, row.name]).toEqual([55, 37, 'customer']);
        });
    });

    describe('manager decision vs a new customer proposal on one ERP point', () => {
        const pause = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
        const proposal = {
            name: 'Proposed',
            address: 'Test Street 12',
            latitude: 10,
            longitude: 10,
            workingHours: null,
        };
        let changeId: string;

        beforeEach(async () => {
            await dataSource
                .getRepository(TestTradingPoint)
                .update({ id: pointId }, { customerOwned: false });
            const row = await dataSource
                .getRepository(TestTradingPoint)
                .findOneByOrFail({ id: pointId });
            const change = await savePendingChange(
                dataSource.getRepository(TradingPointChange),
                { id: String(pointId), counterpartyId: row.counterpartyId },
                proposal,
                null,
            );
            changeId = change.id as unknown as string;
        });

        const newProposal = (): Promise<unknown> =>
            dataSource.transaction(async em => {
                const row = await em
                    .getRepository(TestTradingPoint)
                    .findOneByOrFail({ id: pointId });
                return service.customerEdit(
                    { em } as unknown as RequestContext,
                    pointId,
                    row.counterpartyId,
                    { name: 'Newer', address: 'Test Street 12' },
                );
            });
        const decide = (kind: 'accept' | 'reject'): Promise<unknown> =>
            dataSource.transaction(em =>
                changeService[kind]({ em } as unknown as RequestContext, changeId),
            );

        it.each(['accept', 'reject'] as const)(
            '%s racing a newer proposal never deadlocks and leaves one consistent outcome',
            async kind => {
                const results = await Promise.allSettled([
                    decide(kind),
                    pause(30).then(newProposal),
                ]);

                for (const r of results) {
                    if (r.status === 'rejected') {
                        expect((r.reason as { code?: string }).code).not.toBe('40P01');
                        expect((r.reason as Error).message).toMatch(/already decided|not found/);
                    }
                }
                const pending = await dataSource
                    .getRepository(TradingPointChange)
                    .count({ where: { status: 'pending' } });
                expect(pending).toBeLessThanOrEqual(1);
            },
        );

        it('accept racing reject decides the change exactly once', async () => {
            const results = await Promise.allSettled([decide('accept'), decide('reject')]);

            expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
            const rows = await dataSource.getRepository(TradingPointChange).find();
            expect(rows.filter(r => r.status === 'pending')).toHaveLength(0);
        });
    });
});
