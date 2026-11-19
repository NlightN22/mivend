import { NUMBERING_SEQUENCE_NAMES } from '@mivend/plugin-numbering';
import { Client } from 'pg';

export interface TestDbConnection {
    host: string;
    port: number;
    user: string;
    password: string;
}

export function testDbConnection(): TestDbConnection {
    return {
        host: process.env.TEST_DB_HOST ?? 'localhost',
        port: Number(process.env.TEST_DB_PORT ?? 5432),
        user: process.env.TEST_DB_USER ?? 'postgres',
        password: process.env.TEST_DB_PASSWORD ?? 'postgres',
    };
}

async function onMaintenanceDb<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ ...testDbConnection(), database: 'postgres' });
    await client.connect();
    try {
        return await run(client);
    } finally {
        await client.end();
    }
}

// Synchronize makes the tables but not the numbering sequences, which only a migration creates.
export async function createDatabase(name: string): Promise<void> {
    await onMaintenanceDb(client => client.query(`CREATE DATABASE "${name}"`));
    const client = new Client({ ...testDbConnection(), database: name });
    await client.connect();
    try {
        for (const sequence of Object.values(NUMBERING_SEQUENCE_NAMES))
            await client.query(`CREATE SEQUENCE "${sequence}" START 1`);
    } finally {
        await client.end();
    }
}

export async function cloneDatabase(name: string, template: string): Promise<void> {
    await onMaintenanceDb(client =>
        client.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`),
    );
}

export async function setDatabaseComment(name: string, comment: string): Promise<void> {
    await onMaintenanceDb(client =>
        client.query(`COMMENT ON DATABASE "${name}" IS '${comment.replace(/'/g, "''")}'`),
    );
}

export async function readDatabaseComment(name: string): Promise<string | null> {
    const { rows } = await onMaintenanceDb(client =>
        client.query<{ comment: string | null }>(
            `SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname = $1`,
            [name],
        ),
    );
    return rows[0]?.comment ?? null;
}

export async function dropDatabase(name: string): Promise<void> {
    await onMaintenanceDb(client => client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
}

export async function listDatabases(prefix: string): Promise<string[]> {
    const { rows } = await onMaintenanceDb(client =>
        client.query<{ datname: string }>(
            `SELECT datname FROM pg_database WHERE starts_with(datname, $1)`,
            [prefix],
        ),
    );
    return rows.map(r => r.datname);
}
