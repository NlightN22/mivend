import { createDbClient } from './db-client';

// synchronize cannot add the NOT NULL uuid to trading_point rows that already exist (#328); production
// gets the column from migration 1791553000000. Idempotent (IF NOT EXISTS), so concurrent processes are harmless.
export async function backfillTradingPointUuid(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;
    const client = createDbClient();
    await client.connect();
    try {
        const { rows } = await client.query(
            `SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'trading_point'`,
        );
        if (rows.length === 0) return;
        await client.query(
            `ALTER TABLE trading_point ADD COLUMN IF NOT EXISTS "uuid" uuid NOT NULL DEFAULT gen_random_uuid()`,
        );
    } finally {
        await client.end();
    }
}
