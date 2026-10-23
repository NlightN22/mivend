import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { resolve } from 'path';

import { deleteVhost, listVhosts } from '../access/harness/rabbit-vhost';
import { dropDatabase, listDatabases } from '../access/harness/test-database';
import { deleteIndices } from './search-indices';
import { E2E_PREFIX, STACK_DIR } from './stack-env';

const STATE_FILE = resolve(STACK_DIR, 'process-groups.json');

export function recordGroups(pgids: number[]): void {
    writeFileSync(STATE_FILE, JSON.stringify(pgids));
}

// Also the last teardown step: a group whose leader exited can still hold Playwright or Chrome.
export function killRecordedGroups(): void {
    if (!existsSync(STATE_FILE)) return;
    for (const pgid of JSON.parse(readFileSync(STATE_FILE, 'utf8')) as number[]) {
        try {
            process.kill(-pgid, 'SIGKILL');
        } catch {
            // already gone
        }
    }
    rmSync(STATE_FILE);
}

// Runs hold the e2e lock, so anything left with the prefix belongs to a killed run.
export async function sweepLeftovers(env: Record<string, string>): Promise<void> {
    killRecordedGroups();
    for (const name of await listDatabases(E2E_PREFIX)) await dropDatabase(name);
    for (const name of (await listVhosts()).filter(n => n.startsWith(E2E_PREFIX)))
        await deleteVhost(name);
    await deleteIndices(env, E2E_PREFIX);
    for (const dir of readdirSync(STACK_DIR).filter(d => d.startsWith(`pdfs-${E2E_PREFIX}`)))
        rmSync(resolve(STACK_DIR, dir), { recursive: true, force: true });
}
