import { describe, it, expect, vi } from 'vitest';
import { useNotifications } from '../../composables/useNotifications';
import { useToast } from '../../composables/useToast';
import type { NotificationItem, NotificationTransport } from '../../composables/notificationTypes';

const { toasts } = useToast();

function makeItem(overrides: Partial<NotificationItem> = {}): NotificationItem {
    return {
        id: '1',
        kind: 'info',
        sourceType: 'reservation',
        sourceId: null,
        title: 'Title',
        message: 'Message',
        status: 'unread',
        readAt: null,
        resolvedAt: null,
        resolution: null,
        createdAt: new Date().toISOString(),
        ...overrides,
    };
}

function makeTransport(
    initial: NotificationItem[],
): NotificationTransport & { emit: (n: NotificationItem) => void } {
    let onReceived: ((n: NotificationItem) => void) | null = null;
    return {
        fetch: vi.fn(async () => initial),
        subscribe: vi.fn((cb: (n: NotificationItem) => void) => {
            onReceived = cb;
            return () => {
                onReceived = null;
            };
        }),
        markRead: vi.fn(async (id: string) =>
            makeItem({ id, status: 'read', readAt: new Date().toISOString() }),
        ),
        resolve: vi.fn(async (id: string, resolution: string) =>
            makeItem({ id, status: 'resolved', resolution }),
        ),
        emit: (n: NotificationItem) => onReceived?.(n),
    };
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('useNotifications', () => {
    it('seeds notifications from the initial fetch and computes unreadCount', async () => {
        const transport = makeTransport([
            makeItem({ id: '1', status: 'unread' }),
            makeItem({ id: '2', status: 'read' }),
        ]);
        const { notifications, unreadCount } = useNotifications(transport);
        await flush();

        expect(notifications.value).toHaveLength(2);
        expect(unreadCount.value).toBe(1);
    });

    it('appends a new item delivered via subscribe and fires a toast', async () => {
        const transport = makeTransport([]);
        const { notifications } = useNotifications(transport);
        await flush();

        const before = toasts.value.length;
        transport.emit(makeItem({ id: 'new', title: 'New', message: 'Arrived' }));

        expect(notifications.value).toHaveLength(1);
        expect(notifications.value[0].id).toBe('new');
        expect(toasts.value.length).toBe(before + 1);
        expect(toasts.value[toasts.value.length - 1].message).toBe('New: Arrived');
    });

    it('replaces (dedupes) an item whose id already exists instead of duplicating it', async () => {
        const transport = makeTransport([makeItem({ id: '1', status: 'unread', title: 'Old' })]);
        const { notifications } = useNotifications(transport);
        await flush();

        transport.emit(makeItem({ id: '1', status: 'unread', title: 'Updated' }));

        expect(notifications.value).toHaveLength(1);
        expect(notifications.value[0].title).toBe('Updated');
    });

    it('recomputes unreadCount after markRead', async () => {
        const transport = makeTransport([makeItem({ id: '1', status: 'unread' })]);
        const { unreadCount, markRead } = useNotifications(transport);
        await flush();

        expect(unreadCount.value).toBe(1);
        await markRead('1');
        expect(unreadCount.value).toBe(0);
    });
});
