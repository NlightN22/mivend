import { PubSub } from 'graphql-subscriptions';

// Must be one DI-provided PubSub: a plain `new PubSub()` per class never sees the other's events.
export const NOTIFICATION_PUB_SUB = Symbol('NOTIFICATION_PUB_SUB');

export function createNotificationPubSub(): PubSub {
    return new PubSub();
}
