import { Client } from 'pg';

import { testDbConnection } from '../harness/test-database';
import { ORDERS, notificationTitle, type OrderKey } from './fixture-plan';

// Only timers and inbound handlers create broadcasts, so they are inserted directly; throwaway access DB only.
export async function seedNotifications(
    database: string,
    orders: Record<OrderKey, { id: string }>,
): Promise<void> {
    const client = new Client({ ...testDbConnection(), database });
    await client.connect();
    try {
        const rows: [OrderKey | 'general', string | null][] = [
            ...ORDERS.map(o => [o.key, orders[o.key].id] as [OrderKey, string]),
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
