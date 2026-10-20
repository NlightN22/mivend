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
import { getInnStatus } from '../../counterparty-inn-guard';
import { Counterparty } from '../../entities/counterparty.entity';

const { schema, extra } = testSchemaOptions('portal_access_inn');
const base = { isActive: true, phone: '+10000000000', fullName: 'Twin' };
const rows: Record<string, Record<string, unknown>> = {
    '1': {
        ...base,
        id: '1',
        erpId: 'erp-1',
        shortName: 'One',
        inn: '77 000-00001',
        officialEmail: 'a@example.com',
    },
    '2': {
        ...base,
        id: '2',
        erpId: 'erp-2',
        shortName: 'Two',
        inn: '7700000001',
        officialEmail: 'b@example.com',
    },
    '3': {
        ...base,
        id: '3',
        erpId: 'erp-3',
        shortName: 'Three',
        inn: '7700000003',
        officialEmail: 'c@example.com',
    },
};
let dataSource: DataSource;
let service: CounterpartyPortalAccessService;
const ctx = {} as RequestContext;

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
    await dataSource.query(`CREATE TABLE counterparty (id int PRIMARY KEY, "erpId" varchar,
        "shortName" varchar, inn varchar, "isActive" boolean)`);
    const db = createTestConnection(dataSource);
    const connection = {
        withTransaction: db.withTransaction.bind(db),
        getRepository: (c: RequestContext, entity: unknown) =>
            entity === Counterparty
                ? { findOne: async ({ where }: { where: { id: string } }) => rows[where.id] }
                : db.getRepository(c, entity as never),
    } as unknown as TransactionalConnection;
    const customerService = {
        create: async (
            c: { em: DataSource['manager'] },
            input: { customFields: { counterpartyId: string } },
        ) => {
            await new Promise(resolve => setTimeout(resolve, 100));
            const out: Array<{ id: number }> = await c.em.query(
                `INSERT INTO customer ("customFieldsCounterpartyid") VALUES ($1) RETURNING id`,
                [input.customFields.counterpartyId],
            );
            return { id: out[0].id };
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
    await dataSource.query('TRUNCATE counterparty');
    for (const r of Object.values(rows)) {
        await dataSource.query(
            `INSERT INTO counterparty (id, "erpId", "shortName", inn, "isActive") VALUES ($1,$2,$3,$4,$5)`,
            [r.id, r.erpId, r.shortName, r.inn, r.isActive],
        );
    }
});

describe('portal access INN guard (real Postgres)', () => {
    it('lets only one of two concurrently activated duplicates through', async () => {
        const results = await Promise.allSettled([
            service.activate(ctx, '1'),
            service.activate(ctx, '2'),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
        expect(await dataSource.query('SELECT id FROM customer')).toHaveLength(1);
    });

    it('returns a per-row error for the duplicate in a bulk toggle', async () => {
        const results = await service.applyBatch(ctx, [
            { counterpartyId: '1', action: 'activate' },
            { counterpartyId: '2', action: 'activate' },
            { counterpartyId: '3', action: 'activate' },
        ]);
        expect(results.map(r => r.success)).toEqual([true, false, true]);
        expect(results[1].error).toMatch(/merge the duplicates in the ERP/);
    });

    it('ignores a duplicate that is inactive or whose Customer was deactivated', async () => {
        await dataSource.query(`UPDATE counterparty SET "isActive" = false WHERE id = 2`);
        await dataSource.query(`INSERT INTO customer ("customFieldsCounterpartyid") VALUES ('2')`);
        await expect(service.activate(ctx, '1')).resolves.toBeDefined();
        await dataSource.query('TRUNCATE customer');
        await dataSource.query(`UPDATE counterparty SET "isActive" = true WHERE id = 2`);
        await dataSource.query(
            `INSERT INTO customer ("customFieldsCounterpartyid", "deletedAt") VALUES ('2', now())`,
        );
        await expect(service.activate(ctx, '1')).resolves.toBeDefined();
    });
});

describe('getInnStatus (real Postgres)', () => {
    it('reports ok, duplicate and missing, treating a null inn as missing', async () => {
        const connection = createTestConnection(dataSource) as never;
        await dataSource.query(
            `INSERT INTO counterparty (id, "erpId", "shortName", inn, "isActive") VALUES (4,'erp-4','Four',NULL,true)`,
        );
        expect(
            await getInnStatus(connection, ctx, {
                id: '1',
                inn: '77 000-00001',
                isActive: true,
            } as never),
        ).toBe('duplicate');
        expect(
            await getInnStatus(connection, ctx, {
                id: '1',
                inn: '77 000-00001',
                isActive: false,
            } as never),
        ).toBe('ok');
        expect(
            await getInnStatus(connection, ctx, {
                id: '3',
                inn: '7700000003',
                isActive: true,
            } as never),
        ).toBe('ok');
        expect(
            await getInnStatus(connection, ctx, { id: '4', inn: null, isActive: true } as never),
        ).toBe('missing');
    });
});
