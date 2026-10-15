import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { OrderStatusHistoryEntry1791509000000 } from '../../migrations/1791509000000-order-status-history-entry';
import { OrderStatusHistoryOccurredAt1791510000000 } from '../../migrations/1791510000000-order-status-history-occurred-at';

const { schema, extra } = testSchemaOptions('order_status_history_migration');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
    });
    await dataSource.initialize();
    await dataSource.query(
        `CREATE TABLE "order" ("id" serial primary key, "customFieldsErpstatus" varchar, "orderPlacedAt" timestamp)`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('order status history migrations (integration, real Postgres)', () => {
    it('creates the table with occurredAt and is idempotent', async () => {
        const qr = dataSource.createQueryRunner();
        try {
            for (let i = 0; i < 2; i++) {
                await new OrderStatusHistoryEntry1791509000000().up(qr);
                await new OrderStatusHistoryOccurredAt1791510000000().up(qr);
            }
        } finally {
            await qr.release();
        }
        const columns: Array<{ column_name: string }> = await dataSource.query(
            `SELECT column_name FROM information_schema.columns
              WHERE table_schema = $1 AND table_name = 'order_status_history_entry'`,
            [schema],
        );
        expect(columns.map(c => c.column_name)).toContain('occurredAt');
    });
});
