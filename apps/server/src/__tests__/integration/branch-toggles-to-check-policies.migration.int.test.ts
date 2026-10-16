import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { BranchTogglesToCheckPolicies1791519000000 } from '../../migrations/1791519000000-branch-toggles-to-check-policies';

const { schema, extra } = testSchemaOptions('branch_toggles_migration');
let dataSource: DataSource;

const rows = (): Promise<Array<Record<string, unknown>>> =>
    dataSource.query(
        `SELECT "checkCode", stage, "branchId", consequence, enabled FROM check_policy
          ORDER BY "checkCode", stage, "branchId" NULLS FIRST`,
    );

async function runUp(): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new BranchTogglesToCheckPolicies1791519000000().up(qr);
    } finally {
        await qr.release();
    }
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(`DROP TABLE IF EXISTS check_policy, branch_settings, global_settings`);
    await dataSource.query(`CREATE TABLE global_settings ("customFieldsDefaultbranchid" varchar)`);
    await dataSource.query(`CREATE TABLE check_policy (
        id serial PRIMARY KEY, uuid uuid NOT NULL, "checkCode" varchar NOT NULL, stage varchar NOT NULL,
        "branchId" varchar, consequence varchar NOT NULL, enabled boolean NOT NULL DEFAULT true)`);
    await dataSource.query(
        `CREATE UNIQUE INDEX ON check_policy ("checkCode", stage) WHERE "branchId" IS NULL`,
    );
    await dataSource.query(
        `CREATE UNIQUE INDEX ON check_policy ("checkCode", stage, "branchId") WHERE "branchId" IS NOT NULL`,
    );
});

describe('branch toggles migration (real Postgres)', () => {
    it('moves the default branch flags to global rows and a differing branch to overrides, then drops the columns', async () => {
        await dataSource.query(`CREATE TABLE branch_settings ("branchId" varchar,
            "enforceMultiplicity" boolean NOT NULL DEFAULT false,
            "allowExceedingCreditLimit" boolean NOT NULL DEFAULT false)`);
        await dataSource.query(
            `INSERT INTO branch_settings VALUES ('b-default', true, false), ('b-1', false, true)`,
        );
        await dataSource.query(`INSERT INTO global_settings VALUES ('b-default')`);

        await runUp();

        const all = await rows();
        expect(
            all.find(
                r =>
                    r.checkCode === 'order.multiplicity' &&
                    r.stage === 'cart' &&
                    r.branchId === null,
            ),
        ).toMatchObject({ consequence: 'block', enabled: true });
        expect(
            all.find(
                r =>
                    r.checkCode === 'credit.limit' && r.stage === 'checkout' && r.branchId === null,
            ),
        ).toMatchObject({ consequence: 'hold' });
        expect(
            all.find(
                r =>
                    r.checkCode === 'order.multiplicity' &&
                    r.stage === 'cart' &&
                    r.branchId === 'b-1',
            ),
        ).toMatchObject({ enabled: false });
        expect(
            all.find(
                r =>
                    r.checkCode === 'credit.limit' &&
                    r.stage === 'checkout' &&
                    r.branchId === 'b-1',
            ),
        ).toMatchObject({ consequence: 'warn' });
        const columns: Array<{ column_name: string }> = await dataSource.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'branch_settings'`,
            [schema],
        );
        expect(columns.map(c => c.column_name)).toEqual(['branchId']);
    });

    it('is a no-op for the data when the columns are already gone, and can run twice', async () => {
        await dataSource.query(`CREATE TABLE branch_settings ("branchId" varchar)`);
        await dataSource.query(`INSERT INTO branch_settings VALUES ('b-1')`);

        await runUp();
        await runUp();

        expect(await rows()).toEqual([]);
    });

    it('without a default branch the global rows are the old defaults', async () => {
        await dataSource.query(`CREATE TABLE branch_settings ("branchId" varchar,
            "enforceMultiplicity" boolean NOT NULL DEFAULT false,
            "allowExceedingCreditLimit" boolean NOT NULL DEFAULT false)`);
        await dataSource.query(`INSERT INTO branch_settings VALUES ('b-1', true, false)`);

        await runUp();

        const all = await rows();
        expect(
            all.find(
                r =>
                    r.checkCode === 'order.multiplicity' &&
                    r.stage === 'cart' &&
                    r.branchId === null,
            ),
        ).toMatchObject({ enabled: false });
        expect(
            all.find(
                r =>
                    r.checkCode === 'order.multiplicity' &&
                    r.stage === 'cart' &&
                    r.branchId === 'b-1',
            ),
        ).toMatchObject({ enabled: true });
    });
});
