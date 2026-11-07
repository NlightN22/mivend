import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { NotificationRetentionService } from '../../../notification-retention.service';

const { schema, extra } = testSchemaOptions('notification_retention');
const retention = { handledDays: 90, unreadDays: 365 };
let dataSource: DataSource;
let service: NotificationRetentionService;

async function insert(title: string, status: string, daysOld: number): Promise<void> {
    await dataSource.query(
        `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
         VALUES ('administrator-broadcast', 'info', 'test', $1, 'x', $2, now() - make_interval(days => $3))`,
        [title, status, daysOld],
    );
}

async function titles(): Promise<string[]> {
    const rows = await dataSource.query(`SELECT title FROM notification ORDER BY title`);
    return rows.map((r: { title: string }) => r.title);
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
    const connection = {
        getRepository: () => ({ query: (sql: string, p?: unknown[]) => dataSource.query(sql, p) }),
    } as unknown as TransactionalConnection;
    service = new NotificationRetentionService(connection);
});

afterEach(async () => {
    await dataSource.query(`TRUNCATE notification`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const ctx = {} as RequestContext;

describe('NotificationRetentionService.deleteExpired (component, real Postgres)', () => {
    it('deletes read and resolved rows past 90 days and unread rows past 365 days, keeps the rest', async () => {
        await insert('read-old', 'read', 91);
        await insert('resolved-old', 'resolved', 91);
        await insert('unread-old', 'unread', 366);
        await insert('read-fresh', 'read', 89);
        await insert('unread-90d', 'unread', 200);
        await insert('unread-fresh', 'unread', 1);

        expect(await service.deleteExpired(ctx, retention)).toBe(3);
        expect(await titles()).toEqual(['read-fresh', 'unread-90d', 'unread-fresh']);
    });

    it('works through more rows than one batch and is safe to run again', async () => {
        await dataSource.query(
            `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
             SELECT 'administrator-broadcast', 'info', 'test', 'bulk-' || g, 'x', 'read', now() - make_interval(days => $1) FROM generate_series(1, 2500) g`,
            [120],
        );
        await insert('keep', 'read', 1);

        expect(await service.deleteExpired(ctx, retention)).toBe(2500);
        expect(await service.deleteExpired(ctx, retention)).toBe(0);
        expect(await titles()).toEqual(['keep']);
    });

    it('two cleanups running at once over several batches delete every expired row exactly once', async () => {
        await dataSource.query(
            `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
             SELECT 'administrator-broadcast', 'info', 'test', 'old-' || g, 'x', 'read', now() - interval '120 days'
             FROM generate_series(1, 2500) g`,
        );

        const [a, b] = await Promise.all([
            service.deleteExpired(ctx, retention),
            service.deleteExpired(ctx, retention),
        ]);

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

            expect(await service.deleteExpired(ctx, retention)).toBe(1);
            expect(await titles()).toEqual(['locked-old']);
        } finally {
            await holder.rollbackTransaction();
            await holder.release();
        }
        expect(await service.deleteExpired(ctx, retention)).toBe(1);
    });
});
