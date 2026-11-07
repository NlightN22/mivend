import type { Client } from 'pg';

import { createDbClient } from './db-client';

const LOCK_KEY = 'superadmin-bootstrap';

async function superadminExists(client: Client, identifier: string): Promise<boolean> {
    const { rows } = await client.query(
        `SELECT to_regclass('"user"') IS NOT NULL AND to_regclass('administrator') IS NOT NULL AS "ready"`,
    );
    if (!rows[0]?.ready) return false;
    const found = await client.query(
        `SELECT 1 FROM "user" u JOIN administrator a ON a."userId" = u.id
         WHERE lower(u.identifier) = lower($1) AND u."deletedAt" IS NULL AND a."deletedAt" IS NULL`,
        [identifier],
    );
    return found.rows.length > 0;
}

async function withLock<T>(
    work: () => Promise<T>,
    needsLock: (client: Client) => Promise<boolean>,
    createClient: () => Client,
): Promise<T> {
    const client = createClient();
    await client.connect();
    try {
        if (await needsLock(client)) {
            // eslint-disable-next-line locks/no-raw-advisory-lock
            await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [LOCK_KEY]);
        }
        return await work();
    } finally {
        await client.end();
    }
}

// Vendure's superadmin check-then-create is not atomic and runs in every process (#285): hold a
// session lock across bootstrap while the account is missing; later boots skip the lock.
export function withSuperadminBootstrapLock<T>(
    work: () => Promise<T>,
    identifier: string = process.env.SUPERADMIN_USERNAME ?? 'superadmin',
    createClient: () => Client = createDbClient,
): Promise<T> {
    return withLock(work, async c => !(await superadminExists(c, identifier)), createClient);
}

// Server processes also rewrite default roles and settings on every boot, so two servers starting
// together (shop and admin, #321) must always take turns, not only on a fresh database.
export function withServerBootstrapLock<T>(
    work: () => Promise<T>,
    createClient: () => Client = createDbClient,
): Promise<T> {
    return withLock(work, async () => true, createClient);
}
