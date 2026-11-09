import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDataSourceConnectionOptions } from 'shared';

import { UTC_SESSION_OPTIONS, useUtcTimestamps } from '../../pg-utc';

let client: Client;

beforeAll(async () => {
    process.env.TZ = 'Asia/Tokyo';
    useUtcTimestamps();
    const o = testDataSourceConnectionOptions();
    client = new Client({
        host: o.host,
        port: o.port,
        user: o.username,
        password: o.password,
        database: o.database,
        options: UTC_SESSION_OPTIONS,
    });
    await client.connect();
    await client.query(
        'CREATE TEMP TABLE pg_utc_check (id int, at timestamp NOT NULL DEFAULT now())',
    );
});

afterAll(async () => {
    await client.end();
    delete process.env.TZ;
});

describe('UTC timestamps under a non-UTC process zone', () => {
    it('pins the session zone even when the server default differs', async () => {
        const o = testDataSourceConnectionOptions();
        const other = new Client({
            host: o.host,
            port: o.port,
            user: o.username,
            password: o.password,
            database: o.database,
            options: '-c timezone=Europe/Berlin',
        });
        await other.connect();
        const unpinned = await other.query('SHOW timezone');
        await other.end();
        const pinned = await client.query('SHOW timezone');
        expect(unpinned.rows[0].TimeZone).toBe('Europe/Berlin');
        expect(pinned.rows[0].TimeZone).toBe('UTC');
    });

    it('round-trips a Date and agrees with the database default', async () => {
        const written = new Date('2026-11-09T00:00:00.000Z');
        await client.query('INSERT INTO pg_utc_check (id, at) VALUES (1, $1)', [written]);
        await client.query('INSERT INTO pg_utc_check (id) VALUES (2)');
        const wall = await client.query<{ at: string }>(
            "SELECT to_char(at, 'YYYY-MM-DD HH24:MI:SS') AS at FROM pg_utc_check WHERE id = 1",
        );
        expect(wall.rows[0].at).toBe('2026-11-09 00:00:00');
        const rows = await client.query<{ id: number; at: Date; now: Date }>(
            'SELECT id, at, now() AS now FROM pg_utc_check ORDER BY id',
        );
        expect(rows.rows[0].at.toISOString()).toBe(written.toISOString());
        expect(Math.abs(rows.rows[1].at.getTime() - rows.rows[1].now.getTime())).toBeLessThan(5000);
    });
});
