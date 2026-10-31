import { execFile } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const dbName = `test_drift_${process.pid}_${Date.now().toString(36)}`;
const conn = {
    host: process.env.TEST_DB_HOST ?? 'localhost',
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USER ?? 'postgres',
    password: process.env.TEST_DB_PASSWORD ?? 'postgres',
};

// Objects only a migration can express (partial/expression indexes, custom-field indexes); entities cannot declare them.
const MIGRATION_ONLY_INDEXES = [
    'UQ_administrator_email_active',
    'IDX_integration_outbox_event_order',
    'IDX_order_custom_fields_counterpartyid',
    'IDX_order_custom_fields_pendingcounterpartyerpid',
];

async function onMaintenanceDb(sql: string): Promise<void> {
    const client = new Client({ ...conn, database: 'postgres' });
    await client.connect();
    try {
        await client.query(sql);
    } finally {
        await client.end();
    }
}

let outDir: string;

beforeAll(async () => {
    outDir = await mkdtemp(join(tmpdir(), 'schema-drift-'));
    await onMaintenanceDb(`CREATE DATABASE "${dbName}"`);
});

afterAll(async () => {
    await rm(outDir, { recursive: true, force: true });
    await onMaintenanceDb(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
});

describe('migrations vs entity-derived schema (integration, real Postgres)', () => {
    it('a database built only by migrations needs no schema changes to match the entities', async () => {
        const { stdout } = await run(
            'npx',
            ['ts-node', '--transpile-only', join(__dirname, 'schema-drift-probe.ts'), outDir],
            {
                cwd: join(__dirname, '../../..'),
                maxBuffer: 64 * 1024 * 1024,
                env: {
                    ...process.env,
                    DB_HOST: conn.host,
                    DB_PORT: String(conn.port),
                    DB_USERNAME: conn.user,
                    DB_PASSWORD: conn.password,
                    DB_NAME: dbName,
                    INSTANCE_NUMBER_CODE: process.env.INSTANCE_NUMBER_CODE || '001',
                },
            },
        );
        const statements: string[] = JSON.parse(stdout.split('DRIFT_JSON:')[1]);
        const drift = statements.filter(
            sql => !MIGRATION_ONLY_INDEXES.some(name => sql.includes(`"${name}"`)),
        );
        expect(drift).toEqual([]);
    }, 240_000);
});
