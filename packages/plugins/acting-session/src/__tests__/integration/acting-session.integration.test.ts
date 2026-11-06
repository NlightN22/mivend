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

import { ActingSessionLivenessService } from '../../acting-session-liveness.service';
import { ActingTicketService, hashTicket } from '../../acting-ticket.service';

const { schema, extra } = testSchemaOptions('acting_session');
const SESSION_TTL = 4 * 3_600_000;
let dataSource: DataSource;
let deleteFromCache: ReturnType<typeof vi.fn>;

function liveness(): ActingSessionLivenessService {
    const config = {
        authOptions: { sessionCacheStrategy: { delete: deleteFromCache } },
    } as unknown as ConfigService;
    return new ActingSessionLivenessService(createTestConnection(dataSource), config);
}

function tickets(): ActingTicketService {
    return new ActingTicketService(createTestConnection(dataSource), {
        storefrontPublicUrl: '',
    });
}

async function insertTicket(ticket: string, expiresInMs: number, usedAt: Date | null = null) {
    await dataSource.query(
        `INSERT INTO acting_ticket ("tokenHash", "administratorId", "parentSessionId", "counterpartyId",
            "customerId", "tradingPointId", "expiresAt", "usedAt")
         VALUES ($1, '1', '10', 'cp-1', 'cu-1', NULL, $2, $3)`,
        [hashTicket(ticket), new Date(Date.now() + expiresInMs), usedAt],
    );
}

async function insertSession(
    token: string,
    overrides: { acting?: boolean; parent?: string; ageMs?: number; id?: number } = {},
): Promise<void> {
    await dataSource.query(
        `INSERT INTO session (id, token, type, invalidated, expires, "createdAt",
            "customFieldsActingadministratorid", "customFieldsActingparentsessionid")
         VALUES (COALESCE($1::int, nextval('session_id_seq')), $2, 'AuthenticatedSession', false, $3, $4, $5, $6)`,
        [
            overrides.id ?? null,
            token,
            new Date(Date.now() + 86_400_000),
            new Date(Date.now() - (overrides.ageMs ?? 0)),
            overrides.acting ? '1' : null,
            overrides.parent ?? null,
        ],
    );
}

async function insertAdmin(permissions: string, deleted = false): Promise<void> {
    await dataSource.query(`INSERT INTO "user" (id, "deletedAt") VALUES (1, NULL)`);
    await dataSource.query(
        `INSERT INTO administrator (id, "userId", "deletedAt") VALUES (1, 1, $1)`,
        [deleted ? new Date() : null],
    );
    await dataSource.query(`INSERT INTO role (id, permissions) VALUES (1, $1)`, [permissions]);
    await dataSource.query(`INSERT INTO user_roles_role ("userId", "roleId") VALUES (1, 1)`);
}

async function invalidated(token: string): Promise<boolean> {
    const rows = await dataSource.query('SELECT invalidated FROM session WHERE token = $1', [
        token,
    ]);
    return rows[0].invalidated;
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), extra });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE session (
            id serial PRIMARY KEY, token varchar NOT NULL UNIQUE, type varchar NOT NULL,
            invalidated boolean NOT NULL, expires timestamp NOT NULL, "createdAt" timestamp NOT NULL,
            "customFieldsActingadministratorid" varchar, "customFieldsActingparentsessionid" varchar);
        CREATE TABLE "user" (id int PRIMARY KEY, "deletedAt" timestamp);
        CREATE TABLE administrator (id int PRIMARY KEY, "userId" int, "deletedAt" timestamp);
        CREATE TABLE role (id int PRIMARY KEY, permissions text NOT NULL);
        CREATE TABLE user_roles_role ("userId" int, "roleId" int);
        CREATE TABLE acting_ticket (
            id serial PRIMARY KEY, "tokenHash" varchar NOT NULL UNIQUE, "administratorId" varchar NOT NULL,
            "parentSessionId" varchar NOT NULL, "counterpartyId" varchar NOT NULL, "customerId" varchar NOT NULL,
            "tradingPointId" varchar, "expiresAt" timestamp NOT NULL, "usedAt" timestamp);
    `);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE session, "user", administrator, role, user_roles_role, acting_ticket RESTART IDENTITY',
    );
    deleteFromCache = vi.fn();
});

describe('ActingTicketService (real Postgres)', () => {
    it('claims a valid ticket once and returns its binding', async () => {
        await insertTicket('t1', 60_000);

        const binding = await tickets().claim(testRequestContext, 't1');

        expect(binding).toMatchObject({
            administratorId: '1',
            counterpartyId: 'cp-1',
            customerId: 'cu-1',
        });
        await expect(tickets().claim(testRequestContext, 't1')).rejects.toThrow(
            /invalid, used or expired/,
        );
    });

    it('rejects an expired, an already used and an unknown ticket', async () => {
        await insertTicket('expired', -1_000);
        await insertTicket('used', 60_000, new Date());

        for (const ticket of ['expired', 'used', 'unknown']) {
            await expect(tickets().claim(testRequestContext, ticket)).rejects.toThrow();
        }
    });

    it('lets exactly one of many concurrent exchanges win', async () => {
        await insertTicket('race', 60_000);

        const results = await Promise.allSettled(
            Array.from({ length: 6 }, () => tickets().claim(testRequestContext, 'race')),
        );

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter(r => r.status === 'rejected')).toHaveLength(5);
    });

    it('deletes tickets expired for over an hour and keeps recent ones', async () => {
        await insertTicket('old', -2 * 3_600_000);
        await insertTicket('recent', -1_000);

        expect(await tickets().deleteExpired(testRequestContext)).toBe(1);
        const rows = await dataSource.query('SELECT count(*)::int AS n FROM acting_ticket');
        expect(rows[0].n).toBe(1);
    });
});

describe('ActingSessionLivenessService (real Postgres)', () => {
    it('keeps a live acting session and never touches a plain customer session', async () => {
        await insertAdmin('CreateOrder');
        await insertSession('manager', { id: 10 });
        await insertSession('acting', { acting: true, parent: '10' });
        await insertSession('customer', { ageMs: 10 * SESSION_TTL });

        expect(await liveness().endDeadSessions(testRequestContext, SESSION_TTL)).toBe(0);
        expect(await invalidated('acting')).toBe(false);
        expect(await invalidated('customer')).toBe(false);
    });

    it('ends an acting session past its lifetime and evicts it from the cache', async () => {
        await insertAdmin('CreateOrder');
        await insertSession('manager', { id: 10 });
        await insertSession('acting', { acting: true, parent: '10', ageMs: SESSION_TTL + 1_000 });

        expect(await liveness().endDeadSession(testRequestContext, 'acting', SESSION_TTL)).toBe(1);
        expect(await invalidated('acting')).toBe(true);
        expect(deleteFromCache).toHaveBeenCalledWith('acting');
    });

    it('ends the acting session when the manager signs out (parent session gone)', async () => {
        await insertAdmin('CreateOrder');
        await insertSession('acting', { acting: true, parent: '10' });

        expect(await liveness().endDeadSession(testRequestContext, 'acting', SESSION_TTL)).toBe(1);
    });

    it('ends the acting session when the manager is deactivated or loses the permission', async () => {
        await insertAdmin('ReadCatalog', false);
        await insertSession('manager', { id: 10 });
        await insertSession('acting', { acting: true, parent: '10' });
        expect(await liveness().endDeadSessions(testRequestContext, SESSION_TTL)).toBe(1);

        await dataSource.query('UPDATE session SET invalidated = false WHERE token = $1', [
            'acting',
        ]);
        await dataSource.query(`UPDATE role SET permissions = 'CreateOrder,ReadCatalog'`);
        expect(await liveness().endDeadSessions(testRequestContext, SESSION_TTL)).toBe(0);

        await dataSource.query(`UPDATE administrator SET "deletedAt" = now()`);
        expect(await liveness().endDeadSessions(testRequestContext, SESSION_TTL)).toBe(1);
    });

    it('treats a super administrator as permitted', async () => {
        await insertAdmin('SuperAdmin');
        await insertSession('manager', { id: 10 });
        await insertSession('acting', { acting: true, parent: '10' });

        expect(await liveness().endDeadSessions(testRequestContext, SESSION_TTL)).toBe(0);
    });
});
