import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { Payment, type RequestContext, type TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    queryCountingLogger,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CreditFlagService } from '../../credit-flag.service';

@Entity('payment')
class TestPayment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'varchar' }) state!: string;
    @Column({ type: 'text', nullable: true }) metadata!: string | null;
}

const { schema, extra } = testSchemaOptions('credit_flag_batch');
const counter = { count: 0 };
let dataSource: DataSource;
let service: CreditFlagService;

const flaggedMeta = JSON.stringify({ public: { creditLimitExceeded: 'true' } });
const cleanMeta = JSON.stringify({ public: { creditLimitExceeded: 'false' } });
const request = (): RequestContext => ({}) as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestPayment],
        synchronize: true,
        logger: queryCountingLogger(counter),
    });
    await dataSource.initialize();
    const repo = dataSource.getRepository(TestPayment);
    for (let order = 1; order <= 12; order++) {
        await repo.save({
            orderId: order,
            state: 'Settled',
            metadata: order % 3 === 0 ? flaggedMeta : cleanMeta,
        });
    }
    await repo.save([
        { orderId: 3, state: 'Authorized', metadata: flaggedMeta },
        { orderId: 4, state: 'Declined', metadata: flaggedMeta },
        { orderId: 5, state: 'Created', metadata: null },
    ]);
    const connection = {
        getRepository: (_ctx: unknown, entity: unknown) =>
            dataSource.getRepository(entity === Payment ? TestPayment : (entity as never)),
    } as unknown as TransactionalConnection;
    service = new CreditFlagService(connection, {} as never);
});

afterAll(async () => {
    await dataSource?.destroy();
    await dropTestSchema(schema);
});

const orderIds = Array.from({ length: 14 }, (_, i) => i + 1);

describe('CreditFlagService.isOrderFlagged batching (integration, real Postgres)', () => {
    it('flags exactly the orders with an Authorized or Settled flagged payment, once per order', async () => {
        const ctx = request();
        const flags = await Promise.all(orderIds.map(id => service.isOrderFlagged(ctx, id)));
        expect(orderIds.filter((_, i) => flags[i])).toEqual([3, 6, 9, 12]);
    });

    it('uses one query for 14 orders and for 2 orders', async () => {
        const first = request();
        counter.count = 0;
        await Promise.all(orderIds.map(id => service.isOrderFlagged(first, id)));
        const many = counter.count;
        counter.count = 0;
        const ctx = request();
        await Promise.all([service.isOrderFlagged(ctx, 3), service.isOrderFlagged(ctx, 4)]);
        expect(many).toBe(1);
        expect(counter.count).toBe(1);
    });

    it('does not share a flag across requests', async () => {
        const before = await service.isOrderFlagged(request(), 1);
        await dataSource
            .getRepository(TestPayment)
            .save({ orderId: 1, state: 'Settled', metadata: flaggedMeta });
        expect(before).toBe(false);
        expect(await service.isOrderFlagged(request(), 1)).toBe(true);
    });
});
