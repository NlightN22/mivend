import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContractProformaPurgeService } from '../../contract-proforma-purge.service';

@Entity('proforma_invoice')
class TestProformaInvoice {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'int', nullable: true }) orderId!: number | null;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'timestamptz' }) issuedAt!: Date;
}

let dataSource: DataSource;
let service: ContractProformaPurgeService;
const { schema, extra } = testSchemaOptions('contract_proforma_purge');
const ctx = {} as RequestContext;
type ManagedCtx = { __manager?: EntityManager };

const monthsAgo = (m: number): Date => {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    return d;
};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestProformaInvoice],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        getRepository: (c: ManagedCtx) => {
            const manager = c.__manager ?? dataSource.manager;
            return { query: (sql: string, params?: unknown[]) => manager.query(sql, params) };
        },
        withTransaction: (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager => work({ ...c, __manager: manager } as never)),
    } as unknown as TransactionalConnection;
    service = new ContractProformaPurgeService(connection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE proforma_invoice RESTART IDENTITY');
    await dataSource.getRepository(TestProformaInvoice).save([
        { orderId: null, kind: 'debt-repayment', issuedAt: monthsAgo(7) },
        { orderId: null, kind: 'advance', issuedAt: monthsAgo(13) },
        { orderId: null, kind: 'advance', issuedAt: monthsAgo(5) },
        { orderId: 10, kind: 'order-placed', issuedAt: monthsAgo(24) },
        { orderId: 11, kind: 'by-shipment', issuedAt: monthsAgo(24) },
    ]);
});

const remaining = async (): Promise<number[]> =>
    (await dataSource.getRepository(TestProformaInvoice).find({ order: { id: 'ASC' } })).map(
        r => r.id,
    );

describe('ContractProformaPurgeService (real Postgres)', () => {
    it('deletes old contract proformas, keeps recent ones and never touches order proformas', async () => {
        const seen: number[][] = [];
        const deleted = await service.purgeBatch(ctx, 6, 100, async (_tx, ids) => {
            seen.push(ids);
        });
        expect(deleted).toBe(2);
        expect(seen).toEqual([[1, 2]]);
        expect(await remaining()).toEqual([3, 4, 5]);
    });

    it('is batch-limited and idempotent once nothing is left', async () => {
        const noop = async (): Promise<void> => undefined;
        expect(await service.purgeBatch(ctx, 6, 1, noop)).toBe(1);
        expect(await service.purgeBatch(ctx, 6, 1, noop)).toBe(1);
        expect(await service.purgeBatch(ctx, 6, 1, noop)).toBe(0);
        expect(await remaining()).toEqual([3, 4, 5]);
    });

    it('keeps the proformas when the dependent cleanup fails', async () => {
        await expect(
            service.purgeBatch(ctx, 6, 100, async () => {
                throw new Error('document cleanup failed');
            }),
        ).rejects.toThrow('document cleanup failed');
        expect(await remaining()).toEqual([1, 2, 3, 4, 5]);
    });
});
