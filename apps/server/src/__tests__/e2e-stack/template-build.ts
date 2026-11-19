import { type ChildProcess } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { Client } from 'pg';

import { createVhost, deleteVhost } from '../access/harness/rabbit-vhost';
import { stopGroup } from '../access/harness/server-process';
import { createDatabase, testDbConnection } from '../access/harness/test-database';
import {
    runForeground,
    spawnBackend,
    spawnMockOidcProvider,
    waitForMockOidcProvider,
    waitForServer,
} from './processes';
import { STACK_DIR, serverEnv, testRunEnv } from './stack-env';
import { publishTemplate } from './template';

const IDLE_TIMEOUT_MS = 90_000;

// A copy taken mid-work would carry rows no worker finishes. integration_outbox is left out: without a broker its pending rows are the normal state.
const OPEN_WORK = [
    `SELECT count(*) AS open FROM job_record WHERE state IN ('PENDING', 'RUNNING', 'RETRYING')`,
    `SELECT count(*) AS open FROM integration_inbox_event WHERE status = 'pending'`,
    `SELECT count(*) AS open FROM sync_outbox WHERE status = 'pending'`,
    `SELECT count(*) AS open FROM erp_import_run WHERE status NOT IN ('done', 'failed')`,
];

async function waitForIdle(name: string): Promise<void> {
    const client = new Client({ ...testDbConnection(), database: name });
    await client.connect();
    try {
        const deadline = Date.now() + IDLE_TIMEOUT_MS;
        while (Date.now() < deadline) {
            let open = 0;
            for (const sql of OPEN_WORK)
                open += Number((await client.query<{ open: string }>(sql)).rows[0].open);
            if (open === 0) return;
            await new Promise(r => setTimeout(r, 1000));
        }
        throw new Error(`work still open in ${name} after ${IDLE_TIMEOUT_MS / 1000}s`);
    } finally {
        await client.end();
    }
}

// Seeds a database exactly as a plain run would, then stops everything and keeps the database as the template.
export async function buildTemplate(
    base: Record<string, string>,
    name: string,
    track: (...spawned: ChildProcess[]) => void,
): Promise<void> {
    const started = Date.now();
    await createDatabase(name);
    const env = serverEnv(base, name, await createVhost(name));
    const mockOidc = spawnMockOidcProvider();
    const backend = spawnBackend(env);
    track(mockOidc, ...backend);
    await waitForMockOidcProvider(mockOidc);
    await waitForServer(backend[0]);
    const seedCode = await runForeground(['node', 'infrastructure/scripts/seed-erp.mjs'], {
        PORT: env.PORT,
        ERP_IMPORT_TOKEN: base.ERP_IMPORT_TOKEN,
        SEED_DB_NAME: name,
    });
    if (seedCode !== 0) throw new Error(`seed-erp.mjs exited with ${seedCode}`);
    const orderFile = resolve(STACK_DIR, `order-${name}.json`);
    const dataCode = await runForeground(
        [
            'pnpm',
            '--filter',
            '@mivend/e2e',
            'exec',
            'playwright',
            'test',
            '--config',
            'playwright.seed.config.ts',
            '--pass-with-no-tests',
        ],
        { ...testRunEnv(base, name), E2E_PICKER_SEED: '1', E2E_ORDER_FILE: orderFile },
    );
    if (dataCode !== 0) throw new Error(`seeding the stack data exited with ${dataCode}`);
    await waitForIdle(name);
    await Promise.all([mockOidc, ...backend].map(stopGroup));
    await deleteVhost(name);
    const order: unknown = JSON.parse(readFileSync(orderFile, 'utf8'));
    rmSync(orderFile);
    await publishTemplate(base, name, order);
    console.log(`e2e template: built ${name} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
