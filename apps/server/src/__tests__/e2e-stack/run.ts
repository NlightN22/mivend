import type { ChildProcess } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

import { createVhost, deleteVhost } from '../access/harness/rabbit-vhost';
import { stopGroup } from '../access/harness/server-process';
import { createDatabase, dropDatabase } from '../access/harness/test-database';
import { clearRecordedGroups, recordGroups, sweepLeftovers } from './leftovers';
import {
    assertPortsFree,
    runForeground,
    spawnBackend,
    spawnPortal,
    waitForPortal,
    waitForServer,
} from './processes';
import { deleteIndices } from './search-indices';
import {
    E2E_PORTS,
    E2E_PREFIX,
    STACK_DIR,
    localContourEnv,
    serverEnv,
    testRunEnv,
} from './stack-env';

// Usage: run.ts <command...>. Boots a throwaway e2e stack, seeds it, runs the command, tears down.
const command = process.argv.slice(2);
const base = localContourEnv();
const name = `${E2E_PREFIX}${Date.now()}`;
const children: ChildProcess[] = [];
let foreground: ChildProcess | undefined;
const elapsed = (since: number): string => `${((Date.now() - since) / 1000).toFixed(0)}s`;

function track(...spawned: ChildProcess[]): void {
    children.push(...spawned);
    recordGroups(children.map(c => c.pid).filter((pid): pid is number => pid !== undefined));
}

let tornDown: Promise<void> | undefined;
const teardown = (): Promise<void> => (tornDown ??= stopAndDrop());

async function stopAndDrop(): Promise<void> {
    if (foreground?.exitCode === null) foreground.kill('SIGTERM');
    const steps = [
        () => Promise.all(children.map(stopGroup)),
        () => deleteVhost(name),
        () => dropDatabase(name),
        () => deleteIndices(base, `${name}-`),
        async () => rmSync(resolve(STACK_DIR, `pdfs-${name}`), { recursive: true, force: true }),
    ];
    for (const step of steps) await step().catch(error => console.error('e2e teardown:', error));
    clearRecordedGroups();
}

async function bootAndSeed(): Promise<void> {
    const started = Date.now();
    await assertPortsFree();
    await createDatabase(name);
    const env = serverEnv(base, name, await createVhost(name));
    const backend = spawnBackend(env);
    const portals = [
        spawnPortal('storefront', E2E_PORTS.storefront),
        spawnPortal('manager', E2E_PORTS.manager),
    ];
    track(...backend, ...portals);
    await waitForServer(backend[0]);
    console.log(`e2e stack: server up on :${E2E_PORTS.server} after ${elapsed(started)}`);
    const seeded = Date.now();
    const seedCode = await runForeground(['node', 'infrastructure/scripts/seed-erp.mjs'], {
        PORT: String(E2E_PORTS.server),
        ERP_IMPORT_TOKEN: base.ERP_IMPORT_TOKEN,
        SEED_DB_NAME: name,
    });
    if (seedCode !== 0 && !process.env.DBG) throw new Error(`seed-erp.mjs exited with ${seedCode}`);
    console.log(`e2e stack: seeded in ${elapsed(seeded)}`);
    await waitForPortal(portals[0], 'storefront', E2E_PORTS.storefront);
    await waitForPortal(portals[1], 'manager', E2E_PORTS.manager);
    console.log(`e2e stack: ready after ${elapsed(started)} (database ${name}, logs ${STACK_DIR})`);
}

async function main(): Promise<number> {
    if (command.length === 0) throw new Error('Usage: run.ts <command...>');
    process.env.TEST_DB_HOST = base.DB_HOST;
    process.env.TEST_DB_PORT = base.DB_PORT;
    process.env.TEST_DB_USER = base.DB_USERNAME;
    process.env.TEST_DB_PASSWORD = base.DB_PASSWORD;
    process.env.RABBITMQ_URL = base.RABBITMQ_URL;
    mkdirSync(STACK_DIR, { recursive: true });
    await sweepLeftovers(base);
    try {
        await bootAndSeed();
        return await runForeground(command, testRunEnv(base, name), child => {
            foreground = child;
        });
    } finally {
        await teardown();
    }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => void teardown().finally(() => process.exit(130)));

main().then(
    code => process.exit(code),
    error => {
        console.error(error);
        process.exit(1);
    },
);
