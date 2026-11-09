import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
import { ActingTicketService, hashTicket } from '../../acting-ticket.service';

const { schema, extra } = testSchemaOptions('acting_limit');
let dataSource: DataSource;

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
        `INSERT INTO session (token, type, invalidated, expires, "customFieldsActingadministratorid", "userId")
         VALUES ($1, 'AuthenticatedSession', false, $2, $3, $4)`,
        [token, new Date(Date.now() + 86_400_000), acting ? '1' : null, userId],
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
            "customFieldsActingadministratorid" varchar, "userId" int);
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
    await dataSource.query('TRUNCATE session, acting_ticket RESTART IDENTITY');
});

describe('ActingLimitService (real Postgres)', () => {
    const limits = (maxPerManager = 2, maxPerCustomer = 1) =>
        new ActingLimitService(createTestConnection(dataSource), {
            storefrontPublicUrl: '',
            maxPerManager,
            maxPerCustomer,
        });

    it('counts live acting sessions and unused tickets of the manager, not used, expired or foreign ones', async () => {
        await insertSession('a1', true);
        await insertTicket('pending', 60_000);
        await insertTicket('used', 60_000, new Date());
        await insertTicket('expired', -60_000);
        await insertSession('plain', false);

        await expect(
            limits(3).assertManagerBelowCap(testRequestContext, '1'),
        ).resolves.toBeUndefined();
        await expect(limits(2).assertManagerBelowCap(testRequestContext, '1')).rejects.toThrow(
            /Too many/,
        );
        await expect(
            limits(2).assertManagerBelowCap(testRequestContext, '2'),
        ).resolves.toBeUndefined();
    });

    it('caps live acting sessions per customer user and ignores their own sessions', async () => {
        await insertSession('own', false, 5);
        await expect(
            limits().assertCustomerBelowCap(testRequestContext, '5'),
        ).resolves.toBeUndefined();
        await insertSession('act', true, 5);
        await expect(limits().assertCustomerBelowCap(testRequestContext, '5')).rejects.toThrow(
            /too many/,
        );
        await expect(
            limits().assertCustomerBelowCap(testRequestContext, '6'),
        ).resolves.toBeUndefined();
    });

    it('lets only the cap number of parallel starts of one manager through under the manager lock', async () => {
        const connection = createTestConnection(dataSource);
        const service = limits(3);
        const start = (n: number) =>
            withAggregateLock(connection, testRequestContext, 'acting-manager:1', async ctx => {
                await service.assertManagerBelowCap(ctx, '1');
                await new ActingTicketService(connection, { storefrontPublicUrl: '' }).issue(ctx, {
                    administratorId: '1',
                    parentSessionId: '10',
                    counterpartyId: `cp-${n}`,
                    customerId: 'cu-1',
                    tradingPointId: null,
                });
            });

        const results = await Promise.allSettled(Array.from({ length: 8 }, (_, n) => start(n)));

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    });
});
