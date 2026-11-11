import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { ListQueryBuilder, ProcessContext, RequestContext } from '@vendure/core';
import {
    createTestSchema,
    createTestConnection,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { NotificationRetentionRuleService } from '../../../notification-retention-rule.service';
import { NotificationRetentionService } from '../../../notification-retention.service';

const { schema, extra } = testSchemaOptions('notification_retention');
let dataSource: DataSource;
let service: NotificationRetentionService;
let rules: NotificationRetentionRuleService;
const ctx = {} as RequestContext;

async function insert(
    title: string,
    status: string,
    daysOld: number,
    sourceType = 'test',
): Promise<void> {
    await dataSource.query(
        `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
         VALUES ('administrator-broadcast', 'info', $4, $1, 'x', $2, now() - make_interval(days => $3))`,
        [title, status, daysOld, sourceType],
    );
}

async function titles(): Promise<string[]> {
    const rows = await dataSource.query(`SELECT title FROM notification ORDER BY title`);
    return rows.map((r: { title: string }) => r.title);
}

async function setRule(
    sourceType: string,
    readDays: number | null,
    unreadDays: number | null,
): Promise<void> {
    await dataSource.query(
        `UPDATE notification_retention_rule SET "readDays" = $2, "unreadDays" = $3 WHERE "sourceType" = $1`,
        [sourceType, readDays, unreadDays],
    );
}

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(`CREATE TABLE notification (
        id serial primary key, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now(),
        "recipientType" varchar not null, "recipientId" varchar, kind varchar not null, "sourceType" varchar not null,
        title varchar not null, message text not null, status varchar not null default 'unread')`);
    await dataSource.query(`CREATE TABLE notification_retention_rule (
        id serial primary key, "createdAt" timestamp not null default now(), "updatedAt" timestamp not null default now(),
        uuid uuid not null unique, "sourceType" varchar not null unique, "readDays" int, "unreadDays" int)`);
    const connection = createTestConnection(dataSource);
    rules = new NotificationRetentionRuleService(
        connection,
        {} as ListQueryBuilder,
        {} as ProcessContext,
    );
    service = new NotificationRetentionService(connection, rules);
});

afterEach(async () => {
    await dataSource.query(`TRUNCATE notification, notification_retention_rule`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('NotificationRetentionService.deleteExpired (component, real Postgres)', () => {
    it('applies the seeded default (90/365) and the client override (7/30), keeps the rest', async () => {
        await insert('read-old', 'read', 91);
        await insert('resolved-old', 'resolved', 91);
        await insert('unread-old', 'unread', 366);
        await insert('read-fresh', 'read', 89);
        await insert('unread-200d', 'unread', 200);
        await insert('client-read-old', 'read', 8, 'client');
        await insert('client-read-fresh', 'read', 6, 'client');
        await insert('client-unread-old', 'unread', 31, 'client');
        await insert('client-unread-fresh', 'unread', 29, 'client');

        expect(await service.deleteExpired(ctx)).toBe(5);
        expect(await titles()).toEqual([
            'client-read-fresh',
            'client-unread-fresh',
            'read-fresh',
            'unread-200d',
        ]);
    });

    it('creates a rule row for a source type it first sees, inheriting the default', async () => {
        await insert('a', 'read', 1, 'order.shipped');

        await service.deleteExpired(ctx);

        const row = await dataSource.query(
            `SELECT "readDays", "unreadDays" FROM notification_retention_rule WHERE "sourceType" = 'order.shipped'`,
        );
        expect(row).toEqual([{ readDays: null, unreadDays: null }]);
    });

    it('uses a staff override for its type only and the default for a type with null days', async () => {
        await service.deleteExpired(ctx);
        await insert('seen-a', 'read', 1, 'type-a');
        await insert('seen-b', 'read', 1, 'type-b');
        await service.deleteExpired(ctx);
        await setRule('type-a', 10, null);
        await dataSource.query(`TRUNCATE notification`);
        await insert('a-read-11d', 'read', 11, 'type-a');
        await insert('a-unread-100d', 'unread', 100, 'type-a');
        await insert('b-read-11d', 'read', 11, 'type-b');
        await insert('b-read-91d', 'read', 91, 'type-b');

        expect(await service.deleteExpired(ctx)).toBe(2);
        expect(await titles()).toEqual(['a-unread-100d', 'b-read-11d']);
    });

    it('reads the periods from the database on every run', async () => {
        await insert('read-50d', 'read', 50);
        expect(await service.deleteExpired(ctx)).toBe(0);

        await setRule('*', 30, 365);

        expect(await service.deleteExpired(ctx)).toBe(1);
    });

    it('does not overwrite a staff edit of a seeded rule when it seeds again', async () => {
        await service.deleteExpired(ctx);
        await setRule('client', 3, 9);

        await service.deleteExpired(ctx);
        await rules.seedDefaults(ctx);

        const row = await dataSource.query(
            `SELECT "readDays", "unreadDays" FROM notification_retention_rule WHERE "sourceType" = 'client'`,
        );
        expect(row).toEqual([{ readDays: 3, unreadDays: 9 }]);
    });

    it('deletes nothing when the default rule has no days', async () => {
        await service.deleteExpired(ctx);
        await dataSource.query(
            `UPDATE notification_retention_rule SET "readDays" = NULL WHERE "sourceType" = '*'`,
        );
        await insert('ancient', 'read', 2000);

        expect(await service.deleteExpired(ctx)).toBe(0);
        expect(await titles()).toEqual(['ancient']);
    });

    it('works through more rows than one batch, stops at the per-run bound and is safe to run again', async () => {
        await dataSource.query(
            `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
             SELECT 'administrator-broadcast', 'info', 'client', 'bulk-' || g, 'x', 'read', now() - interval '20 days'
             FROM generate_series(1, 2500) g`,
        );
        await insert('keep', 'read', 1);

        expect(await service.deleteExpired(ctx, 2)).toBe(2000);
        expect(await service.deleteExpired(ctx)).toBe(500);
        expect(await service.deleteExpired(ctx)).toBe(0);
        expect(await titles()).toEqual(['keep']);
    });

    it('two cleanups running at once over several batches delete every expired row exactly once', async () => {
        await dataSource.query(
            `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
             SELECT 'administrator-broadcast', 'info', 'test', 'old-' || g, 'x', 'read', now() - interval '120 days'
             FROM generate_series(1, 2500) g`,
        );

        const [a, b] = await Promise.all([service.deleteExpired(ctx), service.deleteExpired(ctx)]);

        expect(a + b).toBe(2500);
        expect(await titles()).toEqual([]);
    });

    it('skips a row another transaction holds locked instead of waiting for it', async () => {
        await insert('locked-old', 'read', 120);
        await insert('free-old', 'read', 120);
        const holder = dataSource.createQueryRunner();
        await holder.startTransaction();
        try {
            await holder.query(`SELECT 1 FROM notification WHERE title = 'locked-old' FOR UPDATE`);

            expect(await service.deleteExpired(ctx)).toBe(1);
            expect(await titles()).toEqual(['locked-old']);
        } finally {
            await holder.rollbackTransaction();
            await holder.release();
        }
        expect(await service.deleteExpired(ctx)).toBe(1);
    });
});
