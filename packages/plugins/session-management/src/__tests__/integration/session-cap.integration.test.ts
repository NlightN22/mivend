import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import type { ConfigService } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { SessionCapService } from '../../session-cap.service';

const { schema, extra } = testSchemaOptions('session_cap');
let dataSource: DataSource;
let deleteFromCache: ReturnType<typeof vi.fn>;

function capService(cap: number, staffCap = cap): SessionCapService {
    const configService = {
        authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
    } as unknown as ConfigService;
    return new SessionCapService(
        { maxActiveSessionsCustomer: cap, maxActiveSessionsStaff: staffCap },
        configService,
        createTestConnection(dataSource),
    );
}

async function insertSession(
    token: string,
    userId: number,
    minutesAgo: number,
    overrides: {
        invalidated?: boolean;
        expired?: boolean;
        type?: string;
        acting?: boolean;
        strategy?: string;
    } = {},
): Promise<void> {
    const now = Date.now();
    await dataSource.query(
        `INSERT INTO session (token, "userId", type, invalidated, expires, "createdAt", "customFieldsActingadministratorid", "authenticationStrategy")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
            token,
            userId,
            overrides.type ?? 'AuthenticatedSession',
            overrides.invalidated ?? false,
            new Date(now + (overrides.expired ? -1 : 1) * 86_400_000),
            new Date(now - minutesAgo * 60_000),
            overrides.acting ? '9' : null,
            overrides.strategy ?? 'native',
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
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "customFieldsActingadministratorid" varchar,
        "authenticationStrategy" varchar
    )`);
    await dataSource.query('CREATE TABLE administrator (id serial PRIMARY KEY, "userId" integer)');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE session');
    await dataSource.query('TRUNCATE administrator');
    deleteFromCache = vi.fn();
});

describe('SessionCapService (integration, real Postgres)', () => {
    it('invalidates the oldest active sessions beyond the cap and evicts them from the cache', async () => {
        await insertSession('oldest', 1, 30);
        await insertSession('middle', 1, 20);
        await insertSession('newer', 1, 10);
        await insertSession('newest', 1, 0);

        const ended = await capService(2).enforceCap(testRequestContext, 1);

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

        const ended = await capService(2).enforceCap(testRequestContext, 1);

        expect(ended).toBe(0);
        expect(await activeTokens(2)).toEqual(['other-user']);
        expect(await activeTokens(1)).toEqual(['anonymous', 'mine-a', 'mine-b', 'old-expired']);
    });

    it('neither counts acting sessions against the cap nor evicts them', async () => {
        await insertSession('acting-old', 1, 90, { acting: true });
        await insertSession('mine-a', 1, 20);
        await insertSession('mine-b', 1, 10);
        await insertSession('acting-new', 1, 0, { acting: true });

        const ended = await capService(2).enforceCap(testRequestContext, 1);

        expect(ended).toBe(0);
        expect(await activeTokens(1)).toEqual(['acting-new', 'acting-old', 'mine-a', 'mine-b']);
    });

    it('two concurrent logins of one user leave exactly the cap active', async () => {
        for (let i = 0; i < 6; i++) await insertSession(`s${i}`, 1, 60 - i);

        const results = await Promise.all([
            capService(3).enforceCap(testRequestContext, 1),
            capService(3).enforceCap(testRequestContext, 1),
        ]);

        expect(results.reduce((a, b) => a + b, 0)).toBe(3);
        expect(await activeTokens(1)).toEqual(['s3', 's4', 's5']);
    });

    it('applies the staff cap to administrator users and the customer cap to the rest', async () => {
        await dataSource.query('INSERT INTO administrator ("userId") VALUES (1)');
        for (let i = 0; i < 4; i++) {
            await insertSession(`staff${i}`, 1, 40 - i);
            await insertSession(`customer${i}`, 2, 40 - i);
        }

        await capService(2, 3).enforceCap(testRequestContext, 1);
        await capService(2, 3).enforceCap(testRequestContext, 2);

        expect(await activeTokens(1)).toEqual(['staff1', 'staff2', 'staff3']);
        expect(await activeTokens(2)).toEqual(['customer2', 'customer3']);
    });

    it('never ends the newest session, the one being created', async () => {
        await insertSession('old-a', 1, 30);
        await insertSession('old-b', 1, 20);
        await insertSession('being-created', 1, 0);

        await capService(1).enforceCap(testRequestContext, 1);

        expect(await activeTokens(1)).toEqual(['being-created']);
    });

    it('leaves API-key sessions out of the count and untouched', async () => {
        await insertSession('key', 1, 90, { strategy: 'api-key' });
        await insertSession('mine-a', 1, 20);
        await insertSession('mine-b', 1, 10);

        const ended = await capService(2).enforceCap(testRequestContext, 1);

        expect(ended).toBe(0);
        expect(await activeTokens(1)).toEqual(['key', 'mine-a', 'mine-b']);
    });
});
