import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { ConfigService } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { SessionCapService } from '../../session-cap.service';

const { schema, extra } = testSchemaOptions('session_cap');
let dataSource: DataSource;
let deleteFromCache: ReturnType<typeof vi.fn>;

function capService(cap: number): SessionCapService {
    const configService = {
        authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
    } as unknown as ConfigService;
    return new SessionCapService({ maxActiveSessionsPerUser: cap }, configService, dataSource);
}

async function insertSession(
    token: string,
    userId: number,
    minutesAgo: number,
    overrides: { invalidated?: boolean; expired?: boolean; type?: string } = {},
): Promise<void> {
    const now = Date.now();
    await dataSource.query(
        `INSERT INTO session (token, "userId", type, invalidated, expires, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
            token,
            userId,
            overrides.type ?? 'AuthenticatedSession',
            overrides.invalidated ?? false,
            new Date(now + (overrides.expired ? -1 : 1) * 86_400_000),
            new Date(now - minutesAgo * 60_000),
        ],
    );
}

async function activeTokens(userId: number): Promise<string[]> {
    const rows: { token: string }[] = await dataSource.query(
        `SELECT token FROM session WHERE "userId" = $1 AND invalidated = false ORDER BY token`,
        [userId],
    );
    return rows.map(row => row.token);
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), extra });
    await dataSource.initialize();
    // Mirrors the columns Vendure's single-table Session inheritance uses.
    await dataSource.query(`CREATE TABLE session (
        id serial PRIMARY KEY,
        token varchar NOT NULL UNIQUE,
        "userId" integer,
        type varchar NOT NULL,
        invalidated boolean NOT NULL,
        expires timestamp NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
    )`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE session');
    deleteFromCache = vi.fn();
});

describe('SessionCapService (integration, real Postgres)', () => {
    it('invalidates the oldest active sessions beyond the cap and evicts them from the cache', async () => {
        await insertSession('oldest', 1, 30);
        await insertSession('middle', 1, 20);
        await insertSession('newer', 1, 10);
        await insertSession('newest', 1, 0);

        const ended = await capService(2).enforceCap(1);

        expect(ended).toBe(2);
        expect(await activeTokens(1)).toEqual(['newer', 'newest']);
        expect(deleteFromCache.mock.calls.map(call => call[0]).sort()).toEqual([
            'middle',
            'oldest',
        ]);
    });

    it('leaves other users, anonymous, already ended and expired sessions out of the count', async () => {
        await insertSession('old-ended', 1, 40, { invalidated: true });
        await insertSession('old-expired', 1, 30, { expired: true });
        await insertSession('mine-a', 1, 20);
        await insertSession('mine-b', 1, 10);
        await insertSession('other-user', 2, 50);
        await insertSession('anonymous', 1, 60, { type: 'AnonymousSession' });

        const ended = await capService(2).enforceCap(1);

        expect(ended).toBe(0);
        expect(await activeTokens(2)).toEqual(['other-user']);
        expect(await activeTokens(1)).toEqual(['anonymous', 'mine-a', 'mine-b', 'old-expired']);
    });

    it('two concurrent logins of one user leave exactly the cap active', async () => {
        for (let i = 0; i < 6; i++) await insertSession(`s${i}`, 1, 60 - i);

        const results = await Promise.all([
            capService(3).enforceCap(1),
            capService(3).enforceCap(1),
        ]);

        expect(results.reduce((a, b) => a + b, 0)).toBe(3);
        expect(await activeTokens(1)).toEqual(['s3', 's4', 's5']);
    });
});
