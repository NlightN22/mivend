import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { StockOrganizationStreamHandler } from '../../../handlers/stock-organization.handler';
import { StockOrganizationReadService } from '../../../stock-organization-read.service';

// Real Postgres: the unique key and the per-entity advisory lock cannot be proven with a mock.
@Entity('StockOrganization')
@Unique(['productId', 'organizationErpId'])
class TestStockOrganization {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) entityId!: string;
    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'varchar' }) organizationErpId!: string;
    @Column({ type: 'double precision', default: 0 }) quantity!: number;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

let dataSource: DataSource;
let handler: StockOrganizationStreamHandler;
let reader: StockOrganizationReadService;
const markForProducts = vi.fn(async (_ctx: RequestContext, _ids: string[]) => 0);

const { schema, extra } = testSchemaOptions('erp_stock_organization');
const ctx = {} as RequestContext;

const withManager = (c: RequestContext, manager: EntityManager): RequestContext =>
    ({ ...c, __manager: manager }) as unknown as RequestContext;

const apply = (entityId: string, fields: Record<string, unknown>) =>
    handler.apply(ctx, entityId, { productId: 'p-1', organizationId: 'o-1', ...fields });

const rows = (): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(
        `SELECT "entityId", "productId", "organizationErpId", quantity, "isActive"
         FROM "StockOrganization" ORDER BY "productId", "organizationErpId"`,
    );

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestStockOrganization],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = {
        rawConnection: dataSource,
        getRepository: (c: RequestContext, entity: unknown) => {
            const manager = (c as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            return (manager ?? dataSource).getRepository(TestStockOrganization);
        },
        withTransaction: async (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager => work(withManager(c, manager))),
    } as unknown as TransactionalConnection;
    handler = new StockOrganizationStreamHandler(connection, { markForProducts } as never);
    reader = new StockOrganizationReadService(connection);
});

beforeEach(async () => {
    markForProducts.mockReset();
    markForProducts.mockResolvedValue(0);
    await dataSource.query(`TRUNCATE "StockOrganization" RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('StockOrganization (real Postgres)', () => {
    it('replaying the same event leaves one identical row', async () => {
        await apply('e-1', { quantity: 5 });
        await apply('e-1', { quantity: 5 });

        expect(await rows()).toEqual([
            {
                entityId: 'e-1',
                productId: 'p-1',
                organizationErpId: 'o-1',
                quantity: 5,
                isActive: true,
            },
        ]);
    });

    it('a later event overwrites quantity, and a tombstone removes the row', async () => {
        await apply('e-1', { quantity: 5 });
        await apply('e-1', { quantity: 2 });
        expect((await rows())[0]).toMatchObject({ quantity: 2 });

        await apply('e-1', { isDeleted: true });
        expect(await rows()).toHaveLength(0);
    });

    it('a tombstone whose marking failed keeps the row, so the retry still marks', async () => {
        await apply('e-1', { quantity: 5 });
        markForProducts.mockRejectedValueOnce(new Error('mark failed'));

        await expect(apply('e-1', { isDeleted: true })).rejects.toThrow('mark failed');
        expect(await rows()).toHaveLength(1);

        markForProducts.mockClear();
        expect(await apply('e-1', { isDeleted: true })).toMatchObject({ kind: 'applied' });
        expect(await rows()).toHaveLength(0);
        expect(markForProducts).toHaveBeenCalledWith(expect.anything(), ['p-1']);
    });

    it('a tombstone for an entity id shared by two rows removes both and marks both products', async () => {
        await apply('e-1', { productId: 'p-1', quantity: 1 });
        await apply('e-1', { productId: 'p-2', quantity: 2 });
        expect(await rows()).toHaveLength(2);

        await apply('e-1', { isDeleted: true });

        expect(await rows()).toHaveLength(0);
        expect(markForProducts).toHaveBeenLastCalledWith(expect.anything(), ['p-1', 'p-2']);
    });

    it('concurrent updates of one key converge on a single row', async () => {
        await Promise.all([1, 2, 3, 4, 5, 6].map(quantity => apply('e-1', { quantity })));

        const result = await rows();
        expect(result).toHaveLength(1);
        expect([1, 2, 3, 4, 5, 6]).toContain(result[0].quantity);
    });

    it('read service sums per organization, keeps negatives, skips inactive and other products', async () => {
        await apply('e-1', { productId: 'p-1', organizationId: 'o-1', quantity: 10 });
        await apply('e-2', { productId: 'p-2', organizationId: 'o-1', quantity: -4 });
        await apply('e-3', {
            productId: 'p-1',
            organizationId: 'o-2',
            quantity: 7,
            isActive: false,
        });
        await apply('e-4', { productId: 'p-3', organizationId: 'o-1', quantity: 99 });

        const stock = await reader.getOrganizationStock(ctx, ['p-1', 'p-2']);

        expect([...stock.entries()]).toEqual([['o-1', 6]]);
        expect((await reader.getOrganizationStock(ctx, [])).size).toBe(0);
    });
});
