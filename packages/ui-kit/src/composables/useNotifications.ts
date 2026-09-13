import { computed, getCurrentInstance, onBeforeUnmount, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useToast } from './useToast';
import type { NotificationItem, NotificationTransport } from './notificationTypes';

export interface UseNotifications {
    notifications: Ref<NotificationItem[]>;
    unreadCount: ComputedRef<number>;
    loading: Ref<boolean>;
    markRead: (id: string) => Promise<void>;
    resolve: (id: string, resolution: string) => Promise<void>;
    refresh: () => Promise<void>;
}

export function useNotifications(transport: NotificationTransport): UseNotifications {
    const notifications = ref<NotificationItem[]>([]);
    const loading = ref(false);
    const { toast } = useToast();

    const unreadCount = computed(
        () => notifications.value.filter(n => n.status === 'unread').length,
    );

    function upsert(item: NotificationItem): void {
        const index = notifications.value.findIndex(n => n.id === item.id);
        if (index === -1) {
            notifications.value = [item, ...notifications.value];
        } else {
            notifications.value = notifications.value.map((n, i) => (i === index ? item : n));
        }
    }

    async function refresh(): Promise<void> {
        loading.value = true;
        try {
            notifications.value = await transport.fetch();
        } finally {
            loading.value = false;
        }
    }

    async function markRead(id: string): Promise<void> {
        const updated = await transport.markRead(id);
        upsert(updated);
    }

    async function resolve(id: string, resolution: string): Promise<void> {
        const updated = await transport.resolve(id, resolution);
        upsert(updated);
    }

    const unsubscribe = transport.subscribe(item => {
        upsert(item);
        toast(`${item.title}: ${item.message}`, item.kind);
    });

    if (getCurrentInstance()) {
        onBeforeUnmount(unsubscribe);
    }

    void refresh();

    return { notifications, unreadCount, loading, markRead, resolve, refresh };
}
