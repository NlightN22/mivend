import { defineStore } from 'pinia';
import { useNotifications } from '@mivend/ui-kit';
import { notificationTransport } from '../api/notifications';

// Mirrors packages/storefront/src/stores/notifications.ts exactly — a Pinia store, not a bare
// composable call, so DefaultLayout's bell/panel and NotificationsPage.vue share ONE
// useNotifications instance (one `unreadTotal` ref) instead of each independently fetching its
// own. Without this, marking a notification read/resolved on the full /notifications page never
// refreshed the topbar bell's badge — a real bug caught by driving the page in a browser
// (issue #92 follow-up).
export const useNotificationsStore = defineStore('notifications', () => {
    return useNotifications(notificationTransport);
});
