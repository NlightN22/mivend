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

import { lastResetInstant } from '../../reset-instant';
import { SessionDailyResetService } from '../../session-daily-reset.service';

const { schema, extra } = testSchemaOptions('session_daily_reset');
const ZONE = 'Europe/Berlin';
let dataSource: DataSource;
let deleteFromCache: ReturnType<typeof vi.fn>;

function service(enabled = true): SessionDailyResetService {
    const configService = {
        authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
    } as unknown as ConfigService;
    return new SessionDailyResetService(
        { dailyReset: { enabled, hour: 3, timeZone: ZONE } },
        configService,
        createTestConnection(dataSource),
    );
}

async function insertSession(
    token: string,
    createdAt: Date,
    overrides: { type?: string; acting?: boolean; strategy?: string; userId?: number } = {},
): Promise<void> {
    await dataSource.query(
        `INSERT INTO session (token, "userId", type, invalidated, expires, "createdAt", "customFieldsActingadministratorid", "authenticationStrategy")
         VALUES ($1, $2, $3, false, $4, $5::timestamptz, $6, $7)`,
        [
            token,
            overrides.userId ?? 1,
            overrides.type ?? 'AuthenticatedSession',
            new Date(Date.now() + 86_400_000),
            createdAt.toISOString(),
            overrides.acting ? '9' : null,
            overrides.strategy ?? 'native',
        ],
    );
}

async function activeTokens(): Promise<string[]> {
    const rows: { token: string }[] = await dataSource.query(
        'SELECT token FROM session WHERE invalidated = false ORDER BY token',
    );
    return rows.map(row => row.token);
}

beforeAll(async () => {
    // Node and the database deliberately disagree on the zone: the bug class this guards against.
    process.env.TZ = 'Europe/Berlin';
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        extra: { options: `${extra.options} -c timezone=UTC` },
    });
    await dataSource.initialize();
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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE session');
    deleteFromCache = vi.fn();
});

describe('SessionDailyResetService (integration, real Postgres)', () => {
    it('ends sessions created before the latest reset instant and keeps newer ones', async () => {
        const instant = lastResetInstant(new Date(), 3, ZONE);
        await insertSession('before-a', new Date(instant.getTime() - 3_600_000), { userId: 1 });
        await insertSession('before-b', new Date(instant.getTime() - 86_400_000 * 5), {
            userId: 2,
        });
        await insertSession('after', new Date(instant.getTime() + 1), { userId: 1 });

        const ended = await service().endSessionsBeforeLastReset(testRequestContext);

        expect(ended).toBe(2);
        expect(await activeTokens()).toEqual(['after']);
        expect(deleteFromCache.mock.calls.map(call => call[0]).sort()).toEqual([
            'before-a',
            'before-b',
        ]);
    });

    it('leaves acting, API-key and anonymous sessions alone', async () => {
        const old = new Date(Date.now() - 86_400_000 * 3);
        await insertSession('acting', old, { acting: true });
        await insertSession('key', old, { strategy: 'api-key' });
        await insertSession('anon', old, { type: 'AnonymousSession' });
        await insertSession('plain', old);

        await service().endSessionsBeforeLastReset(testRequestContext);

        expect(await activeTokens()).toEqual(['acting', 'anon', 'key']);
    });

    it('is idempotent: a second or concurrent run ends nothing more', async () => {
        await insertSession('old', new Date(Date.now() - 86_400_000 * 2));

        const first = await Promise.all([
            service().endSessionsBeforeLastReset(testRequestContext),
            service().endSessionsBeforeLastReset(testRequestContext),
        ]);
        const again = await service().endSessionsBeforeLastReset(testRequestContext);

        expect(first.reduce((a, b) => a + b, 0)).toBe(1);
        expect(again).toBe(0);
    });

    it('does nothing when the reset is disabled', async () => {
        await insertSession('old', new Date(Date.now() - 86_400_000 * 2));

        expect(await service(false).endSessionsBeforeLastReset(testRequestContext)).toBe(0);
        expect(await activeTokens()).toEqual(['old']);
    });
});
