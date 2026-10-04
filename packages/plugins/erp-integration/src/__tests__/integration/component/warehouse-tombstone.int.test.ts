import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { isWarehouseTombstoned } from '../../../handlers/warehouse-tombstone.query';

let dataSource: DataSource;
const { schema, extra } = testSchemaOptions('erp_warehouse_tombstone');

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [IntegrationInboxEvent],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterEach(async () => {
    await dataSource.getRepository(IntegrationInboxEvent).clear();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

let seq = 0;
async function addWarehouseEvent(
    entityId: string,
    status: 'pending' | 'processed' | 'failed',
    isDeleted: boolean,
    stream: 'warehouse' | 'stock' = 'warehouse',
): Promise<void> {
    seq += 1;
    await dataSource.getRepository(IntegrationInboxEvent).insert({
        stream,
        entityId,
        version: String(seq),
        sourceEventId: `evt-${seq}`,
        payload: isDeleted ? { isDeleted: true } : { name: 'warehouse-a' },
        status,
    });
}

describe('isWarehouseTombstoned (integration, real Postgres)', () => {
    it('is true when the latest event is a processed tombstone', async () => {
        await addWarehouseEvent('wh-1', 'processed', true);
        expect(await isWarehouseTombstoned(dataSource, 'wh-1')).toBe(true);
    });

    it('is false with no warehouse event at all (ordering race stays retryable)', async () => {
        expect(await isWarehouseTombstoned(dataSource, 'wh-1')).toBe(false);
    });

    it('is false while the tombstone is not processed yet', async () => {
        await addWarehouseEvent('wh-1', 'pending', true);
        expect(await isWarehouseTombstoned(dataSource, 'wh-1')).toBe(false);
    });

    it('is false when a later event revived the warehouse, even if still pending', async () => {
        await addWarehouseEvent('wh-1', 'processed', true);
        await addWarehouseEvent('wh-1', 'pending', false);
        expect(await isWarehouseTombstoned(dataSource, 'wh-1')).toBe(false);
    });

    it("ignores other warehouses' tombstones and other streams", async () => {
        await addWarehouseEvent('wh-2', 'processed', true);
        await addWarehouseEvent('wh-1', 'processed', true, 'stock');
        expect(await isWarehouseTombstoned(dataSource, 'wh-1')).toBe(false);
    });
});
