import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { NotificationService } from '../../../notification.service';

// Vendure's VendureEntity relies on an EntityIdStrategy registered during bootstrap() to generate
// its primary column — a standalone DataSource can't use the real Notification class directly
// (confirmed empirically, same constraint plugin-documents's own
// documents.service.int.test.ts hit and documented). Mirror table matching the production schema
// instead, same approach.
@Entity('notification')
@Index(['sourceType', 'sourceId'])
class TestNotification {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column({ type: 'timestamp', default: () => 'now()' }) createdAt!: Date;
    @Column({ type: 'timestamp', default: () => 'now()' }) updatedAt!: Date;
    @Column({ type: 'varchar' }) recipientType!: string;
    @Column({ type: 'varchar' }) recipientId!: string;
    @Column({ type: 'varchar' }) kind!: string;
    @Column({ type: 'varchar' }) sourceType!: string;
    @Column({ type: 'varchar', nullable: true }) sourceId!: string | null;
    @Column({ type: 'varchar' }) title!: string;
    @Column({ type: 'text' }) message!: string;
    @Column({ type: 'varchar', default: 'unread' }) status!: string;
    @Column({ type: 'timestamp', nullable: true }) readAt!: Date | null;
    @Column({ type: 'timestamp', nullable: true }) resolvedAt!: Date | null;
    @Column({ type: 'varchar', nullable: true }) resolution!: string | null;
}

let dataSource: DataSource;
let notificationService: NotificationService;

const { schema, extra } = testSchemaOptions('notification_scoping');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestNotification],
        synchronize: true,
    });
    await dataSource.initialize();

    const connectionShim = {
        getRepository: () => dataSource.getRepository(TestNotification),
    } as unknown as TransactionalConnection;
    notificationService = new NotificationService(connectionShim, {
        publish: async () => undefined,
    } as never);
});

afterEach(async () => {
    await dataSource.getRepository(TestNotification).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('NotificationService.findForRecipient (component, real Postgres)', () => {
    it("only returns the calling recipient's own notifications, never another administrator's or a customer's", async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-1',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'res-1',
            title: 'For admin 1',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-2',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'res-2',
            title: 'For admin 2',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'customer',
            recipientId: 'admin-1',
            kind: 'info',
            sourceType: 'order.shipped',
            sourceId: 'order-1',
            title: "For a customer sharing admin-1's id",
            message: 'x',
        });

        const own = await notificationService.findForRecipient(
            {} as never,
            'administrator',
            'admin-1',
        );

        expect(own).toHaveLength(1);
        expect(own[0].title).toBe('For admin 1');
    });

    it('filters by status without crossing recipients', async () => {
        const unread = await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-3',
            kind: 'warning',
            sourceType: 'stock.low',
            sourceId: 'variant-1',
            title: 'Low stock',
            message: 'x',
        });
        await notificationService.markRead({} as never, String(unread.id));
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-3',
            kind: 'warning',
            sourceType: 'stock.low',
            sourceId: 'variant-2',
            title: 'Low stock 2',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-4',
            kind: 'warning',
            sourceType: 'stock.low',
            sourceId: 'variant-3',
            title: 'Not for admin-3',
            message: 'x',
        });

        const unreadForAdmin3 = await notificationService.findForRecipient(
            {} as never,
            'administrator',
            'admin-3',
            { status: 'unread' },
        );

        expect(unreadForAdmin3).toHaveLength(1);
        expect(unreadForAdmin3[0].sourceId).toBe('variant-2');
    });
});
