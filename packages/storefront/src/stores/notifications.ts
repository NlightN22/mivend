import { defineStore } from 'pinia';
import { useNotifications } from '@mivend/ui-kit';
import { notificationTransport } from '../api/notifications';

export const useNotificationsStore = defineStore('notifications', () => {
    return useNotifications(notificationTransport);
});
