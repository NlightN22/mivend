import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CreditTermPolicyRecipient1791520000000 } from '../../migrations/1791520000000-credit-term-policy-recipient';

const { schema, extra } = testSchemaOptions('credit_term_recipient_migration');
let dataSource: DataSource;

const recipients = async (): Promise<Array<string | null>> =>
    (
        await dataSource.query(
            `SELECT recipient FROM check_policy WHERE "checkCode" = 'manager.credit-term-extension' ORDER BY "branchId" NULLS FIRST`,
        )
    ).map((r: { recipient: string | null }) => r.recipient);

async function run(direction: 'up' | 'down'): Promise<void> {
    const qr = dataSource.createQueryRunner();
    try {
        await new CreditTermPolicyRecipient1791520000000()[direction](qr);
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
    await dataSource.query(`DROP TABLE IF EXISTS check_policy`);
    await dataSource.query(`CREATE TABLE check_policy (
        id serial PRIMARY KEY, uuid uuid NOT NULL, "checkCode" varchar NOT NULL, stage varchar NOT NULL,
        "branchId" varchar, consequence varchar NOT NULL, recipient varchar, enabled boolean NOT NULL DEFAULT true)`);
    await dataSource.query(
        `CREATE UNIQUE INDEX ON check_policy ("checkCode", stage) WHERE "branchId" IS NULL`,
    );
});

const seed = (recipient: string | null, consequence = 'require-approval'): Promise<unknown> =>
    dataSource.query(
        `INSERT INTO check_policy (uuid, "checkCode", stage, "branchId", consequence, recipient)
         VALUES (gen_random_uuid(), 'manager.credit-term-extension', 'extend-credit-term', NULL, $1, $2)`,
        [consequence, recipient],
    );

describe('credit-term policy recipient migration (real Postgres)', () => {
    it('inserts the global row when absent', async () => {
        await run('up');
        expect(await recipients()).toEqual(['department-head']);
    });

    it('fills a null recipient on an existing row but keeps its consequence and a set recipient', async () => {
        await seed(null, 'block');
        await run('up');
        const [row] = await dataSource.query(`SELECT consequence, recipient FROM check_policy`);
        expect(row).toEqual({ consequence: 'block', recipient: 'department-head' });

        await dataSource.query(`UPDATE check_policy SET recipient = 'custom'`);
        await run('up');
        expect(await recipients()).toEqual(['custom']);
    });

    it('down clears only the seeded recipient and keeps the row and other recipients', async () => {
        await run('up');
        await run('down');
        expect(await recipients()).toEqual([null]);

        await dataSource.query(`UPDATE check_policy SET recipient = 'custom'`);
        await run('down');
        expect(await recipients()).toEqual(['custom']);
    });
});
