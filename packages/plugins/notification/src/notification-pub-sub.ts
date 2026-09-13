import { PubSub } from 'graphql-subscriptions';

// One PubSub instance shared between NotificationService (publisher) and the subscription
// resolver (subscriber) via Nest DI — a plain `new PubSub()` per class would never see each
// other's events.
export const NOTIFICATION_PUB_SUB = Symbol('NOTIFICATION_PUB_SUB');

export function createNotificationPubSub(): PubSub {
    return new PubSub();
}
