import { defineStore } from 'pinia';
import { useNotifications } from '@mivend/ui-kit';
import { notificationTransport } from '../api/notifications';

// Keep in sync with storefront notifications.ts; Pinia store so bell and page share one unreadTotal
// Separate instances would leave the bell badge stale after marking a notification read.
export const useNotificationsStore = defineStore('notifications', () => {
    return useNotifications(notificationTransport);
});
