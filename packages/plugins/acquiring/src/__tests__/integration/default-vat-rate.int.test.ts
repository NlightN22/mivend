import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { TaxRate, type RequestContext, type TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
    unconfirmedTaxRateName,
} from 'shared';

import { findDefaultVatRate } from '../../default-vat-rate';

@Entity('zone')
class TestZone {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
}

@Entity('tax_category')
class TestTaxCategory {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'boolean', default: false }) isDefault!: boolean;
}

@Entity('tax_rate')
class TestTaxRate {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) name!: string;
    @Column({ type: 'decimal', precision: 5, scale: 2 }) value!: string;
    @Column({ type: 'boolean' }) enabled!: boolean;
    @ManyToOne(() => TestTaxCategory) category!: TestTaxCategory;
    @ManyToOne(() => TestZone) zone!: TestZone;
}

let dataSource: DataSource;
let connection: TransactionalConnection;
const { schema, extra } = testSchemaOptions('default_vat_rate');
const ctxFor = (zoneId: number | null): RequestContext =>
    ({ channel: { defaultTaxZone: zoneId === null ? null : { id: zoneId } } }) as never;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestZone, TestTaxCategory, TestTaxRate],
        synchronize: true,
    });
    await dataSource.initialize();
    connection = {
        getRepository: (_c: unknown, entity: unknown) => {
            if (entity !== TaxRate) throw new Error('Unmapped entity');
            return dataSource.getRepository(TestTaxRate);
        },
    } as unknown as TransactionalConnection;
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let zoneA: TestZone;
let zoneB: TestZone;

beforeEach(async () => {
    await dataSource.query('TRUNCATE tax_rate, tax_category, zone RESTART IDENTITY CASCADE');
    [zoneA, zoneB] = await dataSource.getRepository(TestZone).save([{ name: 'A' }, { name: 'B' }]);
    const [standard, reduced] = await dataSource.getRepository(TestTaxCategory).save([
        { name: 'НДС22', isDefault: true },
        { name: 'НДС10', isDefault: false },
    ]);
    await dataSource.getRepository(TestTaxRate).save([
        { name: 'НДС10 (A)', value: '10', enabled: true, category: reduced, zone: zoneA },
        { name: 'НДС22 (B)', value: '20', enabled: true, category: standard, zone: zoneB },
        { name: 'НДС22 (A)', value: '22', enabled: true, category: standard, zone: zoneA },
    ]);
});

describe('findDefaultVatRate (real Postgres)', () => {
    it('picks the default category rate in the channel default zone only', async () => {
        expect(await findDefaultVatRate(connection, ctxFor(zoneA.id))).toEqual({
            taxRate: 22,
            taxCategoryName: 'НДС22',
        });
        expect((await findDefaultVatRate(connection, ctxFor(zoneB.id)))?.taxRate).toBe(20);
    });

    it('reports an ERP placeholder rate as unconfirmed', async () => {
        await dataSource.query(
            `UPDATE tax_rate SET name = $1, value = 0 WHERE name = 'НДС22 (A)'`,
            [unconfirmedTaxRateName('НДС22', 'A')],
        );
        expect((await findDefaultVatRate(connection, ctxFor(zoneA.id)))?.taxRate).toBeNull();
    });

    it('returns null without a default zone or an enabled default rate', async () => {
        expect(await findDefaultVatRate(connection, ctxFor(null))).toBeNull();
        await dataSource.query(`UPDATE tax_rate SET enabled = false WHERE name = 'НДС22 (A)'`);
        expect(await findDefaultVatRate(connection, ctxFor(zoneA.id))).toBeNull();
    });
});
