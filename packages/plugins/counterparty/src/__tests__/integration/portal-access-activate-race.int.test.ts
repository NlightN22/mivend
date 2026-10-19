import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyPortalAccessService } from '../../counterparty-portal-access.service';
import { Counterparty } from '../../entities/counterparty.entity';

const { schema, extra } = testSchemaOptions('portal_access_race');
const counterparty = {
    id: '1',
    isActive: true,
    phone: '+10000000000',
    officialEmail: 'office@example.com',
    fullName: 'Counterparty One',
};
let dataSource: DataSource;
let service: CounterpartyPortalAccessService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE customer (id serial PRIMARY KEY,
        "customFieldsCounterpartyid" varchar, "deletedAt" timestamp)`);
    const base = createTestConnection(dataSource);
    const connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: RequestContext, entity: unknown) =>
            entity === Counterparty
                ? { findOne: async () => counterparty }
                : base.getRepository(ctx, entity as never),
    } as unknown as TransactionalConnection;
    // Slow create widens the check-then-create window the lock must close.
    const customerService = {
        create: async (ctx: { em: DataSource['manager'] }) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            const rows: Array<{ id: number }> = await ctx.em.query(
                `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
                [counterparty.id],
            );
            return { id: rows[0].id };
        },
    };
    service = new CounterpartyPortalAccessService(
        connection,
        customerService as never,
        {
            assertCounterpartyWritable: async () => undefined,
        } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE customer');
});

describe('CounterpartyPortalAccessService.activate (real Postgres)', () => {
    it('links exactly one customer when two activations race', async () => {
        const results = await Promise.allSettled([
            service.activate({} as RequestContext, counterparty.id),
            service.activate({} as RequestContext, counterparty.id),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        const rows: unknown[] = await dataSource.query('SELECT id FROM customer');
        expect(rows).toHaveLength(1);
    });
});
