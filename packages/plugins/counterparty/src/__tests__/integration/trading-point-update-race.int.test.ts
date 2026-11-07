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
import { TradingPointService } from '../../trading-point.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) counterpartyId!: string;
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
        entities: [TestCounterparty, TestTradingPoint, TestContact],
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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    recordChange.mockReset();
    await dataSource.query(
        `TRUNCATE "${schema}".contact_person, "${schema}".trading_point, "${schema}".counterparty RESTART IDENTITY CASCADE`,
    );
    const cp = await dataSource.getRepository(TestCounterparty).save({});
    const tp = await dataSource.getRepository(TestTradingPoint).save({
        counterpartyId: String(cp.id),
        name: 'orig',
        address: 'addr',
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
});
