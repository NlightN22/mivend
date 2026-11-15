import { TradingPointCustomerService } from '../../trading-point-customer.service';
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
import { TradingPointErp } from '../../entities/trading-point-erp.entity';
import { TradingPointService } from '../../trading-point.service';
import { TradingPointVersionService } from '../../trading-point-version.service';
import type { TradingPointVersionedEvent } from '../../trading-point-versioned.event';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar', nullable: true }) branchId!: string | null;
}

@Entity('trading_point')
class TestTradingPoint {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'uuid', default: () => 'gen_random_uuid()' }) uuid!: string;
    @Column({ type: 'varchar', default: '' }) erpId!: string;
    @Column({ type: 'varchar' }) counterpartyId!: string;
    @Column({ type: 'varchar', nullable: true }) servicingBranchId!: string | null;
    @Column({ type: 'boolean', default: true }) customerOwned!: boolean;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', default: 'active' }) customerStatus!: string;
    @Column({ type: 'int', default: 0 }) version!: number;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'varchar' }) address!: string;
    @Column({ type: 'varchar', nullable: true }) workingHours!: string | null;
    @Column({ type: 'varchar', nullable: true }) deliveryComment!: string | null;
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

@Entity('trading_point_erp')
class TestMirror {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', nullable: true }) counterpartyId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
    @Column({ type: 'varchar', nullable: true }) name!: string | null;
    @Column({ type: 'varchar', nullable: true }) address!: string | null;
}

const { schema, extra } = testSchemaOptions('trading_point_version');
const mirrors = new Map<unknown, unknown>([
    [TradingPoint, TestTradingPoint],
    [ContactPerson, TestContact],
    [Counterparty, TestCounterparty],
    [TradingPointErp, TestMirror],
]);
const published: TradingPointVersionedEvent[] = [];
const assertWritable = vi.fn(async () => undefined);
let dataSource: DataSource;
let service: TradingPointService;
let customers: TradingPointCustomerService;
let pointId: number;
let counterpartyId: string;

function connection(): TransactionalConnection {
    const base = createTestConnection(dataSource);
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) =>
            base.getRepository(c, (mirrors.get(entity) ?? entity) as never),
    } as unknown as TransactionalConnection;
}

const inTx = <T>(work: (ctx: RequestContext) => Promise<T>): Promise<T> =>
    dataSource.transaction(em => work({ em } as unknown as RequestContext));
const row = (): Promise<TestTradingPoint> =>
    dataSource.getRepository(TestTradingPoint).findOneByOrFail({ id: pointId });

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestTradingPoint, TestContact, TestMirror],
        synchronize: true,
    });
    await dataSource.initialize();
    const versions = new TradingPointVersionService(connection(), {
        publish: (event: TradingPointVersionedEvent) => published.push(event),
    } as never);
    customers = new TradingPointCustomerService(connection(), versions);
    service = new TradingPointService(
        connection(),
        {} as never,
        { assertCounterpartyWritable: assertWritable } as never,
        { recordChange: vi.fn() } as never,
        {} as never,
        versions,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    published.length = 0;
    assertWritable.mockClear();
    await dataSource.query(
        `TRUNCATE "${schema}".trading_point_erp, "${schema}".contact_person, "${schema}".trading_point, "${schema}".counterparty RESTART IDENTITY CASCADE`,
    );
    const cp = await dataSource.getRepository(TestCounterparty).save({});
    counterpartyId = String(cp.id);
    const tp = await dataSource.getRepository(TestTradingPoint).save({
        counterpartyId,
        erpId: 'erp-1',
        name: 'orig',
        address: 'Test Street 12',
        latitude: 10,
        longitude: 10,
    });
    pointId = tp.id;
});

describe('trading point version bump (real Postgres)', () => {
    it('a manager edit moves the version by one and announces it once', async () => {
        await inTx(ctx => service.updateDetails(ctx, pointId, { name: 'edited' }));

        expect((await row()).version).toBe(1);
        expect(published).toHaveLength(1);
        expect([published[0].tradingPointUuid, published[0].version]).toEqual([
            (await row()).uuid,
            1,
        ]);
    });

    it('an edit that changes nothing does not move the version', async () => {
        await inTx(ctx => service.updateDetails(ctx, pointId, { name: 'orig' }));

        expect((await row()).version).toBe(0);
        expect(published).toHaveLength(0);
    });

    it('concurrent edits get distinct increasing versions and none is lost', async () => {
        await Promise.all(
            Array.from({ length: 8 }, (_, i) =>
                inTx(ctx => service.updateDetails(ctx, pointId, { name: `edit-${i}` })),
            ),
        );

        expect((await row()).version).toBe(8);
        expect(published.map(e => e.version).sort((a, b) => a - b)).toEqual([
            1, 2, 3, 4, 5, 6, 7, 8,
        ]);
    });

    it('a rolled-back edit leaves the version where it was', async () => {
        await expect(
            inTx(async ctx => {
                await service.updateDetails(ctx, pointId, { name: 'doomed' });
                throw new Error('rollback');
            }),
        ).rejects.toThrow('rollback');

        expect((await row()).version).toBe(0);
    });

    it('an edit refused by the scope check bumps nothing', async () => {
        assertWritable.mockRejectedValueOnce(new Error('out of scope'));

        await expect(
            inTx(ctx => service.updateDetails(ctx, pointId, { name: 'x' })),
        ).rejects.toThrow('out of scope');
        expect((await row()).version).toBe(0);
        expect(published).toHaveLength(0);
    });

    it('a customer-added point starts at version 1', async () => {
        const added = await inTx(ctx =>
            customers.customerAdd(ctx, counterpartyId, {
                name: 'Added',
                address: 'Test Street 99',
                latitude: 11,
                longitude: 12,
            }),
        );

        expect(added.version).toBe(1);
        expect(published.map(e => e.version)).toEqual([1]);
    });

    it('hide and restore each move the version once', async () => {
        await inTx(ctx => customers.customerDelete(ctx, pointId, counterpartyId));
        await inTx(ctx => customers.customerDelete(ctx, pointId, counterpartyId));
        await inTx(ctx => customers.customerRestore(ctx, pointId, counterpartyId));

        expect((await row()).version).toBe(2);
        expect(published.map(e => e.version)).toEqual([1, 2]);
    });

    it('inbound stream writes never move the version or announce', async () => {
        await inTx(ctx =>
            service.upsertFromStream(ctx, 'erp-1', {
                name: 'From ERP',
                counterpartyId,
                servicingBranchId: null,
                isActive: false,
            }),
        );
        await inTx(ctx => service.deactivate(ctx, 'erp-1'));

        expect((await row()).version).toBe(0);
        expect(published).toHaveLength(0);
    });
});
