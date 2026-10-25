import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { AdministratorEmailUnique1791535000000 } from '../../migrations/1791535000000-administrator-email-unique';
import { withSuperadminBootstrapLock } from '../../superadmin-bootstrap-lock';

const { schema, extra } = testSchemaOptions('superadmin_bootstrap');
const IDENTIFIER = 'superadmin';
let dataSource: DataSource;

function schemaClient(): Client {
    const o = testDataSourceConnectionOptions();
    return new Client({
        host: o.host,
        port: o.port,
        user: o.username,
        password: o.password,
        database: o.database,
        options: `-c search_path=${schema}`,
    });
}

// Same shape as Vendure's ensureSuperAdminExists: read, then insert without a transaction.
function latch(parties: number): () => Promise<void> {
    let arrived = 0;
    let release!: () => void;
    const opened = new Promise<void>(resolve => (release = resolve));
    return async () => {
        if (++arrived === parties) release();
        await opened;
    };
}

async function checkThenCreate(
    afterRead: () => Promise<void> = async () => undefined,
): Promise<void> {
    const rows = await dataSource.query(`SELECT 1 FROM "user" WHERE identifier = $1`, [IDENTIFIER]);
    await afterRead();
    if (rows.length === 0) {
        const [u] = await dataSource.query(
            `INSERT INTO "user" (identifier) VALUES ($1) RETURNING id`,
            [IDENTIFIER],
        );
        await dataSource.query(
            `INSERT INTO administrator ("emailAddress", "userId") VALUES ($1, $2)`,
            [IDENTIFIER, u.id],
        );
    }
}

async function counts(): Promise<{ users: number; admins: number }> {
    const [u] = await dataSource.query(`SELECT count(*)::int AS n FROM "user"`);
    const [a] = await dataSource.query(`SELECT count(*)::int AS n FROM administrator`);
    return { users: u.n, admins: a.n };
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
    await dataSource.query(
        `CREATE TABLE "user" ("id" serial primary key, "identifier" varchar not null, "deletedAt" timestamp)`,
    );
    await dataSource.query(
        `CREATE TABLE administrator ("id" serial primary key, "emailAddress" varchar not null, "userId" integer, "deletedAt" timestamp)`,
    );
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE administrator, "user" RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('superadmin first boot (integration, real Postgres)', () => {
    it('without the lock parallel check-then-create duplicates the account (the #285 race)', async () => {
        const barrier = latch(3);
        await Promise.all([1, 2, 3].map(() => checkThenCreate(barrier)));
        expect((await counts()).admins).toBeGreaterThan(1);
    });

    it('with the lock N parallel bootstraps end with one user and one administrator', async () => {
        await Promise.all(
            Array.from({ length: 5 }, () =>
                withSuperadminBootstrapLock(() => checkThenCreate(), IDENTIFIER, schemaClient),
            ),
        );
        expect(await counts()).toEqual({ users: 1, admins: 1 });
    });

    it('a boot after the account exists does not wait for a held lock', async () => {
        await checkThenCreate();
        const holder = schemaClient();
        await holder.connect();
        await holder.query(`SELECT pg_advisory_lock(hashtextextended('superadmin-bootstrap', 0))`);
        try {
            await withSuperadminBootstrapLock(async () => undefined, IDENTIFIER, schemaClient);
        } finally {
            await holder.end();
        }
    });
});

describe('administrator email unique index migration', () => {
    async function run(): Promise<void> {
        const qr = dataSource.createQueryRunner();
        try {
            await new AdministratorEmailUnique1791535000000().up(qr);
        } finally {
            await qr.release();
        }
    }

    it('applies on a populated table, then rejects a duplicate active administrator', async () => {
        await dataSource.query(
            `INSERT INTO administrator ("emailAddress") VALUES ('a@x.test'), ('b@x.test')`,
        );
        await dataSource.query(
            `INSERT INTO administrator ("emailAddress", "deletedAt") VALUES ('a@x.test', now())`,
        );
        await run();
        await expect(
            dataSource.query(`INSERT INTO administrator ("emailAddress") VALUES ('a@x.test')`),
        ).rejects.toThrow(/UQ_administrator_email_active/);
        await dataSource.query(`DROP INDEX "UQ_administrator_email_active"`);
    });

    it('fails with the duplicate listed when an active duplicate already exists', async () => {
        await dataSource.query(
            `INSERT INTO administrator ("emailAddress") VALUES ('a@x.test'), ('a@x.test')`,
        );
        await expect(run()).rejects.toThrow(/a@x\.test \(administrator ids 1,2\)/);
    });
});
