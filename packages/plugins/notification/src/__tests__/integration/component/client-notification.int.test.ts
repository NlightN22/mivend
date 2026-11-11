import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { ClientNotificationService } from '../../../client-notification.service';
import { NotificationService } from '../../../notification.service';
import { NotificationRetentionService } from '../../../notification-retention.service';
import { NotificationRetentionRuleService } from '../../../notification-retention-rule.service';
import { Notification } from '../../../entities/notification.entity';
import { NotificationRetentionRule } from '../../../entities/notification-retention-rule.entity';
import { RATE_LIMIT_PER_WINDOW } from '../../../client-notification-rules';

// Standalone DataSource cannot use the Vendure entity class; mirror its table (see scoping test).
@Entity('notification')
@Index(['sourceType', 'sourceId'])
class TestNotification {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) recipientType!: string;
    @Column({ type: 'varchar', nullable: true }) recipientId!: string | null;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'varchar', nullable: true }) sourceId!: string | null;
    @Column({ type: 'varchar', nullable: true }) orderId!: string | null;
    @Column({ type: 'varchar' }) title!: string;
    @Column({ type: 'text' }) message!: string;
    @Column({ type: 'varchar', default: 'unread' }) status!: string;
    @Column({ type: 'timestamp', nullable: true }) readAt!: Date | null;
    @Column({ type: 'timestamp', nullable: true }) resolvedAt!: Date | null;
    @Column({ type: 'varchar', nullable: true }) resolution!: string | null;
}

@Entity('notification_retention_rule')
class TestRetentionRule {
    @PrimaryGeneratedColumn('uuid') id!: string;
    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'uuid', unique: true }) uuid!: string;
    @Column({ type: 'varchar', unique: true }) sourceType!: string;
    @Column({ type: 'int', nullable: true }) readDays!: number | null;
    @Column({ type: 'int', nullable: true }) unreadDays!: number | null;
}

const { schema, extra } = testSchemaOptions('client_notification');
let dataSource: DataSource;
let service: ClientNotificationService;
let notifications: NotificationService;
let retention: NotificationRetentionService;
const published: unknown[] = [];

const alice = { recipientType: 'customer' as const, recipientId: 'alice' };
const bob = { recipientType: 'customer' as const, recipientId: 'bob' };
const admin1 = { recipientType: 'administrator' as const, recipientId: 'alice' };
const ctx = testRequestContext;
const popup = { kind: 'error' as const, title: 'Saved', message: 'Could not save' };

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestNotification, TestRetentionRule],
        synchronize: true,
    });
    await dataSource.initialize();
    const connection = createTestConnection(dataSource);
    // The shim maps any entity class registered in the DataSource; route the Vendure class to the mirror.
    const mapped = {
        ...connection,
        getRepository: (c: never, entity: unknown) =>
            (connection.getRepository as (c: unknown, e: unknown) => unknown)(
                c,
                entity === Notification
                    ? TestNotification
                    : entity === NotificationRetentionRule
                      ? TestRetentionRule
                      : entity,
            ),
    } as unknown as typeof connection;
    notifications = new NotificationService(mapped, {
        publish: async (_t: string, payload: unknown) => void published.push(payload),
    } as never);
    service = new ClientNotificationService(mapped, notifications, {
        get: async () => null,
    } as never);
    retention = new NotificationRetentionService(
        mapped,
        new NotificationRetentionRuleService(mapped, {} as never, {} as never),
    );
});

afterEach(async () => {
    published.length = 0;
    await dataSource.query('TRUNCATE notification, notification_retention_rule');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function unreadCount(recipient: typeof alice): Promise<number> {
    const page = await notifications.findForRecipient(
        { userHasPermissions: () => true } as never,
        recipient.recipientType,
        recipient.recipientId,
        { status: 'unread', take: 0 },
    );
    return page.totalItems;
}

describe('ClientNotificationService.record (component, real Postgres)', () => {
    it('stores the popup for the caller with the client origin marker and pushes it live', async () => {
        const row = await service.record(ctx, alice, popup);

        expect(row).toMatchObject({ ...popup, sourceType: 'client', status: 'unread' });
        expect(row.recipientId).toBe('alice');
        expect(published).toHaveLength(1);
    });

    it("keeps each user's rows private: another customer and an administrator with the same id see none", async () => {
        await service.record(ctx, alice, popup);
        await service.record(ctx, admin1, { ...popup, message: 'Admin only' });

        const ctxAny = { userHasPermissions: () => true } as never;
        const bobs = await notifications.findForRecipient(ctxAny, 'customer', 'bob');
        const aliceRows = await notifications.findForRecipient(ctxAny, 'customer', 'alice');
        const adminRows = await notifications.findForRecipient(ctxAny, 'administrator', 'alice');

        expect(bobs.totalItems).toBe(0);
        expect(aliceRows.items.map(n => n.message)).toEqual(['Could not save']);
        expect(adminRows.items.map(n => n.message)).toEqual(['Admin only']);
    });

    it('collapses an identical popup of the same user within the window, but not another user or text', async () => {
        const first = await service.record(ctx, alice, popup);
        const again = await service.record(ctx, alice, { ...popup, message: ' Could not save ' });
        await service.record(ctx, alice, { ...popup, message: 'Other text' });
        await service.record(ctx, alice, { ...popup, kind: 'warning' });
        await service.record(ctx, bob, popup);

        expect(again.id).toBe(first.id);
        const rows = await dataSource.query('SELECT "recipientId" FROM notification');
        expect(rows).toHaveLength(4);
        expect(published).toHaveLength(4);
    });

    it('stores a popup again once the previous identical one is older than the window', async () => {
        await service.record(ctx, alice, popup);
        await dataSource.query(
            `UPDATE notification SET "createdAt" = now() - interval '2 minutes'`,
        );

        await service.record(ctx, alice, popup);

        expect(await dataSource.query('SELECT 1 FROM notification')).toHaveLength(2);
    });

    it('two concurrent identical calls store exactly one row', async () => {
        const results = await Promise.all(
            Array.from({ length: 8 }, () => service.record(ctx, alice, popup)),
        );

        expect(new Set(results.map(r => r.id)).size).toBe(1);
        expect(await dataSource.query('SELECT 1 FROM notification')).toHaveLength(1);
    });

    it('rate-limits one user per window without affecting another user', async () => {
        for (let i = 0; i < RATE_LIMIT_PER_WINDOW; i++) {
            await service.record(ctx, alice, { ...popup, message: `m${i}` });
        }

        await expect(service.record(ctx, alice, { ...popup, message: 'one more' })).rejects.toThrow(
            /Too many/,
        );
        await expect(service.record(ctx, bob, popup)).resolves.toBeDefined();
        expect(await dataSource.query('SELECT 1 FROM notification')).toHaveLength(
            RATE_LIMIT_PER_WINDOW + 1,
        );
    });

    it('concurrent distinct calls never exceed the rate limit', async () => {
        const results = await Promise.allSettled(
            Array.from({ length: RATE_LIMIT_PER_WINDOW + 10 }, (_, i) =>
                service.record(ctx, alice, { ...popup, message: `c${i}` }),
            ),
        );

        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(RATE_LIMIT_PER_WINDOW);
        expect(await dataSource.query('SELECT 1 FROM notification')).toHaveLength(
            RATE_LIMIT_PER_WINDOW,
        );
    });

    it('rejects oversized input and stores nothing', async () => {
        await expect(
            service.record(ctx, alice, { ...popup, message: 'x'.repeat(1001) }),
        ).rejects.toThrow();
        expect(await dataSource.query('SELECT 1 FROM notification')).toHaveLength(0);
    });
});

describe('retention and the unread count', () => {
    it('expiry removes only rows past retention, so the unread count equals the surviving unread rows', async () => {
        await service.record(ctx, alice, { ...popup, message: 'old unread' });
        await service.record(ctx, alice, { ...popup, message: 'old read' });
        await service.record(ctx, alice, { ...popup, message: 'fresh unread' });
        await service.record(ctx, alice, { ...popup, message: 'fresh read' });
        await dataSource.query(
            `UPDATE notification SET "updatedAt" = now() - interval '31 days' WHERE message = 'old unread'`,
        );
        await dataSource.query(
            `UPDATE notification SET status = 'read', "updatedAt" = now() - interval '8 days' WHERE message = 'old read'`,
        );
        await dataSource.query(
            `UPDATE notification SET status = 'read' WHERE message = 'fresh read'`,
        );
        expect(await unreadCount(alice)).toBe(2);

        const deleted = await retention.deleteExpired(ctx);

        expect(deleted).toBe(2);
        expect(await unreadCount(alice)).toBe(1);
        const page = await notifications.findForRecipient({} as never, 'customer', 'alice');
        expect(page.totalItems).toBe(2);
        expect(page.items.map(n => n.message).sort()).toEqual(['fresh read', 'fresh unread']);
    });
});
