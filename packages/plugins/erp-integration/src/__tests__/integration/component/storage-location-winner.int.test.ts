import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, EntityManager, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { StorageLocationStreamHandler } from '../../../handlers/storage-location.handler';
import { MissingDependencyError } from '../../../types';

// Real Postgres: the winner election is an ORDER BY over persisted rows under a per-product
// advisory lock, which a mock cannot prove. Hand-rolled tables (VendureEntity needs bootstrap),
// same shim shape as reserve-order.concurrency.test.ts.
@Entity('StorageLocationAssignment')
class TestAssignment {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar', unique: true }) entityId!: string;
    @Column({ type: 'varchar' }) productId!: string;
    @Column({ type: 'varchar' }) organizationErpId!: string;
    @Column({ type: 'int', default: 0 }) priority!: number;
}

let dataSource: DataSource;
let handler: StorageLocationStreamHandler;
let updates = 0;
const ORGANIZATION_IDS: Record<string, number> = { 'org-a': 1, 'org-b': 2, 'org-c': 3 };

const { schema, extra } = testSchemaOptions('erp_storage_location_winner');
const ctx = {} as RequestContext;

const withManager = (c: RequestContext, manager: EntityManager): RequestContext =>
    ({ ...c, __manager: manager }) as unknown as RequestContext;

const apply = (entityId: string, org: string | null, priority: number, extraFields = {}) =>
    handler.apply(ctx, entityId, {
        productId: 'product-1',
        ...(org ? { organizationId: org } : {}),
        priority,
        ...extraFields,
    });

async function variant(): Promise<{ org: number | null; source: string | null }> {
    const [row] = await dataSource.query(
        `SELECT "customFieldsOrganizationid" AS org, "customFieldsOrganizationsourceentityid" AS source FROM product_variant`,
    );
    return { org: row.org, source: row.source };
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestAssignment],
        synchronize: true,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar)`,
    );
    await dataSource.query(`CREATE TABLE product_variant (
        id serial PRIMARY KEY, "productId" int, "customFieldsOrganizationid" int,
        "customFieldsOrganizationpriority" int, "customFieldsOrganizationsourceentityid" varchar)`);

    const connection = {
        rawConnection: dataSource,
        getRepository: (c: RequestContext, entity: { name: string } | string) => {
            const manager = (c as unknown as { __manager?: EntityManager }).__manager;
            if (typeof entity === 'string') {
                return { query: (sql: string, params?: unknown[]) => manager!.query(sql, params) };
            }
            return (manager ?? dataSource).getRepository(TestAssignment);
        },
        withTransaction: async (c: RequestContext, work: (t: RequestContext) => Promise<unknown>) =>
            dataSource.transaction(manager => work(withManager(c, manager))),
    } as unknown as TransactionalConnection;
    const productVariantService = {
        update: async (
            c: RequestContext,
            [input]: Array<{ id: string; customFields: Record<string, unknown> }>,
        ) => {
            updates += 1;
            const manager = (c as unknown as { __manager: EntityManager }).__manager;
            const f = input.customFields;
            await manager.query(
                `UPDATE product_variant SET "customFieldsOrganizationid" = $1,
                 "customFieldsOrganizationpriority" = $2, "customFieldsOrganizationsourceentityid" = $3
                 WHERE id = $4`,
                [f.organizationId, f.organizationPriority, f.organizationSourceEntityId, input.id],
            );
        },
    };
    const documentsService = {
        findRequisitesIdByErpId: async (_c: RequestContext, erpId: string) =>
            ORGANIZATION_IDS[erpId] ?? null,
    };
    handler = new StorageLocationStreamHandler(
        connection,
        productVariantService as never,
        documentsService as never,
    );
});

beforeEach(async () => {
    updates = 0;
    await dataSource.query(
        `TRUNCATE "StorageLocationAssignment", product, product_variant RESTART IDENTITY`,
    );
    await dataSource.query(`INSERT INTO product ("customFieldsExternalid") VALUES ('product-1')`);
    await dataSource.query(`INSERT INTO product_variant ("productId") VALUES (1)`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('StorageLocationStreamHandler winner election (real Postgres)', () => {
    it('picks the lowest priority whichever row arrives first', async () => {
        await apply('loc-b', 'org-b', 5);
        await apply('loc-a', 'org-a', 1);
        expect(await variant()).toEqual({ org: 1, source: 'loc-a' });

        await apply('loc-c', 'org-c', 9);
        expect(await variant()).toEqual({ org: 1, source: 'loc-a' });
    });

    it('breaks an equal priority by the lower entityId', async () => {
        await apply('loc-b', 'org-b', 1);
        await apply('loc-a', 'org-a', 1);
        expect(await variant()).toEqual({ org: 1, source: 'loc-a' });
    });

    it('re-elects the next best row when the winner is deleted', async () => {
        await apply('loc-a', 'org-a', 1);
        await apply('loc-b', 'org-b', 5);

        await apply('loc-a', null, 1, { isDeleted: true });

        expect(await variant()).toEqual({ org: 2, source: 'loc-b' });
    });

    it('re-elects when the winner row loses its organization, and clears when none is left', async () => {
        await apply('loc-a', 'org-a', 1);
        await apply('loc-b', 'org-b', 5);

        await apply('loc-a', null, 1);
        expect(await variant()).toEqual({ org: 2, source: 'loc-b' });

        await apply('loc-b', null, 5, { isDeleted: true });
        expect(await variant()).toEqual({ org: null, source: null });
    });

    it('does nothing for an address-only row that never had an organization', async () => {
        const outcome = await apply('loc-x', null, 1);

        expect(outcome).toMatchObject({ kind: 'noop' });
        expect(updates).toBe(0);
        expect(await dataSource.query(`SELECT 1 FROM "StorageLocationAssignment"`)).toHaveLength(0);
    });

    it('does not rewrite the variant when the winner is unchanged', async () => {
        await apply('loc-a', 'org-a', 1);
        await apply('loc-a', 'org-a', 1);
        await apply('loc-b', 'org-b', 5);

        expect(updates).toBe(1);
    });

    it('rolls the assignment back when the variant does not exist yet, so the retry starts clean', async () => {
        await dataSource.query(`TRUNCATE product_variant`);

        await expect(apply('loc-a', 'org-a', 1)).rejects.toBeInstanceOf(MissingDependencyError);

        expect(await dataSource.query(`SELECT 1 FROM "StorageLocationAssignment"`)).toHaveLength(0);
    });

    it('rolls the assignment back when the organization is not imported yet', async () => {
        await expect(apply('loc-a', 'org-unknown', 1)).rejects.toBeInstanceOf(
            MissingDependencyError,
        );

        expect(await dataSource.query(`SELECT 1 FROM "StorageLocationAssignment"`)).toHaveLength(0);
    });

    it('converges on the best row when several locations of one product are applied concurrently', async () => {
        for (let round = 0; round < 10; round += 1) {
            await dataSource.query(`TRUNCATE "StorageLocationAssignment" RESTART IDENTITY`);
            await dataSource.query(`UPDATE product_variant SET "customFieldsOrganizationid" = NULL,
                "customFieldsOrganizationpriority" = NULL, "customFieldsOrganizationsourceentityid" = NULL`);

            await Promise.all([
                apply('loc-e', 'org-c', 7),
                apply('loc-d', 'org-b', 3),
                apply('loc-c', 'org-c', 4),
                apply('loc-b', 'org-b', 2),
                apply('loc-a', 'org-a', 1),
                apply('loc-f', 'org-a', 6),
            ]);

            expect(await variant()).toEqual({ org: 1, source: 'loc-a' });
        }
    });

    it('converges when the winner is deleted while a better row arrives', async () => {
        await apply('loc-b', 'org-b', 5);
        await apply('loc-c', 'org-c', 8);

        await Promise.all([
            apply('loc-b', null, 5, { isDeleted: true }),
            apply('loc-a', 'org-a', 1),
        ]);

        expect(await variant()).toEqual({ org: 1, source: 'loc-a' });
    });
});
