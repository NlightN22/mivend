export const loggerCtx = 'NotificationPlugin';

export const NOTIFICATION_RECEIVED = 'NOTIFICATION_RECEIVED';

export interface NotificationReceivedEvent {
    notificationReceived: {
        id: string;
        recipientType: 'administrator' | 'customer';
        recipientId: string;
    };
}
