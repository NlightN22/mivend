import { Client } from 'pg';

import { testDbConnection } from '../harness/test-database';
import { ORDERS, notificationTitle, type OrderKey } from './fixture-plan';

// Broadcasts come only from timers and inbox handlers no API can drive, so the rows are inserted directly.
export async function seedNotifications(
    database: string,
    orders: Record<OrderKey, { id: string }>,
): Promise<void> {
    const client = new Client({ ...testDbConnection(), database });
    await client.connect();
    try {
        const rows: [string, string | null][] = [
            ...ORDERS.map(o => [o.key, orders[o.key].id] as [string, string]),
            ['general', null],
        ];
        for (const [key, orderId] of rows)
            await client.query(
                `INSERT INTO notification ("recipientType", "recipientId", kind, "sourceType", "sourceId",
                    "orderId", title, message, status)
                 VALUES ('administrator-broadcast', NULL, 'warning', 'reservation-intervention', $1, $2, $3,
                    'access scope probe', 'unread')`,
                [`access-${key}`, orderId, notificationTitle(key)],
            );
    } finally {
        await client.end();
    }
}
