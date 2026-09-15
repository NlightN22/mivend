import { describe, expect, it, vi } from 'vitest';

import { NotificationService } from '../../notification.service';
import { Notification } from '../../entities/notification.entity';

// Mirrors erp-integration's reconciliation.service.test.ts convention: stub
// TransactionalConnection.getRepository() directly rather than a real DataSource — this suite is
// about NotificationService's own upsert/state-transition logic, not TypeORM/Postgres behavior
// (that's covered separately by the identity-scoping component test against a real schema).
function makeService(existing: Notification | null = null): {
    service: NotificationService;
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
} {
    const saved: Notification[] = [];
    const findOne = vi.fn().mockResolvedValue(existing);
    const findOneOrFail = vi
        .fn()
        .mockImplementation(async ({ where: { id } }: { where: { id: string } }) => {
            const found = saved.find(n => n.id === id) ?? existing;
            if (!found) throw new Error('not found');
            return found;
        });
    const save = vi.fn().mockImplementation(async (n: Notification) => {
        saved.push(n);
        return n;
    });
    const find = vi.fn();
    const connection = {
        getRepository: () => ({ findOne, findOneOrFail, save, find }),
    };
    const publish = vi.fn().mockResolvedValue(undefined);
    const pubSub = { publish };
    const service = new NotificationService(connection as never, pubSub as never);
    return { service, findOne, save, publish };
}

const baseInput = {
    recipientType: 'administrator' as const,
    recipientId: 'admin-1',
    kind: 'info' as const,
    sourceType: 'reservation.expiring',
    sourceId: 'reservation-1',
    title: 'Reservation expiring',
    message: 'Reservation reservation-1 expires soon',
};

describe('NotificationService.create (upsert-by-source)', () => {
    it('creates a new row when no notification exists for this source', async () => {
        const { service, save, publish } = makeService(null);

        const result = await service.create({} as never, baseInput);

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.status).toBe('unread');
        expect(result.sourceId).toBe('reservation-1');
        expect(publish).toHaveBeenCalledWith(
            'NOTIFICATION_RECEIVED',
            expect.objectContaining({
                notificationReceived: expect.objectContaining({ recipientId: 'admin-1' }),
            }),
        );
    });

    it('updates the existing row in place when it is still unread for the same source', async () => {
        const existing = new Notification({
            id: 'notif-1',
            ...baseInput,
            title: 'Old title',
            message: 'Old message',
            status: 'unread',
            readAt: null,
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.create({} as never, {
            ...baseInput,
            title: 'New title',
            message: 'New message',
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.id).toBe('notif-1');
        expect(result.title).toBe('New title');
        expect(result.status).toBe('unread');
    });

    it('updates the existing row in place when it is read (not yet resolved) for the same source', async () => {
        const existing = new Notification({
            id: 'notif-2',
            ...baseInput,
            status: 'read',
            readAt: new Date(),
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.create({} as never, baseInput);

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.id).toBe('notif-2');
        expect(result.status).toBe('unread');
    });

    it('creates a NEW row (never updates) when the existing notification for this source is resolved', async () => {
        const existing = new Notification({
            id: 'notif-3',
            ...baseInput,
            status: 'resolved',
            readAt: new Date(),
            resolvedAt: new Date(),
            resolution: 'handled',
        });
        const { service, save } = makeService(existing);

        const result = await service.create({} as never, baseInput);

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.id).not.toBe('notif-3');
        expect(result.status).toBe('unread');
    });
});

describe('NotificationService.markRead', () => {
    it('transitions unread -> read and sets readAt', async () => {
        const existing = new Notification({
            id: 'notif-4',
            ...baseInput,
            status: 'unread',
            readAt: null,
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.markRead({} as never, 'notif-4');

        expect(result.status).toBe('read');
        expect(result.readAt).toBeInstanceOf(Date);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('does not mutate an already-read notification', async () => {
        const readAt = new Date('2026-01-01T00:00:00Z');
        const existing = new Notification({
            id: 'notif-5',
            ...baseInput,
            status: 'read',
            readAt,
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.markRead({} as never, 'notif-5');

        expect(result.status).toBe('read');
        expect(result.readAt).toBe(readAt);
        expect(save).not.toHaveBeenCalled();
    });
});

describe('NotificationService.create — administrator-broadcast (issue #87 Part 2 / #42)', () => {
    const broadcastInput = {
        recipientType: 'administrator-broadcast' as const,
        kind: 'error' as const,
        sourceType: 'reservation-intervention',
        sourceId: 'reservation-1',
        title: 'Needs intervention',
        message: 'x',
    };

    it('creates a single row with recipientId null, ignoring any recipientId passed in', async () => {
        const { service, save } = makeService(null);

        const result = await service.create({} as never, {
            ...broadcastInput,
            recipientId: 'admin-should-be-ignored',
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.recipientType).toBe('administrator-broadcast');
        expect(result.recipientId).toBeNull();
    });

    it('a repeated create() call for the same source updates the one row instead of fanning out', async () => {
        const existing = new Notification({
            id: 'broadcast-1',
            ...broadcastInput,
            recipientId: null,
            status: 'unread',
            readAt: null,
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.create({} as never, broadcastInput);

        expect(save).toHaveBeenCalledTimes(1);
        expect(result.id).toBe('broadcast-1');
    });
});

describe('NotificationService.resolve', () => {
    it('transitions to resolved and records the resolution', async () => {
        const existing = new Notification({
            id: 'notif-6',
            ...baseInput,
            status: 'unread',
            readAt: null,
            resolvedAt: null,
            resolution: null,
        });
        const { service, save } = makeService(existing);

        const result = await service.resolve({} as never, 'notif-6', 'fixed by ops');

        expect(result.status).toBe('resolved');
        expect(result.resolution).toBe('fixed by ops');
        expect(result.resolvedAt).toBeInstanceOf(Date);
        expect(save).toHaveBeenCalledTimes(1);
    });
});

// issue #99: a producer's own source record resolving must close out the notification(s) it
// raised, otherwise the alert sits "unread" forever with stale numbers.
describe('NotificationService.resolveBySource', () => {
    it('resolves every not-yet-resolved notification for the source', async () => {
        const open = [
            new Notification({
                id: 'notif-1',
                ...baseInput,
                status: 'unread',
                resolvedAt: null,
                resolution: null,
            }),
            new Notification({
                id: 'notif-2',
                ...baseInput,
                status: 'read',
                resolvedAt: null,
                resolution: null,
            }),
        ];
        const save = vi.fn().mockImplementation(async (rows: Notification[]) => rows);
        const find = vi.fn().mockResolvedValue(open);
        const connection = { getRepository: () => ({ find, save }) };
        const service = new NotificationService(connection as never, { publish: vi.fn() } as never);

        const result = await service.resolveBySource(
            {} as never,
            { sourceType: baseInput.sourceType, sourceId: baseInput.sourceId },
            'auto-resolved on reconciliation',
        );

        expect(result).toHaveLength(2);
        expect(result.every(n => n.status === 'resolved')).toBe(true);
        expect(result.every(n => n.resolution === 'auto-resolved on reconciliation')).toBe(true);
        expect(result.every(n => n.resolvedAt instanceof Date)).toBe(true);
    });

    // The whole reason this matches by (sourceType, sourceId) alone and never filters by
    // recipientId: NotificationService.create's own dedupe-by-source lookup is keyed on
    // recipientId too, so a manual reconciliation run (recipientId=some admin) followed later by
    // a scheduled run for the same still-open issue (recipientId=null) misses that dedupe lookup
    // and inserts a SECOND notification row for the same source instead of updating the first.
    // Both rows must still be closed out when the source issue resolves, or the first one is
    // orphaned "unread" forever.
    it('resolves every row for the source even when they carry different (or null) recipientIds', async () => {
        const open = [
            new Notification({
                id: 'notif-1',
                ...baseInput,
                recipientId: 'admin-1',
                status: 'unread',
                resolvedAt: null,
                resolution: null,
            }),
            new Notification({
                id: 'notif-2',
                ...baseInput,
                recipientId: null,
                status: 'unread',
                resolvedAt: null,
                resolution: null,
            }),
        ];
        const save = vi.fn().mockImplementation(async (rows: Notification[]) => rows);
        const find = vi.fn().mockResolvedValue(open);
        const connection = { getRepository: () => ({ find, save }) };
        const service = new NotificationService(connection as never, { publish: vi.fn() } as never);

        const result = await service.resolveBySource(
            {} as never,
            { sourceType: baseInput.sourceType, sourceId: baseInput.sourceId },
            'auto-resolved on reconciliation',
        );

        expect(result).toHaveLength(2);
        expect(result.map(n => n.recipientId).sort()).toEqual([null, 'admin-1'].sort());
        expect(result.every(n => n.status === 'resolved')).toBe(true);
    });

    it('is a no-op when nothing open exists for the source', async () => {
        const save = vi.fn();
        const find = vi.fn().mockResolvedValue([]);
        const connection = { getRepository: () => ({ find, save }) };
        const service = new NotificationService(connection as never, { publish: vi.fn() } as never);

        const result = await service.resolveBySource(
            {} as never,
            { sourceType: baseInput.sourceType, sourceId: baseInput.sourceId },
            'auto-resolved on reconciliation',
        );

        expect(result).toEqual([]);
        expect(save).not.toHaveBeenCalled();
    });
});
