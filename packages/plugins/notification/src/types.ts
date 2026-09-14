import type { Notification, NotificationStatus } from './entities/notification.entity';

export const loggerCtx = 'NotificationPlugin';

export const NOTIFICATION_RECEIVED = 'NOTIFICATION_RECEIVED';

export interface NotificationReceivedEvent {
    notificationReceived: {
        id: string;
        recipientType: 'administrator' | 'administrator-broadcast' | 'customer';
        recipientId: string | null;
        sourceType: string;
    };
}

export interface NotificationList {
    items: Notification[];
    totalItems: number;
}

export interface NotificationListOptions {
    status?: NotificationStatus;
    search?: string;
    take?: number;
    skip?: number;
}
