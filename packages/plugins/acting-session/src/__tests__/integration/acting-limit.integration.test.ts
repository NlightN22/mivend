import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
    withAggregateLock,
} from 'shared';

import { ActingLimitService } from '../../acting-limit.service';
import { ActingSessionLivenessService } from '../../acting-session-liveness.service';
import { ActingTicketService, hashTicket } from '../../acting-ticket.service';

const { schema, extra } = testSchemaOptions('acting_limit');
let dataSource: DataSource;
const cacheDelete = vi.fn();

async function insertTicket(ticket: string, expiresInMs: number, usedAt: Date | null = null) {
    await dataSource.query(
        `INSERT INTO acting_ticket ("tokenHash", "administratorId", "parentSessionId", "counterpartyId",
            "customerId", "tradingPointId", "expiresAt", "usedAt")
         VALUES ($1, '1', '10', 'cp-1', 'cu-1', NULL, $2, $3)`,
        [hashTicket(ticket), new Date(Date.now() + expiresInMs), usedAt],
    );
}

async function insertSession(token: string, acting: boolean, userId = 1): Promise<void> {
    await dataSource.query(
        `INSERT INTO session (token, type, invalidated, expires, "customFieldsActingadministratorid", "customFieldsActingparentsessionid", "userId")
         VALUES ($1, 'AuthenticatedSession', false, $2, $3, $4, $5)`,
        [
            token,
            new Date(Date.now() + 86_400_000),
            acting ? '1' : null,
            acting ? '10' : null,
            userId,
        ],
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({ type: 'postgres', ...testDataSourceConnectionOptions(), extra });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE session (
            id serial PRIMARY KEY, token varchar NOT NULL UNIQUE, type varchar NOT NULL,
            invalidated boolean NOT NULL, expires timestamp NOT NULL,
            "customFieldsActingadministratorid" varchar, "customFieldsActingparentsessionid" varchar, "userId" int, "createdAt" timestamp NOT NULL DEFAULT now());
        CREATE TABLE "user" (id int PRIMARY KEY, "deletedAt" timestamp);
        CREATE TABLE administrator (id int PRIMARY KEY, "userId" int, "deletedAt" timestamp);
        CREATE TABLE role (id int PRIMARY KEY, permissions text NOT NULL);
        CREATE TABLE user_roles_role ("userId" int, "roleId" int);
        CREATE TABLE acting_ticket (
            id serial PRIMARY KEY, "tokenHash" varchar NOT NULL UNIQUE, "administratorId" varchar NOT NULL,
            "parentSessionId" varchar NOT NULL, "counterpartyId" varchar NOT NULL, "customerId" varchar NOT NULL,
            "tradingPointId" varchar, "expiresAt" timestamp NOT NULL, "usedAt" timestamp, "createdAt" timestamp NOT NULL DEFAULT now());
    `);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(
        'TRUNCATE session, acting_ticket, "user", administrator, role, user_roles_role RESTART IDENTITY',
    );
    await dataSource.query(`
        INSERT INTO "user" (id) VALUES (1);
        INSERT INTO administrator (id, "userId") VALUES (1, 1);
        INSERT INTO role (id, permissions) VALUES (1, 'CreateOrder');
        INSERT INTO user_roles_role ("userId", "roleId") VALUES (1, 1);
        INSERT INTO session (id, token, type, invalidated, expires)
        VALUES (10, 'manager', 'AuthenticatedSession', false, now() + interval '1 day')`);
    cacheDelete.mockReset();
});

const liveTokens = async (): Promise<string[]> =>
    (
        await dataSource.query(
            `SELECT token FROM session WHERE invalidated = false AND token <> 'manager' ORDER BY token`,
        )
    ).map((r: { token: string }) => r.token);

const config = { authOptions: { sessionCacheStrategy: { delete: cacheDelete } } } as never;

function limits(maxPerManager = 2, maxPerCustomer = 1): ActingLimitService {
    return new ActingLimitService(
        createTestConnection(dataSource),
        config,
        new ActingSessionLivenessService(createTestConnection(dataSource), config),
        { storefrontPublicUrl: '', maxPerManager, maxPerCustomer },
    );
}

describe('ActingLimitService (real Postgres)', () => {
    it("ends the manager's oldest open items, ticket or session, and keeps room for the new one", async () => {
        await insertSession('oldest', true);
        await insertTicket('mid', 60_000);
        await insertSession('newest', true);
        await insertTicket('used', 60_000, new Date());
        await insertSession('plain', false);

        const ended = await limits(3).enforceManagerCap(testRequestContext, '1');

        expect(ended).toBe(1);
        expect(await liveTokens()).toEqual(['newest', 'plain']);
        expect(cacheDelete).toHaveBeenCalledWith('oldest');
        await expect(
            new ActingTicketService(createTestConnection(dataSource), {
                storefrontPublicUrl: '',
            }).claim(testRequestContext, 'mid'),
        ).resolves.toBeDefined();
    });

    it("ends nothing below the cap and never touches the customer's own sessions", async () => {
        await insertSession('own', false, 5);
        expect(await limits(3, 2).enforceCustomerCap(testRequestContext, '5')).toBe(0);
        expect(await liveTokens()).toEqual(['own']);
    });

    it('keeps exactly the cap of newest items after 8 parallel starts of one manager', async () => {
        const connection = createTestConnection(dataSource);
        const service = limits(3);
        const start = (n: number) =>
            withAggregateLock(connection, testRequestContext, 'acting-manager:1', async ctx => {
                await service.enforceManagerCap(ctx, '1');
                await connection.getRepository(ctx, 'Channel').query(
                    `INSERT INTO acting_ticket ("tokenHash", "administratorId", "parentSessionId", "counterpartyId",
                        "customerId", "expiresAt", "createdAt")
                     VALUES ($1, '1', '10', 'cp-1', 'cu-1', $2, clock_timestamp())`,
                    [`h-${n}`, new Date(Date.now() + 60_000)],
                );
            });

        const results = await Promise.allSettled(Array.from({ length: 8 }, (_, n) => start(n)));

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(8);
        const [{ n }] = await dataSource.query(
            'SELECT count(*)::int AS n FROM acting_ticket WHERE "usedAt" IS NULL',
        );
        expect(n).toBe(3);
    });

    it('keeps exactly the cap of live acting sessions per customer after 8 parallel exchanges', async () => {
        const connection = createTestConnection(dataSource);
        const service = limits(10, 3);
        const exchange = (n: number) =>
            withAggregateLock(connection, testRequestContext, 'acting-customer:5', async ctx => {
                await service.enforceCustomerCap(ctx, '5');
                await connection.getRepository(ctx, 'Channel').query(
                    `INSERT INTO session (token, type, invalidated, expires, "customFieldsActingadministratorid", "customFieldsActingparentsessionid", "userId", "createdAt")
                     VALUES ($1, 'AuthenticatedSession', false, $2, '1', '10', 5, clock_timestamp())`,
                    [`t-${n}`, new Date(Date.now() + 86_400_000)],
                );
            });

        const results = await Promise.allSettled(Array.from({ length: 8 }, (_, n) => exchange(n)));

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(8);
        expect(await liveTokens()).toHaveLength(3);
        expect(cacheDelete).toHaveBeenCalledTimes(5);
    });

    it('does not let a dead acting session (manager signed out) occupy a slot or evict a live one', async () => {
        await insertSession('live', true, 5);
        await insertSession('orphan', true, 5);
        await dataSource.query(
            `UPDATE session SET "customFieldsActingparentsessionid" = '99' WHERE token = 'orphan'`,
        );

        const ended = await limits(10, 2).enforceCustomerCap(testRequestContext, '5');

        expect(ended).toBe(0);
        expect(await liveTokens()).toEqual(['live']);
        expect(cacheDelete).toHaveBeenCalledWith('orphan');
    });

    it('treats a manager who lost CreateOrder as dead, so their sessions free the manager cap', async () => {
        await insertSession('a', true);
        await insertSession('b', true);
        await dataSource.query(`UPDATE role SET permissions = 'ReadCatalog'`);

        expect(await limits(2).enforceManagerCap(testRequestContext, '1')).toBe(0);
        expect(await liveTokens()).toEqual([]);
    });

    it("sweeps only the caller's own dead sessions, never another manager's or customer's", async () => {
        await insertSession('mine-dead', true, 5);
        await insertSession('other-dead', true, 6);
        await dataSource.query(
            `UPDATE session SET "customFieldsActingparentsessionid" = '99' WHERE token IN ('mine-dead', 'other-dead')`,
        );
        await dataSource.query(
            `UPDATE session SET "customFieldsActingadministratorid" = '2' WHERE token = 'other-dead'`,
        );

        await limits(10, 3).enforceManagerCap(testRequestContext, '1');
        expect(await liveTokens()).toEqual(['other-dead']);

        await insertSession('mine-dead-2', true, 5);
        await dataSource.query(
            `UPDATE session SET "customFieldsActingparentsessionid" = '99' WHERE token = 'mine-dead-2'`,
        );
        await limits(10, 3).enforceCustomerCap(testRequestContext, '5');
        expect(await liveTokens()).toEqual(['other-dead']);
        expect(cacheDelete).toHaveBeenCalledWith('mine-dead-2');
    });
});
