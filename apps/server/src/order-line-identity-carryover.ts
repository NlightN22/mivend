import { migrateOrderLineIdentity } from '@mivend/plugin-order-identity';

import { createDbClient } from './db-client';

// synchronize would drop order_line."customFieldsUuid" before anything could copy it (#221); this
// runs migration 1791487000000's data step first on the synchronize contours; production only checks the table.
export async function carryOverOrderLineIdentity(): Promise<void> {
    const production = process.env.NODE_ENV === 'production';
    const client = createDbClient();
    await client.connect();
    try {
        if (production) {
            const { rows } = await client.query(
                `SELECT to_regclass('order_line_identity') AS "name"`,
            );
            if (!rows[0]?.name) {
                throw new Error(
                    'Table order_line_identity is missing: run migration:run (1791487000000-order-line-identity) before starting this process',
                );
            }
            return;
        }
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
                `order_line_identity carried over, ${result.mergedLines} duplicate lines merged, ${result.skippedGroups} groups skipped`,
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
