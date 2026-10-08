import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { variantExistsSql } from '../../variant-exists-sql';

// Real SQL over hand-rolled product/product_variant tables with Vendure's physical column names.
const { schema, extra } = testSchemaOptions('variant_exists_sql');
let dataSource: DataSource;

const run = (sql: string, params: unknown[] = []): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(sql, params);

async function addProduct(
    variants: Array<{ organizationId: number | null; enabled?: boolean; deleted?: boolean }>,
): Promise<number> {
    const [product] = await run(`INSERT INTO product DEFAULT VALUES RETURNING id`);
    for (const v of variants) {
        await run(
            `INSERT INTO product_variant ("productId", enabled, "deletedAt", "customFieldsOrganizationid")
             VALUES ($1, $2, $3, $4)`,
            [product.id, v.enabled ?? true, v.deleted ? new Date() : null, v.organizationId],
        );
    }
    return Number(product.id);
}

const visibleIds = async (requireOrganization: boolean): Promise<number[]> =>
    (
        await run(
            `SELECT product.id FROM product WHERE ${variantExistsSql(requireOrganization)} ORDER BY 1`,
        )
    ).map(r => Number(r.id));

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await run(`CREATE TABLE product (id serial PRIMARY KEY)`);
    await run(`CREATE TABLE product_variant (
        id serial PRIMARY KEY, "productId" int, enabled boolean, "deletedAt" timestamp,
        "customFieldsOrganizationid" int)`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('variantExistsSql (real SQL)', () => {
    it('hides products with no organization from the shop view but not from staff', async () => {
        const withOrg = await addProduct([{ organizationId: 7 }]);
        const withoutOrg = await addProduct([{ organizationId: null }]);
        const orgOnDeletedVariant = await addProduct([
            { organizationId: 7, deleted: true },
            { organizationId: null },
        ]);
        const orgOnDisabledVariant = await addProduct([{ organizationId: 7, enabled: false }]);

        expect(await visibleIds(true)).toEqual([withOrg]);
        expect(await visibleIds(false)).toEqual([withOrg, withoutOrg, orgOnDeletedVariant]);
        expect(await visibleIds(false)).not.toContain(orgOnDisabledVariant);
    });
});
