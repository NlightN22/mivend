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
const NOW = new Date('2026-11-07T12:00:00.000Z');
const retention = { handledDays: 90, unreadDays: 365 };
let dataSource: DataSource;
let service: NotificationRetentionService;

function daysAgo(days: number): Date {
    return new Date(NOW.getTime() - days * 86_400_000);
}

async function insert(title: string, status: string, updatedAt: Date): Promise<void> {
    await dataSource.query(
        `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
         VALUES ('administrator-broadcast', 'info', 'test', $1, 'x', $2, $3)`,
        [title, status, updatedAt],
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
        await insert('read-old', 'read', daysAgo(91));
        await insert('resolved-old', 'resolved', daysAgo(91));
        await insert('unread-old', 'unread', daysAgo(366));
        await insert('read-fresh', 'read', daysAgo(89));
        await insert('unread-90d', 'unread', daysAgo(200));
        await insert('unread-fresh', 'unread', daysAgo(1));

        expect(await service.deleteExpired(ctx, retention, NOW)).toBe(3);
        expect(await titles()).toEqual(['read-fresh', 'unread-90d', 'unread-fresh']);
    });

    it('works through more rows than one batch and is safe to run again', async () => {
        await dataSource.query(
            `INSERT INTO notification ("recipientType", kind, "sourceType", title, message, status, "updatedAt")
             SELECT 'administrator-broadcast', 'info', 'test', 'bulk-' || g, 'x', 'read', $1 FROM generate_series(1, 2500) g`,
            [daysAgo(120)],
        );
        await insert('keep', 'read', daysAgo(1));

        expect(await service.deleteExpired(ctx, retention, NOW)).toBe(2500);
        expect(await service.deleteExpired(ctx, retention, NOW)).toBe(0);
        expect(await titles()).toEqual(['keep']);
    });

    it('two cleanups running at once delete every expired row exactly once', async () => {
        for (let i = 0; i < 5; i++) await insert(`old-${i}`, 'read', daysAgo(120));

        const [a, b] = await Promise.all([
            service.deleteExpired(ctx, retention, NOW),
            service.deleteExpired(ctx, retention, NOW),
        ]);

        expect(a + b).toBe(5);
        expect(await titles()).toEqual([]);
    });
});
