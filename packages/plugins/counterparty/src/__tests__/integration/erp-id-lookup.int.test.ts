import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { Contract } from '../../entities/contract.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { ErpIdLookupService } from '../../erp-id-lookup.service';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
}

@Entity('contract')
class TestContract {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
}

const { schema, extra } = testSchemaOptions('erp_id_lookup');
const counter = { count: 0 };
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: ErpIdLookupService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestContract],
        synchronize: true,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    for (let i = 1; i <= 30; i++) {
        await dataSource.getRepository(TestCounterparty).save({ erpId: `cp-${i}` });
        await dataSource.getRepository(TestContract).save({ erpId: `ct-${i}` });
    }
    service = new ErpIdLookupService({
        getRepository: (_c: unknown, entity: unknown) =>
            dataSource.getRepository(entity === Counterparty ? TestCounterparty : TestContract),
    } as unknown as TransactionalConnection);
    void Contract;
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

describe('ErpIdLookupService (integration, real Postgres)', () => {
    it('maps found ids, leaves unknown ones out and runs one query for 25 ids', async () => {
        const erpIds = [
            ...Array.from({ length: 25 }, (_, i) => `cp-${i + 1}`),
            'cp-missing',
            'cp-1',
        ];
        counter.count = 0;
        const found = await service.counterpartyIds(ctx, erpIds);
        expect(counter.count).toBe(1);
        expect(found.size).toBe(25);
        expect(found.has('cp-missing')).toBe(false);
        const [row] = await dataSource.query('SELECT id FROM counterparty WHERE "erpId" = $1', [
            'cp-7',
        ]);
        expect(found.get('cp-7')).toBe(String(row.id));
    });

    it('resolves contracts the same way and skips the query for no ids', async () => {
        const found = await service.contractIds(ctx, ['ct-3', 'nope']);
        expect([...found.keys()]).toEqual(['ct-3']);
        counter.count = 0;
        expect((await service.contractIds(ctx, [])).size).toBe(0);
        expect(counter.count).toBe(0);
    });
});
