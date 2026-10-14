import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { OrderStatusHistoryService } from '@mivend/plugin-erp-order';

// Plain stand-in for the VendureEntity-based OrderStatusHistoryEntry (needs a bootstrapped id
// strategy), same table shape; see saved-views' integration test for the approach.
@Entity('order_status_history_entry')
@Index(['orderId', 'id'])
class TestHistoryEntry {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'uuid' }) uuid!: string;
    @Column({ type: 'int' }) orderId!: number;
    @Column({ type: 'varchar', nullable: true }) previousStatus!: string | null;
    @Column({ type: 'varchar' }) status!: string;
}

const { schema, extra } = testSchemaOptions('order_status_history');
let dataSource: DataSource;
let service: OrderStatusHistoryService;
const ctx = {} as unknown as RequestContext;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestHistoryEntry],
        synchronize: true,
    });
    await dataSource.initialize();

    // Each withTransaction runs on its own real transaction, so concurrent writers really contend.
    const connection = {
        withTransaction: (c: RequestContext, work: (tx: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager => work({ ...c, manager } as unknown as RequestContext)),
        getRepository: (c: { manager?: DataSource['manager'] }, _entity: unknown) =>
            (c.manager ?? dataSource.manager).getRepository(TestHistoryEntry),
    } as unknown as TransactionalConnection;
    service = new OrderStatusHistoryService(connection);
});

beforeEach(async () => {
    await dataSource.getRepository(TestHistoryEntry).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const rows = (orderId: number): Promise<TestHistoryEntry[]> =>
    dataSource.getRepository(TestHistoryEntry).find({ where: { orderId }, order: { id: 'ASC' } });

describe('OrderStatusHistoryService.record', () => {
    it('chains previous status and skips a repeat of the latest status', async () => {
        await service.record(ctx, 1, 'PENDING');
        await service.record(ctx, 1, 'PENDING');
        await service.record(ctx, 1, 'SENT_TO_ERP');
        const history = await rows(1);
        expect(history.map(r => [r.previousStatus, r.status])).toEqual([
            [null, 'PENDING'],
            ['PENDING', 'SENT_TO_ERP'],
        ]);
        expect(history[0].uuid).not.toBe(history[1].uuid);
    });

    it('keeps orders apart', async () => {
        await service.record(ctx, 1, 'PENDING');
        await service.record(ctx, 2, 'PENDING');
        expect(await rows(1)).toHaveLength(1);
        expect(await rows(2)).toHaveLength(1);
    });

    it('concurrent reports of the same status leave exactly one row', async () => {
        await Promise.all(Array.from({ length: 8 }, () => service.record(ctx, 7, 'CONFIRMED')));
        expect(await rows(7)).toHaveLength(1);
    });

    it('concurrent different statuses form an unbroken chain', async () => {
        await Promise.all(['A', 'B', 'C', 'D'].map(s => service.record(ctx, 9, s)));
        const history = await rows(9);
        expect(history).toHaveLength(4);
        history.forEach((r, i) =>
            expect(r.previousStatus).toBe(i === 0 ? null : history[i - 1].status),
        );
    });
});
