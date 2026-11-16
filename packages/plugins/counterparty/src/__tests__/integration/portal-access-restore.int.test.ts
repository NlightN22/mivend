import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AccountRegistrationEvent } from '@vendure/core';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { CounterpartyPortalAccessService } from '../../counterparty-portal-access.service';
import { CounterpartyPortalRestoreService } from '../../counterparty-portal-restore.service';
import { loadPortalStates } from '../../counterparty-portal-state.sql';
import { Counterparty } from '../../entities/counterparty.entity';

const { schema, extra } = testSchemaOptions('portal_access_restore');
const counterparty = {
    id: '1',
    isActive: true,
    inn: '7700000001',
    fullName: 'Counterparty One',
};
let contactEmail: string;
let dataSource: DataSource;
let connection: TransactionalConnection;
let service: CounterpartyPortalAccessService;
let created: string[];
let tokenSetFor: number[];
let published: unknown[];

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE customer (id serial PRIMARY KEY,
        "customFieldsCounterpartyid" varchar, "userId" int, "emailAddress" varchar, "deletedAt" timestamp)`);
    await dataSource.query(`CREATE TABLE "user" (id serial PRIMARY KEY, identifier varchar,
        verified boolean DEFAULT false, "lastLogin" timestamp, "deletedAt" timestamp)`);
    await dataSource.query(`CREATE TABLE authentication_method (id serial PRIMARY KEY, "userId" int,
        type varchar, "passwordHash" varchar DEFAULT '', "passwordResetToken" varchar)`);
    await dataSource.query(`CREATE TABLE counterparty (id int PRIMARY KEY, "erpId" varchar,
        "shortName" varchar, inn varchar, "isActive" boolean)`);
    const base = createTestConnection(dataSource);
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: RequestContext, entity: unknown) =>
            entity === Counterparty
                ? { findOne: async () => counterparty }
                : base.getRepository(ctx, entity as never),
    } as unknown as TransactionalConnection;
    const em = (ctx: unknown) => (ctx as { em?: DataSource['manager'] }).em ?? dataSource.manager;
    const customerService = {
        create: async (ctx: unknown, input: { emailAddress: string }) => {
            await new Promise(resolve => setTimeout(resolve, 50));
            created.push(input.emailAddress);
            const user = await em(ctx).query(
                `INSERT INTO "user" (identifier) VALUES ($1) RETURNING id`,
                [input.emailAddress],
            );
            const rows = await em(ctx).query(
                `INSERT INTO customer ("customFieldsCounterpartyid", "userId", "emailAddress")
                 VALUES ($1, $2, $3) RETURNING id`,
                [counterparty.id, user[0].id, input.emailAddress],
            );
            return { id: rows[0].id };
        },
        softDelete: async (ctx: unknown, id: number) => {
            await em(ctx).query(`UPDATE customer SET "deletedAt" = now() WHERE id = $1`, [id]);
            await em(ctx).query(
                `UPDATE "user" SET "deletedAt" = now()
                 WHERE id = (SELECT "userId" FROM customer WHERE id = $1)`,
                [id],
            );
        },
        findOne: async (_ctx: unknown, id: number) => ({ id }),
    };
    const restore = new CounterpartyPortalRestoreService(
        connection,
        customerService as never,
        {
            getUserById: async (_ctx: unknown, id: number) => ({ id }),
            setVerificationToken: async (_ctx: unknown, user: { id: number }) => {
                tokenSetFor.push(user.id);
            },
        } as never,
        { publish: async (event: unknown) => published.push(event) } as never,
    );
    service = new CounterpartyPortalAccessService(
        connection,
        customerService as never,
        { assertCounterpartyWritable: async () => undefined } as never,
        {
            chosenContacts: async () =>
                new Map([[counterparty.id, { email: contactEmail, phone: '+10000000000' }]]),
        } as never,
        restore,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query('TRUNCATE customer, "user", authentication_method RESTART IDENTITY');
    contactEmail = 'office@example.com';
    created = [];
    tokenSetFor = [];
    published = [];
});

const ctx = {} as RequestContext;
const liveCount = async (): Promise<number> =>
    Number(
        (
            await dataSource.query(
                `SELECT count(*)::int AS n FROM customer WHERE "deletedAt" IS NULL`,
            )
        )[0].n,
    );

async function activateAndRevoke(): Promise<number> {
    const first = await service.activate(ctx, counterparty.id);
    await dataSource.query(
        `INSERT INTO authentication_method ("userId", type, "passwordHash", "passwordResetToken")
         VALUES ((SELECT "userId" FROM customer WHERE id = $1), 'NativeAuthenticationMethod', 'old-hash', 'old-token')`,
        [first.id],
    );
    await service.revoke(ctx, counterparty.id);
    return Number(first.id);
}

describe('portal access restore (real Postgres, #375)', () => {
    it('revoke then activate restores the same customer and sends a new set-password mail', async () => {
        const id = await activateAndRevoke();
        expect(await liveCount()).toBe(0);

        const restored = await service.activate(ctx, counterparty.id);

        expect(Number(restored.id)).toBe(id);
        expect(created).toEqual(['office@example.com']);
        expect(await liveCount()).toBe(1);
        const [user] = await dataSource.query(`SELECT "deletedAt" FROM "user"`);
        expect(user.deletedAt).toBeNull();
        const [method] = await dataSource.query(
            `SELECT "passwordHash", "passwordResetToken" FROM authentication_method`,
        );
        expect(method).toEqual({ passwordHash: '', passwordResetToken: null });
        expect(tokenSetFor).toHaveLength(1);
        expect(published.filter(e => e instanceof AccountRegistrationEvent)).toHaveLength(1);
    });

    it('a restored login that had signed in is invited again, not active', async () => {
        await activateAndRevoke();
        await dataSource.query(`UPDATE "user" SET "lastLogin" = now(), verified = true`);

        await service.activate(ctx, counterparty.id);

        const [user] = await dataSource.query(`SELECT "lastLogin" FROM "user"`);
        expect(user.lastLogin).toBeNull();
        const states = await loadPortalStates(connection, ctx, [counterparty.id]);
        expect(states.get(counterparty.id)).toBe('invited');
    });

    it('matches the contact e-mail without regard to case', async () => {
        const id = await activateAndRevoke();
        contactEmail = 'Office@Example.COM';
        expect(Number((await service.activate(ctx, counterparty.id)).id)).toBe(id);
    });

    it('creates a new login when the contact e-mail changed', async () => {
        const id = await activateAndRevoke();
        contactEmail = 'other@example.com';
        const fresh = await service.activate(ctx, counterparty.id);
        expect(Number(fresh.id)).not.toBe(id);
        expect(created).toEqual(['office@example.com', 'other@example.com']);
        expect(await liveCount()).toBe(1);
    });

    it('creates a new login when a live account now holds the e-mail', async () => {
        const id = await activateAndRevoke();
        await dataSource.query(
            `INSERT INTO customer ("customFieldsCounterpartyid", "emailAddress") VALUES ('2', 'office@example.com')`,
        );
        const fresh = await service.activate(ctx, counterparty.id);
        expect(Number(fresh.id)).not.toBe(id);
        expect(created).toEqual(['office@example.com', 'office@example.com']);
    });

    it('considers only the latest revoked login', async () => {
        await activateAndRevoke();
        contactEmail = 'other@example.com';
        const latest = await activateAndRevoke();
        contactEmail = 'office@example.com';
        const fresh = await service.activate(ctx, counterparty.id);
        expect(Number(fresh.id)).not.toBe(latest);
        expect(created.at(-1)).toBe('office@example.com');
    });

    it('never leaves two live logins when activations race over a revoked one', async () => {
        await activateAndRevoke();
        const results = await Promise.allSettled([
            service.activate(ctx, counterparty.id),
            service.activate(ctx, counterparty.id),
        ]);
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
        expect(await liveCount()).toBe(1);
    });

    it('a revoke racing an activation leaves at most one live login', async () => {
        await activateAndRevoke();
        await Promise.allSettled([
            service.activate(ctx, counterparty.id),
            service.revoke(ctx, counterparty.id),
        ]);
        expect(await liveCount()).toBeLessThanOrEqual(1);
    });
});
