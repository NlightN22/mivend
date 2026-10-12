import { migrateOrderLineIdentity } from '@mivend/plugin-order-identity';

import { createDbClient } from './db-client';

// synchronize would drop order_line."customFieldsUuid" before anything could copy it (#221); this
// runs migration 1791487000000's data step first on the synchronize contours. No-op once dropped.
export async function carryOverOrderLineIdentity(): Promise<void> {
    if (process.env.NODE_ENV === 'production') return;
    const client = createDbClient();
    await client.connect();
    try {
        await client.query('BEGIN');
        // Runs before Vendure bootstraps, so there is no TransactionalConnection for withAggregateLock.
        await client.query(
            // eslint-disable-next-line locks/no-raw-advisory-lock
            `SELECT pg_advisory_xact_lock(hashtext('order-line-identity-carryover'))`,
        );
        const { rows } = await client.query(
            `SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() ` +
                `AND table_name = 'order_line' AND column_name = 'customFieldsUuid'`,
        );
        if (rows.length > 0) {
            const result = await migrateOrderLineIdentity(sql =>
                client.query(sql).then(res => res.rows),
            );
            console.log(
                `order_line_identity carried over, ${result.mergedLines} duplicate lines merged`,
            );
        }
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        await client.end();
    }
}
