import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';
import { Counterparty } from '../../entities/counterparty.entity';

// VendureEntity's primary column needs a bootstrapped EntityIdStrategy; a bare DataSource has none.
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) erpId!: string;
    @Column({ type: 'varchar' }) legalName!: string;
    @Column({ type: 'varchar' }) shortName!: string;
    @Column({ type: 'varchar', nullable: true }) inn!: string | null;
    @Column({ type: 'varchar', nullable: true }) erpGroupLabel!: string | null;
    @Column({ type: 'varchar', nullable: true }) departmentId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) legalAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) factualAddress!: string | null;
    @Column({ type: 'varchar', nullable: true }) phone!: string | null;
    @Column({ type: 'varchar', nullable: true }) officialEmail!: string | null;
    @Column({ type: 'int', default: 0 }) creditLimit!: number;
    @Column({ type: 'int', default: 0 }) creditBalance!: number;
    @Column({ type: 'int', default: 0 }) paymentDelayDays!: number;
    @Column({ type: 'varchar', default: 'retail' }) priceType!: string;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

function mapCounterparty(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                entity === Counterparty ? (TestCounterparty as never) : (entity as never),
            ),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('counterparty_upsert_race');
let dataSource: DataSource;
let service: CounterpartyService;
const published: string[] = [];
const ctx = testRequestContext;

const payload = (legalName: string) => ({
    erpId: 'cp-erp-1',
    legalName,
    shortName: legalName,
    creditLimit: 0,
    creditBalance: 0,
    paymentDelayDays: 0,
    priceType: 'retail',
    isActive: true,
});

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new CounterpartyService(
        mapCounterparty(createTestConnection(dataSource)),
        {} as never,
        {} as never,
        {} as never,
        { publish: (e: { erpId: string }) => published.push(e.erpId) } as never,
    );
});

afterEach(async () => {
    published.length = 0;
    await dataSource.getRepository(TestCounterparty).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('CounterpartyService upsert concurrency (integration, real Postgres)', () => {
    it('parallel upserts of a new erpId insert one row, publish created once and do not fail', async () => {
        await Promise.all([service.upsert(ctx, payload('A')), service.upsert(ctx, payload('B'))]);

        expect(await dataSource.getRepository(TestCounterparty).count()).toBe(1);
        expect(published).toEqual(['cp-erp-1']);
    });

    it('parallel upsertActiveState calls for a new erpId insert one row', async () => {
        const results = await Promise.all([
            service.upsertActiveState(ctx, 'cp-erp-2', { name: 'A', isActive: true }),
            service.upsertActiveState(ctx, 'cp-erp-2', { name: 'B', isActive: true }),
        ]);

        expect(results).toEqual([true, true]);
        expect(
            await dataSource.getRepository(TestCounterparty).countBy({ erpId: 'cp-erp-2' }),
        ).toBe(1);
    });
});
