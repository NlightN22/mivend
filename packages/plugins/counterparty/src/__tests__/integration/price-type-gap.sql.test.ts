import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { PORTAL_COUNTERPARTY_SQL, UNRESOLVED_PRICE_TYPE_SQL } from '../../price-type-gap.service';

@Entity('customer')
class TestCustomer {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar', nullable: true }) customFieldsCounterpartyid!: string | null;
}

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'varchar' }) shortName!: string;
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

const { schema, extra } = testSchemaOptions('price_type_gap');
let dataSource: DataSource;
const entities = [TestCustomer, TestCounterparty, TestContract, TestPriceType];

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities,
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    for (const entity of entities) await dataSource.getRepository(entity).clear();
});

async function seed(name: string, mainContractId: string | null, portal = true): Promise<void> {
    const cp = await dataSource
        .getRepository(TestCounterparty)
        .save({ shortName: name, mainContractId });
    if (portal) {
        await dataSource.getRepository(TestCustomer).save({ customFieldsCounterpartyid: cp.id });
    }
}

async function gaps(): Promise<string[]> {
    const rows: Array<{ shortName: string }> = await dataSource.query(
        `SELECT c."shortName" FROM counterparty c WHERE ${PORTAL_COUNTERPARTY_SQL} AND ${UNRESOLVED_PRICE_TYPE_SQL} ORDER BY c."shortName"`,
    );
    return rows.map(r => r.shortName);
}

describe('price type gap predicate', () => {
    it('lists portal counterparties whose main contract chain is broken', async () => {
        await dataSource
            .getRepository(TestPriceType)
            .save([{ externalId: 'pt-ok' }, { externalId: 'pt-off', isActive: false }]);
        await dataSource.getRepository(TestContract).save([
            { erpId: 'k-ok', priceTypeId: 'pt-ok' },
            { erpId: 'k-off', priceTypeId: 'pt-ok', isActive: false },
            { erpId: 'k-pt-off', priceTypeId: 'pt-off' },
            { erpId: 'k-pt-unknown', priceTypeId: 'pt-unknown' },
        ]);
        await seed('resolved', 'k-ok');
        await seed('no-contract-id', null);
        await seed('missing-contract', 'k-missing');
        await seed('inactive-contract', 'k-off');
        await seed('inactive-price-type', 'k-pt-off');
        await seed('unknown-price-type', 'k-pt-unknown');
        expect(await gaps()).toEqual([
            'inactive-contract',
            'inactive-price-type',
            'missing-contract',
            'no-contract-id',
            'unknown-price-type',
        ]);
    });

    it('skips counterparties without a portal customer', async () => {
        await seed('no-portal', null, false);
        expect(await gaps()).toEqual([]);
    });
});
