import type { ChildProcess } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { resolve } from 'path';

import { createVhost, deleteVhost } from '../access/harness/rabbit-vhost';
import { stopGroup } from '../access/harness/server-process';
import { createDatabase, dropDatabase } from '../access/harness/test-database';
import { killRecordedGroups, recordGroups, sweepLeftovers } from './leftovers';
import {
    assertPortsFree,
    runForeground,
    spawnBackend,
    spawnPortal,
    waitForPortal,
    waitForServer,
} from './processes';
import { deleteIndices } from './search-indices';
import { watchStack } from './watchdog';
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
    record();
}

function record(): void {
    const all = foreground ? [...children, foreground] : children;
    recordGroups(all.map(c => c.pid).filter((pid): pid is number => pid !== undefined));
}

let tornDown: Promise<void> | undefined;
const teardown = (): Promise<void> => (tornDown ??= stopAndDrop());

const RUN_TIMEOUT_MS = Number(process.env.E2E_RUN_TIMEOUT_MIN ?? 120) * 60_000;

async function stopAndDrop(): Promise<void> {
    const steps = [
        () => (foreground ? stopGroup(foreground) : Promise.resolve()),
        () => Promise.all(children.map(stopGroup)),
        () => deleteVhost(name),
        () => dropDatabase(name),
        () => deleteIndices(base, `${name}-`),
        async () => rmSync(resolve(STACK_DIR, `pdfs-${name}`), { recursive: true, force: true }),
    ];
    for (const step of steps) await step().catch(error => console.error('e2e teardown:', error));
    killRecordedGroups();
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
    if (seedCode !== 0) throw new Error(`seed-erp.mjs exited with ${seedCode}`);
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
        let failure: string | undefined;
        let stopWatch = (): void => undefined;
        const code = await runForeground(command, testRunEnv(base, name), child => {
            foreground = child;
            record();
            stopWatch = watchStack(children, RUN_TIMEOUT_MS, reason => {
                failure = reason;
                console.error(`e2e stack: ${reason}; stopping the test run`);
                void stopGroup(child);
            });
        });
        stopWatch();
        return failure ? 1 : code;
    } finally {
        await teardown();
    }
}

// A dead parent closes our stdout; an EPIPE must not abort teardown halfway.
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => undefined);

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
    process.on(signal, () => void teardown().finally(() => process.exit(130)));

main().then(
    code => process.exit(code),
    error => {
        console.error(error);
        process.exit(1);
    },
);
