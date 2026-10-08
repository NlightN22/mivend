import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, EntityManager, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    withAggregateLock,
} from 'shared';

// The product -> unit soft link: product import and unit import follow the same protocol as
// ProductStreamHandler / UnitStreamHandler (lock `unit:<id>`, product reads the unit then writes the
// variant, unit upserts then refreshes variants), on replica tables and the real withAggregateLock.
@Entity('unit_backfill_unit')
class TestUnit {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) entityId!: string;
    @Column({ type: 'float' }) ratioToBase!: number;
}

@Entity('unit_backfill_variant')
class TestVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) defaultSalesUnitId!: string | null;
    @Column({ type: 'float', nullable: true }) unitRatioToBase!: number | null;
}

interface TxCtx {
    em: EntityManager;
}

let dataSource: DataSource;
let connection: TransactionalConnection;
const { schema, extra } = testSchemaOptions('unit_product_backfill');
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestUnit, TestVariant],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = {
        withTransaction: (_ctx: unknown, work: (ctx: TxCtx) => Promise<unknown>) =>
            dataSource.transaction(em => work({ em })),
        getRepository: (ctx: TxCtx) => ({
            query: (sql: string, params: unknown[]) => ctx.em.query(sql, params),
        }),
    } as unknown as TransactionalConnection;
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE unit_backfill_unit, unit_backfill_variant RESTART IDENTITY');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const ctx = {} as RequestContext;

async function importProduct(unitId: string, pauseMs = 0, locked = true): Promise<void> {
    const body = async (em: EntityManager): Promise<void> => {
        const unit = await em.findOneBy(TestUnit, { entityId: unitId });
        await sleep(pauseMs);
        await em.save(TestVariant, {
            defaultSalesUnitId: unitId,
            unitRatioToBase: unit?.ratioToBase ?? null,
        });
    };
    if (!locked) return void (await dataSource.transaction(body));
    await withAggregateLock(connection, ctx, `unit:${unitId}`, c =>
        body((c as unknown as TxCtx).em),
    );
}

async function importUnit(unitId: string, ratio: number, locked = true): Promise<void> {
    const body = async (em: EntityManager): Promise<void> => {
        await em.save(TestUnit, { entityId: unitId, ratioToBase: ratio });
        await em.update(TestVariant, { defaultSalesUnitId: unitId }, { unitRatioToBase: ratio });
    };
    if (!locked) return void (await dataSource.transaction(body));
    await withAggregateLock(connection, ctx, `unit:${unitId}`, c =>
        body((c as unknown as TxCtx).em),
    );
}

const variantRatio = async (): Promise<number | null> =>
    (await dataSource.getRepository(TestVariant).findOneByOrFail({ id: 1 })).unitRatioToBase;

describe('product -> unit soft link back-fill (real Postgres)', () => {
    it('product first: saved without unit fields, filled when the unit arrives', async () => {
        await importProduct('u1');
        expect(await variantRatio()).toBeNull();

        await importUnit('u1', 12);

        expect(await variantRatio()).toBe(12);
    });

    it('unit first: the product picks the unit fields up at import', async () => {
        await importUnit('u1', 6);

        await importProduct('u1');

        expect(await variantRatio()).toBe(6);
    });

    it('unit arriving between the product lookup and its save still fills the variant (lock)', async () => {
        const product = importProduct('u1', 150);
        await sleep(40);
        const unit = importUnit('u1', 24);

        await Promise.all([product, unit]);

        expect(await variantRatio()).toBe(24);
    });

    it('control: without the lock the same interleaving loses the unit fields', async () => {
        const product = importProduct('u1', 150, false);
        await sleep(40);
        const unit = importUnit('u1', 24, false);

        await Promise.all([product, unit]);

        expect(await variantRatio()).toBeNull();
    });
});
