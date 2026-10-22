import { deleteVhost, listVhosts } from './rabbit-vhost';
import { dropDatabase, listDatabases } from './test-database';

export const ACCESS_PREFIX = 'mivend_access_';
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;
const NAME = /^mivend_access_(\d{13})_\d+$/;

export function isStale(name: string, now: number): boolean {
    const match = NAME.exec(name);
    return match !== null && now - Number(match[1]) > STALE_AFTER_MS;
}

// Leftovers of killed runs; a run younger than 6 hours may still be live, so it is kept.
export async function sweepStaleRuns(now = Date.now()): Promise<void> {
    for (const name of (await listDatabases(ACCESS_PREFIX)).filter(n => isStale(n, now)))
        await dropDatabase(name);
    for (const name of (await listVhosts()).filter(n => isStale(n, now))) await deleteVhost(name);
}
