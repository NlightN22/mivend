import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { mainContractPriceTypeIdSql } from '@mivend/plugin-customer-pricing';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// Hand-rolled tables (Vendure entities need bootstrap-time id strategy), real Postgres.
@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', nullable: true }) mainContractId!: string | null;
}

@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) priceTypeId!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

@Entity('price_type')
class TestPriceType {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', nullable: true }) externalId!: string | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

const { schema, extra } = testSchemaOptions('main_contract_price_type');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCustomer, TestCounterparty, TestContract, TestPriceType],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of [TestCustomer, TestCounterparty, TestContract, TestPriceType]) {
        await dataSource.getRepository(entity).clear();
    }
});

async function seedCustomer(mainContractId: string | null): Promise<string> {
    const cp = await dataSource.getRepository(TestCounterparty).save({ mainContractId });
    const cu = await dataSource
        .getRepository(TestCustomer)
        .save({ customFieldsCounterpartyid: cp.id });
    return cu.id;
}

async function resolve(customerId: string): Promise<string | null> {
    const rows: Array<{ id: string | null }> = await dataSource.query(
        `SELECT ${mainContractPriceTypeIdSql('$1')} AS id`,
        [customerId],
    );
    return rows[0]?.id ?? null;
}

async function seedPriceType(externalId: string, isActive = true): Promise<string> {
    return (await dataSource.getRepository(TestPriceType).save({ externalId, isActive })).id;
}

async function seedContract(erpId: string, priceTypeId: string, isActive = true): Promise<void> {
    await dataSource.getRepository(TestContract).save({ erpId, priceTypeId, isActive });
}

describe('mainContractPriceTypeIdSql', () => {
    it('resolves the price type of an active main contract', async () => {
        const ptId = await seedPriceType('pt-1');
        await seedContract('c-1', 'pt-1');
        expect(await resolve(await seedCustomer('c-1'))).toBe(ptId);
    });

    it('returns null when the counterparty has no main contract id', async () => {
        await seedPriceType('pt-1');
        expect(await resolve(await seedCustomer(null))).toBeNull();
    });

    it('returns null when the contract has not arrived yet', async () => {
        await seedPriceType('pt-1');
        expect(await resolve(await seedCustomer('missing'))).toBeNull();
    });

    it('ignores an inactive contract', async () => {
        await seedPriceType('pt-1');
        await seedContract('c-1', 'pt-1', false);
        expect(await resolve(await seedCustomer('c-1'))).toBeNull();
    });

    it('returns null when the contract price type has not arrived', async () => {
        await seedContract('c-1', 'pt-unknown');
        expect(await resolve(await seedCustomer('c-1'))).toBeNull();
    });

    it('ignores an inactive price type', async () => {
        await seedPriceType('pt-1', false);
        await seedContract('c-1', 'pt-1');
        expect(await resolve(await seedCustomer('c-1'))).toBeNull();
    });

    it('keeps two counterparties isolated', async () => {
        const pt1 = await seedPriceType('pt-1');
        const pt2 = await seedPriceType('pt-2');
        await seedContract('c-1', 'pt-1');
        await seedContract('c-2', 'pt-2');
        const a = await seedCustomer('c-1');
        const b = await seedCustomer('c-2');
        expect(await resolve(a)).toBe(pt1);
        expect(await resolve(b)).toBe(pt2);
    });
});
