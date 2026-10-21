import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import type {
    BeforeContractProformaDelete,
    ContractProformaPurgeService,
} from '@mivend/plugin-acquiring';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';
import { ContractProformaCleanupService } from '../../contract-proforma-cleanup.service';

@Entity('document')
class TestDocument {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) type!: string;
    @Column({ type: 'varchar', nullable: true }) proformaInvoiceId!: string | null;
    @Column({ type: 'varchar', nullable: true }) assetId!: string | null;
}

@Entity('proforma_invoice')
class TestProforma {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'boolean' }) expired!: boolean;
}

type Manager = { __manager?: EntityManager };
let dataSource: DataSource;
const ctx = {} as RequestContext;
const assetDelete = vi.fn();
let failAfterHook = false;
const deleteSeenRowsAtCall: number[] = [];

const { schema, extra } = testSchemaOptions('contract_proforma_cleanup');

// Stands in for the acquiring purge (tested on its own) with the same transaction contract.
const purge = {
    purgeBatch: (
        c: RequestContext,
        _months: number,
        limit: number,
        beforeDelete: BeforeContractProformaDelete,
    ): Promise<number> =>
        dataSource.transaction(async manager => {
            const rows = await manager.getRepository(TestProforma).find({
                where: { expired: true },
                order: { id: 'ASC' },
                take: limit,
            });
            const ids = rows.map(r => r.id);
            if (ids.length === 0) return 0;
            await beforeDelete({ ...c, __manager: manager } as unknown as RequestContext, ids);
            if (failAfterHook) throw new Error('boom');
            await manager.getRepository(TestProforma).delete(ids);
            return ids.length;
        }),
} as unknown as ContractProformaPurgeService;

const connection = {
    getRepository: (c: RequestContext) =>
        ((c as unknown as Manager).__manager ?? dataSource).getRepository(TestDocument),
} as unknown as TransactionalConnection;

const service = new ContractProformaCleanupService(connection, purge, {
    delete: async (...args: unknown[]) => {
        deleteSeenRowsAtCall.push(await dataSource.getRepository(TestDocument).count());
        return assetDelete(...args);
    },
} as never);

async function seed(expired: boolean, assetId: string): Promise<number> {
    const p = await dataSource.getRepository(TestProforma).save({ expired });
    await dataSource
        .getRepository(TestDocument)
        .save({ type: 'proforma-invoice', proformaInvoiceId: String(p.id), assetId });
    return p.id;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestDocument, TestProforma],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TestDocument).clear();
    await dataSource.getRepository(TestProforma).clear();
    assetDelete.mockReset();
    failAfterHook = false;
    deleteSeenRowsAtCall.length = 0;
});

describe('ContractProformaCleanupService (integration, real Postgres)', () => {
    it('deletes documents of purged proformas across batches, keeps others, assets after commit', async () => {
        await seed(true, 'a1');
        await seed(true, 'a2');
        await seed(true, 'a3');
        const kept = await seed(false, 'keep');

        const total = await service.run(ctx, 6, 2);

        expect(total).toBe(3);
        const docs = await dataSource.getRepository(TestDocument).find();
        expect(docs.map(d => d.proformaInvoiceId)).toEqual([String(kept)]);
        expect(assetDelete.mock.calls.map(c => c[1])).toEqual([['a1', 'a2'], ['a3']]);
        // 4 rows -> 2 after first commit, 1 after second: deletes happen only post-commit.
        expect(deleteSeenRowsAtCall).toEqual([2, 1]);
    });

    it('a rolled-back batch deletes no asset and no document', async () => {
        await seed(true, 'a1');
        failAfterHook = true;

        await expect(service.run(ctx, 6, 2)).rejects.toThrow('boom');

        expect(assetDelete).not.toHaveBeenCalled();
        expect(await dataSource.getRepository(TestDocument).count()).toBe(1);
        expect(await dataSource.getRepository(TestProforma).count()).toBe(1);
    });

    it('a failed asset delete is logged and the next batch still runs', async () => {
        await seed(true, 'a1');
        await seed(true, 'a2');
        assetDelete.mockRejectedValueOnce(new Error('storage down'));

        const total = await service.run(ctx, 6, 1);

        expect(total).toBe(2);
        expect(assetDelete).toHaveBeenCalledTimes(2);
        expect(await dataSource.getRepository(TestDocument).count()).toBe(0);
    });
});
