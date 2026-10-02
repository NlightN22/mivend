import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

// Same "hand-rolled table matching production schema, real Postgres, no DB mocking" convention
// as plugin-counterparty's own contract.service.int.test.ts — VendureEntity's primary column
// needs a real bootstrap()ped EntityIdStrategy, unavailable against a standalone DataSource.
@Entity('retro_bonus_rule')
@Index(['erpId'], { unique: true })
class TestRetroBonusRule {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar' }) productErpId!: string;
    @Column({ type: 'varchar' }) counterpartyErpId!: string;
    @Column({ type: 'varchar', nullable: true }) recipientContractErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) priceTypeErpId!: string | null;
    @Column({ type: 'boolean', default: false }) isInstant!: boolean;
    @Column({ type: 'varchar', nullable: true }) accrualPeriod!: string | null;
    @Column({ type: 'int', default: 0 }) accrualDayNumber!: number;
    @Column({ type: 'varchar' }) accrualKind!: string;
    @Column({ type: 'double precision' }) percent!: number;
    @Column({ type: 'double precision', nullable: true }) limitAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionAmount!: number | null;
    @Column({ type: 'double precision', nullable: true }) conditionQuantity!: number | null;
    @Column({ type: 'timestamp' }) validFrom!: Date;
    @Column({ type: 'timestamp', nullable: true }) validTo!: Date | null;
    @Column({ type: 'varchar' }) sourceVersion!: string;
}

let dataSource: DataSource;

const { schema, extra } = testSchemaOptions('retro_bonus_rule');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRetroBonusRule],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestRetroBonusRule).clear();
});

const baseFields = {
    productErpId: 'prod-1',
    counterpartyErpId: 'cp-1',
    recipientContractErpId: null,
    priceTypeErpId: null,
    isInstant: false,
    accrualPeriod: null,
    accrualDayNumber: 0,
    accrualKind: 'ПоПродажам',
    percent: 5,
    limitAmount: null,
    conditionAmount: null,
    conditionQuantity: null,
    validFrom: new Date('2026-01-01T00:00:00Z'),
    validTo: null,
    sourceVersion: '1',
};

describe('RetroBonusRule erpId unique constraint (real Postgres)', () => {
    it('allows a single row for a given erpId', async () => {
        await dataSource.getRepository(TestRetroBonusRule).save({ erpId: 'rbr-1', ...baseFields });

        const rows = await dataSource.getRepository(TestRetroBonusRule).find();
        expect(rows).toHaveLength(1);
    });

    it('rejects a second row with the same erpId', async () => {
        await dataSource.getRepository(TestRetroBonusRule).save({ erpId: 'rbr-1', ...baseFields });

        await expect(
            dataSource.getRepository(TestRetroBonusRule).insert({ erpId: 'rbr-1', ...baseFields }),
        ).rejects.toThrow();
    });

    it('allows two different erpIds for the same counterparty/product', async () => {
        await dataSource.getRepository(TestRetroBonusRule).save({ erpId: 'rbr-1', ...baseFields });
        await dataSource.getRepository(TestRetroBonusRule).save({ erpId: 'rbr-2', ...baseFields });

        const rows = await dataSource.getRepository(TestRetroBonusRule).find();
        expect(rows).toHaveLength(2);
    });
});
