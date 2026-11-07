import type { Client } from 'pg';

import { createDbClient } from './db-client';

const LOCK_KEY = 'superadmin-bootstrap';
const POLL_MS = 500;
const DEFAULT_TIMEOUT_MS = 600_000;

async function acquire(client: Client, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    let announced = false;
    for (;;) {
        const { rows } = await client.query(
            'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS "locked"',
            [LOCK_KEY],
        );
        if (rows[0]?.locked) return;
        if (Date.now() >= deadline) {
            throw new Error(
                `Bootstrap lock not acquired within ${timeoutMs} ms; another process is stuck in bootstrap`,
            );
        }
        if (!announced) console.warn('Waiting for another process to finish bootstrap');
        announced = true;
        await new Promise(resolve => setTimeout(resolve, POLL_MS));
    }
}

// Vendure's superadmin check-then-create (#285) and our default-role/default-entity bootstrap are not
// atomic and run on every boot of every process (shop and admin servers, workers): take turns.
export async function withBootstrapLock<T>(
    work: () => Promise<T>,
    createClient: () => Client = createDbClient,
    timeoutMs: number = parseInt(process.env.BOOTSTRAP_LOCK_TIMEOUT_MS ?? `${DEFAULT_TIMEOUT_MS}`),
): Promise<T> {
    const client = createClient();
    await client.connect();
    try {
        await acquire(client, timeoutMs);
        return await work();
    } finally {
        await client.end();
    }
}
