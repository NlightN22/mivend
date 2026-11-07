import { Client } from 'pg';
import { PgPubSub } from './notification-pg-pub-sub';

// Must be one DI-provided PubSub: a second instance never sees the first one's local subscribers.
export const NOTIFICATION_PUB_SUB = Symbol('NOTIFICATION_PUB_SUB');

function createDbClient(): Client {
    return new Client({
        host: process.env.DB_HOST ?? 'localhost',
        port: parseInt(process.env.DB_PORT ?? '5432'),
        user: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_NAME ?? 'mivend',
    });
}

export function createNotificationPubSub(): PgPubSub {
    return new PgPubSub(createDbClient);
}
