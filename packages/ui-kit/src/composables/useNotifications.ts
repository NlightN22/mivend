import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { clearNotificationPersister, setNotificationPersister } from './notify';
import { showPopup } from './notificationPopups';
import { defaultTtlMs, isClientOrigin } from './notifyRules';
import type { NewNotification, NotificationItem, NotificationTransport } from './notificationTypes';

// Dropdown shows only a few recent items; the full filterable list lives on each portal's page.
// Small size also bounds panel growth from live WebSocket pushes (see upsert()).
const PANEL_TAKE = 8;

export interface UseNotifications {
    notifications: Ref<NotificationItem[]>;
    // Unread count must come from a dedicated status:'unread', take:0 request, not from the list.
    // The fetched page is capped, so counting it locally silently undercounts.
    unreadCount: ComputedRef<number>;
    loading: Ref<boolean>;
    markRead: (id: string) => Promise<void>;
    resolve: (id: string, resolution: string) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useNotifications(transport: NotificationTransport): UseNotifications {
    const notifications = ref<NotificationItem[]>([]);
    const unreadTotal = ref(0);
    const loading = ref(false);

    const unreadCount = computed(() => unreadTotal.value);

    function upsert(item: NotificationItem): void {
        const index = notifications.value.findIndex(n => n.id === item.id);
        if (index === -1) {
            notifications.value = [item, ...notifications.value].slice(0, PANEL_TAKE);
        } else {
            notifications.value = notifications.value.map((n, i) => (i === index ? item : n));
        }
    }

    async function refreshUnreadTotal(): Promise<void> {
        const page = await transport.fetch({ status: 'unread', take: 0 });
        unreadTotal.value = page.totalItems;
    }

    async function refresh(): Promise<void> {
        loading.value = true;
        try {
            const [page] = await Promise.all([
                transport.fetch({ take: PANEL_TAKE }),
                refreshUnreadTotal(),
            ]);
            notifications.value = page.items;
        } finally {
            loading.value = false;
        }
    }

    async function markRead(id: string): Promise<void> {
        const updated = await transport.markRead(id);
        upsert(updated);
        await refreshUnreadTotal();
    }

    async function resolve(id: string, resolution: string): Promise<void> {
        const updated = await transport.resolve(id, resolution);
        upsert(updated);
        await refreshUnreadTotal();
    }

    async function record(input: NewNotification): Promise<void> {
        upsert(await transport.create(input));
        await refreshUnreadTotal();
    }

    const unsubscribeLive = transport.subscribe(item => {
        upsert(item);
        if (!isClientOrigin(item)) {
            showPopup(
                { title: item.title, message: item.message, kind: item.kind, persisted: true },
                defaultTtlMs(item.kind),
            );
        }
        void refreshUnreadTotal();
    });
    setNotificationPersister(record);

    function unsubscribe(): void {
        unsubscribeLive();
        clearNotificationPersister(record);
    }

    if (getCurrentInstance()) {
        onBeforeUnmount(unsubscribe);
    }

    void refresh();

    return { notifications, unreadCount, loading, markRead, resolve, refresh };
}
