import { describe, it, expect, vi } from 'vitest';
import { useNotifications } from '../../composables/useNotifications';
import { popups } from '../../composables/notificationPopups';
import { notify } from '../../composables/notify';
import type {
    NotificationFetchOptions,
    NotificationItem,
    NotificationPage,
    NotificationTransport,
} from '../../composables/notificationTypes';

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

// unreadCount must reflect a dedicated unread count request, not the recent page's length/filter.
// The fake serves both from unreadItems so tests can tell the two sources apart.
function makeTransport(
    initial: NotificationItem[],
    unreadItems: NotificationItem[] = initial.filter(n => n.status === 'unread'),
): NotificationTransport & {
    emit: (n: NotificationItem) => void;
    setUnreadTotal: (n: number) => void;
} {
    let onReceived: ((n: NotificationItem) => void) | null = null;
    let unreadTotal = unreadItems.length;
    return {
        fetch: vi.fn(async (opts?: NotificationFetchOptions): Promise<NotificationPage> => {
            if (opts?.status === 'unread') {
                return { items: [], totalItems: unreadTotal };
            }
            return { items: initial, totalItems: initial.length };
        }),
        create: vi.fn(
            async (input: { kind: NotificationItem['kind']; title: string; message: string }) => {
                unreadTotal += 1;
                return makeItem({ id: 'created', sourceType: 'client', ...input });
            },
        ),
        subscribe: vi.fn((cb: (n: NotificationItem) => void) => {
            onReceived = cb;
            return () => {
                onReceived = null;
            };
        }),
        markRead: vi.fn(async (id: string) => {
            unreadTotal = Math.max(0, unreadTotal - 1);
            return makeItem({ id, status: 'read', readAt: new Date().toISOString() });
        }),
        resolve: vi.fn(async (id: string, resolution: string) =>
            makeItem({ id, status: 'resolved', resolution }),
        ),
        emit: (n: NotificationItem) => onReceived?.(n),
        setUnreadTotal: (n: number) => {
            unreadTotal = n;
        },
    };
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('useNotifications', () => {
    it('seeds notifications from the initial fetch and computes unreadCount from the dedicated unread total', async () => {
        const transport = makeTransport([
            makeItem({ id: '1', status: 'unread' }),
            makeItem({ id: '2', status: 'read' }),
        ]);
        const { notifications, unreadCount } = useNotifications(transport);
        await flush();

        expect(notifications.value).toHaveLength(2);
        expect(unreadCount.value).toBe(1);
    });

    // The exact bug issue #92 was filed for: unreadCount must not be capped by whatever page the
    // panel happens to have fetched.
    it('unreadCount reflects the real total even when it exceeds the fetched recent page', async () => {
        const transport = makeTransport([makeItem({ id: '1', status: 'unread' })], []);
        transport.setUnreadTotal(73);
        const { unreadCount } = useNotifications(transport);
        await flush();

        expect(unreadCount.value).toBe(73);
    });

    it('appends a new backend item delivered via subscribe and shows it as a popup bound for the bell', async () => {
        const transport = makeTransport([]);
        const { notifications } = useNotifications(transport);
        await flush();

        const before = popups.value.length;
        transport.emit(makeItem({ id: 'new', title: 'New', message: 'Arrived' }));

        expect(notifications.value).toHaveLength(1);
        expect(notifications.value[0].id).toBe('new');
        expect(popups.value.length).toBe(before + 1);
        expect(popups.value[popups.value.length - 1]).toMatchObject({
            title: 'New',
            message: 'Arrived',
            persisted: true,
        });
    });

    it('adds a client-origin item to the list without a second popup', async () => {
        const transport = makeTransport([]);
        const { notifications } = useNotifications(transport);
        await flush();

        const before = popups.value.length;
        transport.emit(makeItem({ id: 'mine', sourceType: 'client' }));

        expect(notifications.value).toHaveLength(1);
        expect(popups.value.length).toBe(before);
    });

    it('notify() stores the popup through the transport, lists it and refreshes the unread count', async () => {
        const transport = makeTransport([]);
        const { notifications, unreadCount } = useNotifications(transport);
        await flush();

        notify('Could not save', 'error', { title: 'Profile' });
        await flush();

        expect(transport.create).toHaveBeenCalledWith({
            kind: 'error',
            title: 'Profile',
            message: 'Could not save',
        });
        expect(notifications.value.map(n => n.id)).toEqual(['created']);
        expect(unreadCount.value).toBe(1);
    });

    it('notify() with ephemeral shows the popup and stores nothing', async () => {
        const transport = makeTransport([]);
        useNotifications(transport);
        await flush();

        const before = popups.value.length;
        notify('Copied', 'success', { ephemeral: true });
        await flush();

        expect(popups.value.length).toBe(before + 1);
        expect(popups.value[popups.value.length - 1].persisted).toBe(false);
        expect(transport.create).not.toHaveBeenCalled();
    });

    it('logs a failed store, keeps the popup and does not throw into the caller', async () => {
        const transport = makeTransport([]);
        vi.mocked(transport.create).mockRejectedValueOnce(new Error('offline'));
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        useNotifications(transport);
        await flush();

        const before = popups.value.length;
        expect(() => notify('Could not save', 'error')).not.toThrow();
        await flush();

        expect(popups.value.length).toBe(before + 1);
        expect(error).toHaveBeenCalledWith('Could not store the notification', expect.any(Error));
        error.mockRestore();
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
        const transport = makeTransport(
            [makeItem({ id: '1', status: 'unread' })],
            [makeItem({ id: '1', status: 'unread' })],
        );
        const { unreadCount, markRead } = useNotifications(transport);
        await flush();

        expect(unreadCount.value).toBe(1);
        await markRead('1');
        await flush();
        expect(unreadCount.value).toBe(0);
    });
});
