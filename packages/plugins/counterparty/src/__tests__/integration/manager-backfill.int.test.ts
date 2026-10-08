import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyService } from '../../counterparty.service';

// Hand-rolled table with only the columns the back-fill touches (real Postgres, no DB mocking).
@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', nullable: true }) managerErpId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assignedManagerId!: string | null;
}

const { schema, extra } = testSchemaOptions('manager_backfill');
let dataSource: DataSource;
let service: CounterpartyService;
const ctx = {} as RequestContext;

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
    // The service updates the real Counterparty entity; point that at the hand-rolled table.
    const repo = dataSource.getRepository(TestCounterparty);
    const connection = {
        getRepository: () => ({
            createQueryBuilder: () => {
                const qb = repo.createQueryBuilder();
                const update = qb.update.bind(qb);
                qb.update = (() => update(TestCounterparty)) as typeof qb.update;
                return qb;
            },
        }),
    } as unknown as TransactionalConnection;
    service = new CounterpartyService(connection, {} as never, {} as never, {} as never);
});

beforeEach(async () => {
    await dataSource.getRepository(TestCounterparty).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const add = async (
    managerErpId: string | null,
    assignedManagerId: string | null,
): Promise<number> =>
    (await dataSource.getRepository(TestCounterparty).save({ managerErpId, assignedManagerId })).id;

const assigned = async (id: number): Promise<string | null> =>
    (await dataSource.getRepository(TestCounterparty).findOneByOrFail({ id })).assignedManagerId;

describe('CounterpartyService.backfillAssignedManager (real Postgres)', () => {
    it('assigns the administrator to every waiting counterparty of that ERP user, and only those', async () => {
        const waiting = await add('user-1', null);
        const waiting2 = await add('user-1', null);
        const other = await add('user-2', null);

        expect(await service.backfillAssignedManager(ctx, 'user-1', 42)).toBe(2);

        expect(await assigned(waiting)).toBe('42');
        expect(await assigned(waiting2)).toBe('42');
        expect(await assigned(other)).toBeNull();
    });

    it('never overwrites a manager that was assigned manually, and is idempotent', async () => {
        const manual = await add('user-1', '7');
        const waiting = await add('user-1', null);

        expect(await service.backfillAssignedManager(ctx, 'user-1', 42)).toBe(1);
        expect(await service.backfillAssignedManager(ctx, 'user-1', 42)).toBe(0);

        expect(await assigned(manual)).toBe('7');
        expect(await assigned(waiting)).toBe('42');
    });

    it('two concurrent back-fills for different administrators assign exactly one (no lost update)', async () => {
        const id = await add('user-1', null);

        await Promise.all([
            service.backfillAssignedManager(ctx, 'user-1', 1),
            service.backfillAssignedManager(ctx, 'user-1', 2),
        ]);

        expect(['1', '2']).toContain(await assigned(id));
    });
});
