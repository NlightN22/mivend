import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext, TransactionalConnection } from '@vendure/core';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { NotificationService } from '../../../notification.service';

// findForRecipient's administrator path now calls ctx.userHasPermissions() to gate broadcast
// sourceTypes (issue #87 audit, mivend.audit.85) — a fake ctx exposing that one method is enough
// for this suite, which never touches any other RequestContext behavior. Default: every
// permission granted, matching the pre-fix "any administrator sees every broadcast" behavior, so
// existing scoping assertions in this file don't have to know about the new gate unless they are
// specifically testing it.
function fakeAdminCtx(grantedPermissions: string[] | 'all' = 'all'): RequestContext {
    return {
        userHasPermissions: (permissions: string[]) =>
            grantedPermissions === 'all' || permissions.some(p => grantedPermissions.includes(p)),
    } as unknown as RequestContext;
}

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
    @Column({ type: 'varchar', nullable: true }) recipientId!: string | null;
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
            fakeAdminCtx(),
            'administrator',
            'admin-1',
        );

        expect(own.items).toHaveLength(1);
        expect(own.items[0].title).toBe('For admin 1');
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
            fakeAdminCtx(),
            'administrator',
            'admin-3',
            { status: 'unread' },
        );

        expect(unreadForAdmin3.items).toHaveLength(1);
        expect(unreadForAdmin3.items[0].sourceId).toBe('variant-2');
    });
});

// issue #87 Part 2 / #42: broadcast-to-all-administrators recipient model.
describe('NotificationService.findForRecipient — administrator-broadcast (component, real Postgres)', () => {
    it('an administrator query returns both their own rows and every broadcast row', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-5',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'res-5',
            title: 'Own notification',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'res-6',
            title: 'Broadcast notification',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-6',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'res-7',
            title: 'Another admin only',
            message: 'x',
        });

        const forAdmin5 = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-5',
        );

        const titles = forAdmin5.items.map(n => n.title).sort();
        expect(titles).toEqual(['Broadcast notification', 'Own notification']);
    });

    it('never leaks a broadcast row into a customer recipientType query', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'res-8',
            title: 'Broadcast notification',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'customer',
            recipientId: 'admin-5',
            kind: 'info',
            sourceType: 'order.shipped',
            sourceId: 'order-9',
            title: 'For customer sharing id admin-5',
            message: 'x',
        });

        const forCustomer = await notificationService.findForRecipient(
            {} as never,
            'customer',
            'admin-5',
        );

        expect(forCustomer.items).toHaveLength(1);
        expect(forCustomer.items[0].title).toBe('For customer sharing id admin-5');
    });

    it('a repeated broadcast create() for the same source updates one shared row (no fan-out)', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'res-10',
            title: 'First',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'res-10',
            title: 'Second',
            message: 'x',
        });

        const rows = await dataSource
            .getRepository(TestNotification)
            .find({ where: { sourceType: 'reservation-intervention', sourceId: 'res-10' } });

        expect(rows).toHaveLength(1);
        expect(rows[0].title).toBe('Second');
    });

    it('resolving a broadcast notification affects the single shared row for every administrator', async () => {
        const created = await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'res-11',
            title: 'Shared state check',
            message: 'x',
        });

        await notificationService.resolve({} as never, String(created.id), 'handled by admin-A');

        const forAnyAdmin = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-does-not-matter',
        );
        const resolved = forAnyAdmin.items.find(n => n.sourceId === 'res-11');
        expect(resolved?.status).toBe('resolved');
        expect(resolved?.resolution).toBe('handled by admin-A');
    });
});

// issue #87 audit (mivend.audit.85): broadcast visibility must be permission-scoped by
// sourceType, not just authentication-scoped — an administrator lacking the resource's own read
// permission must not see that sourceType's broadcast rows at all.
describe('NotificationService.findForRecipient — broadcast permission scoping (component, real Postgres)', () => {
    it('excludes a gated broadcast sourceType when the caller lacks its permission', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'perm-1',
            title: 'Reservation intervention broadcast',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'payment-reconciliation',
            sourceId: 'perm-2',
            title: 'Payment reconciliation broadcast',
            message: 'x',
        });

        const withNoPermissions = await notificationService.findForRecipient(
            fakeAdminCtx([]),
            'administrator',
            'admin-no-perms',
        );

        expect(withNoPermissions.items).toHaveLength(0);
    });

    it('includes only the gated sourceTypes the caller actually has permission for', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'perm-3',
            title: 'Reservation intervention broadcast',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'payment-reconciliation',
            sourceId: 'perm-4',
            title: 'Payment reconciliation broadcast',
            message: 'x',
        });

        const withOnlyReadOrder = await notificationService.findForRecipient(
            fakeAdminCtx(['ReadOrder']),
            'administrator',
            'admin-read-order-only',
        );

        expect(withOnlyReadOrder.items.map(n => n.sourceId)).toEqual(['perm-3']);
    });

    it('never excludes an ungated broadcast sourceType, regardless of permissions', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'info',
            sourceType: 'some-future-broadcast-type',
            sourceId: 'perm-5',
            title: 'Ungated broadcast',
            message: 'x',
        });

        const withNoPermissions = await notificationService.findForRecipient(
            fakeAdminCtx([]),
            'administrator',
            'admin-no-perms-2',
        );

        expect(withNoPermissions.items.map(n => n.sourceId)).toContain('perm-5');
    });
});

// mivend.audit.85 (second pass): pagination (skip/take/MAX_LIST_TAKE clamp) was added in the same
// commit as the broadcast permission gating above but was never itself asserted — neither the
// ordering/slicing, the clamp, nor totalItems' interaction with the gating's SQL-level Brackets
// exclusion. Direct-repo inserts (bypassing notificationService.create) are used here specifically
// to control createdAt explicitly, since findForRecipient orders by createdAt DESC, id DESC and
// notificationService.create always stamps "now()" — insertion order alone isn't a reliable proxy
// for query order at this resolution.
describe('NotificationService.findForRecipient — pagination (component, real Postgres)', () => {
    async function insertNotification(overrides: Partial<TestNotification>): Promise<void> {
        await dataSource.getRepository(TestNotification).save(
            dataSource.getRepository(TestNotification).create({
                recipientType: 'administrator',
                recipientId: 'admin-page',
                kind: 'info',
                sourceType: 'reservation.expiring',
                sourceId: 'x',
                title: 'x',
                message: 'x',
                status: 'unread',
                readAt: null,
                resolvedAt: null,
                resolution: null,
                ...overrides,
            }),
        );
    }

    it('skip/take return the correct slice in createdAt DESC order, not a reshuffled one', async () => {
        const base = new Date('2026-01-01T00:00:00Z').getTime();
        for (let i = 1; i <= 5; i++) {
            await insertNotification({
                sourceId: `page-${i}`,
                title: `N${i}`,
                createdAt: new Date(base + i * 1000),
            });
        }

        // Newest-first order is N5, N4, N3, N2, N1 — take:2 skip:2 should land on N3, N2.
        const page = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-page',
            { take: 2, skip: 2 },
        );

        expect(page.items.map(n => n.title)).toEqual(['N3', 'N2']);
        expect(page.totalItems).toBe(5);
    });

    it('clamps take above MAX_LIST_TAKE (100) instead of returning every row', async () => {
        const base = new Date('2026-02-01T00:00:00Z').getTime();
        for (let i = 1; i <= 105; i++) {
            await insertNotification({
                sourceId: `clamp-${i}`,
                title: `C${i}`,
                createdAt: new Date(base + i * 1000),
            });
        }

        const page = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-page',
            { take: 500 },
        );

        expect(page.items).toHaveLength(100);
        expect(page.totalItems).toBe(105);
    });

    it('totalItems counts only rows visible to the caller, excluding gated broadcasts they lack permission for', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-total',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'total-own-1',
            title: 'Own 1',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-total',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'total-own-2',
            title: 'Own 2',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'info',
            sourceType: 'some-future-broadcast-type',
            sourceId: 'total-ungated',
            title: 'Ungated broadcast',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'reservation-intervention',
            sourceId: 'total-allowed',
            title: 'Allowed gated broadcast',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator-broadcast',
            kind: 'error',
            sourceType: 'payment-reconciliation',
            sourceId: 'total-denied',
            title: 'Denied gated broadcast',
            message: 'x',
        });

        const page = await notificationService.findForRecipient(
            fakeAdminCtx(['ReadOrder']),
            'administrator',
            'admin-total',
        );

        // 2 own + 1 ungated + 1 allowed gated (ReadOrder) = 4, excluding the ReadPayment-gated row
        // — totalItems must reflect the SQL-level Brackets exclusion, not the raw table count (5).
        expect(page.totalItems).toBe(4);
        expect(page.items.map(n => n.sourceId).sort()).toEqual(
            ['total-allowed', 'total-own-1', 'total-own-2', 'total-ungated'].sort(),
        );
    });

    // mivend.issue.90 audit (LOW): a negative take/skip previously reached TypeORM as-is
    // (`LIMIT -1`/`OFFSET -1`), which Postgres rejects as a syntax error — a raw 500 instead of a
    // clean, empty-safe page.
    it('clamps a negative take/skip instead of passing them through to the query', async () => {
        for (let i = 1; i <= 3; i++) {
            await insertNotification({ sourceId: `neg-${i}`, title: `NEG${i}` });
        }

        const negativeTake = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-page',
            { take: -1 },
        );
        expect(negativeTake.items.length).toBeGreaterThanOrEqual(0);

        const negativeSkip = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-page',
            { skip: -1 },
        );
        expect(negativeSkip.items.length).toBeGreaterThanOrEqual(0);
    });
});

// issue #92: the full notifications page's search box.
describe('NotificationService.findForRecipient — search (component, real Postgres)', () => {
    it('matches title case-insensitively, scoped to the caller as usual', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-search',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'search-1',
            title: 'Reservation RES-100 expiring soon',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-search',
            kind: 'info',
            sourceType: 'stock.low',
            sourceId: 'search-2',
            title: 'Low stock: SKU-42',
            message: 'x',
        });
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-other',
            kind: 'info',
            sourceType: 'reservation.expiring',
            sourceId: 'search-3',
            title: 'Reservation RES-999 expiring soon',
            message: 'x',
        });

        const page = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-search',
            { search: 'reservation' },
        );

        expect(page.items.map(n => n.sourceId)).toEqual(['search-1']);
    });

    it('returns nothing when the search term matches no title', async () => {
        await notificationService.create({} as never, {
            recipientType: 'administrator',
            recipientId: 'admin-search-2',
            kind: 'info',
            sourceType: 'stock.low',
            sourceId: 'search-4',
            title: 'Low stock: SKU-77',
            message: 'x',
        });

        const page = await notificationService.findForRecipient(
            fakeAdminCtx(),
            'administrator',
            'admin-search-2',
            { search: 'nonexistent-term' },
        );

        expect(page.items).toHaveLength(0);
        expect(page.totalItems).toBe(0);
    });
});
