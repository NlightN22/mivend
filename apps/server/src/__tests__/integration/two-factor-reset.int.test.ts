import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { resetTwoFactor, type SqlClient } from '../../two-factor-reset';

const { schema, extra } = testSchemaOptions('two_factor_reset');
let dataSource: DataSource;

// TypeORM answers DELETE ... RETURNING with [rows, count], a pg Client with the rows only.
function rowsOf(result: unknown): Array<Record<string, unknown>> {
    const pair = Array.isArray(result) && result.length === 2 && typeof result[1] === 'number';
    return (pair ? (result as unknown[])[0] : result) as Array<Record<string, unknown>>;
}

// The reset script drives BEGIN/COMMIT itself, so it gets one pinned connection like a pg Client.
async function withClient<T>(run: (client: SqlClient) => Promise<T>): Promise<T> {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
        return await run({
            query: async (sql, params) => ({ rows: rowsOf(await runner.query(sql, params)) }),
        });
    } finally {
        await runner.release();
    }
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), extra });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE "user" (id serial PRIMARY KEY, identifier varchar NOT NULL, "deletedAt" timestamp);
        CREATE TABLE session (id serial PRIMARY KEY, "userId" int, token varchar NOT NULL);
        CREATE TABLE two_factor_factor (id serial PRIMARY KEY, "userId" varchar NOT NULL);
        CREATE TABLE two_factor_token (id serial PRIMARY KEY, "userId" varchar NOT NULL);
        CREATE TABLE entity_version (
            id serial PRIMARY KEY, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now(),
            "entityName" varchar NOT NULL, "entityId" varchar NOT NULL, action varchar NOT NULL,
            "changedFields" text, "administratorId" varchar, comment varchar);
    `);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE "user", session, two_factor_factor, two_factor_token, entity_version RESTART IDENTITY',
    );
    await dataSource.query(
        `INSERT INTO "user" (identifier) VALUES ('locked@example.org'), ('other@example.org')`,
    );
    await dataSource.query(`INSERT INTO two_factor_factor ("userId") VALUES ('1'), ('2')`);
    await dataSource.query(`INSERT INTO two_factor_token ("userId") VALUES ('1'), ('2')`);
    await dataSource.query(
        `INSERT INTO session ("userId", token) VALUES (1, 'a'), (1, 'b'), (2, 'c')`,
    );
});

describe('operational two-factor reset', () => {
    it('clears one account factor, tokens and sessions, and audits it', async () => {
        const outcome = await withClient(client =>
            resetTwoFactor(client, 'locked@example.org', 'lost phone'),
        );
        expect(outcome).toEqual({ userId: '1', factorsRemoved: 1, sessionsRemoved: 2 });
        expect(await dataSource.query('SELECT "userId" FROM two_factor_factor')).toEqual([
            { userId: '2' },
        ]);
        expect(await dataSource.query('SELECT "userId" FROM two_factor_token')).toEqual([
            { userId: '2' },
        ]);
        expect(await dataSource.query('SELECT token FROM session')).toEqual([{ token: 'c' }]);
        expect(
            await dataSource.query(
                'SELECT "entityName", "entityId", action, comment FROM entity_version',
            ),
        ).toEqual([
            {
                entityName: 'TwoFactor',
                entityId: '1',
                action: 'deactivate',
                comment: 'two-factor reset by operator: lost phone',
            },
        ]);
    });

    it('changes nothing for an unknown account', async () => {
        expect(
            await withClient(client => resetTwoFactor(client, 'nobody@example.org', 'x')),
        ).toBeNull();
        expect(await dataSource.query('SELECT 1 FROM two_factor_factor')).toHaveLength(2);
        expect(await dataSource.query('SELECT 1 FROM entity_version')).toHaveLength(0);
    });

    it('rolls everything back when the audit row cannot be written', async () => {
        await dataSource.query('DROP TABLE entity_version');
        await expect(
            withClient(client => resetTwoFactor(client, 'locked@example.org', 'x')),
        ).rejects.toThrow();
        expect(await dataSource.query('SELECT 1 FROM two_factor_factor')).toHaveLength(2);
        expect(await dataSource.query('SELECT 1 FROM session')).toHaveLength(3);
    });
});
