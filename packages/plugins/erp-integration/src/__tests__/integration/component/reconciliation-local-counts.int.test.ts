import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { IntegrationInboxEvent } from '../../../entities/integration-inbox-event.entity';
import { ReconciliationLocalCountsService } from '../../../reconciliation-local-counts.service';

const { schema, extra } = testSchemaOptions('erp_recon_counts');
let dataSource: DataSource;
let service: ReconciliationLocalCountsService;
const ctx = {} as RequestContext;
let seq = 0;

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
    await dataSource.query(
        `CREATE TABLE product (id serial PRIMARY KEY, "customFieldsExternalid" varchar, "deletedAt" timestamp)`,
    );
    await dataSource.query(
        `CREATE TABLE product_variant_price_entry (id serial PRIMARY KEY, "productExternalId" varchar, "priceTypeCode" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE collection (id serial PRIMARY KEY, "isRoot" boolean, "isPrivate" boolean, "customFieldsFeedhidden" boolean)`,
    );
    const warehouseService = { findAll: async () => [{ isActive: true }, { isActive: false }] };
    service = new ReconciliationLocalCountsService(
        {} as never,
        {} as never,
        warehouseService as never,
        {} as never,
        createTestConnection(dataSource) as never,
    );
});

beforeEach(async () => {
    await dataSource.query(
        `TRUNCATE integration_inbox_event, product, product_variant_price_entry, collection RESTART IDENTITY`,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

async function warehouseEvent(entityId: string, version: string, payload: object): Promise<void> {
    seq += 1;
    await dataSource.query(
        `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
         VALUES ('warehouse', $1, $2, $3, $4, 'processed')`,
        [entityId, version, `evt-${seq}`, JSON.stringify(payload)],
    );
}

describe('reconciliation local counts against real Postgres', () => {
    it('counts only non-root, non-feed-hidden categories, ignoring a manager private override', async () => {
        await dataSource.query(
            `INSERT INTO collection ("isRoot", "isPrivate", "customFieldsFeedhidden") VALUES
             (true, false, false), (false, false, false), (false, true, false), (false, true, true)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'category')).toBe(2);
    });

    it('counts only prices of existing, non-deleted products', async () => {
        await dataSource.query(
            `INSERT INTO product ("customFieldsExternalid", "deletedAt") VALUES ('p1', NULL), ('p2', now())`,
        );
        await dataSource.query(
            `INSERT INTO product_variant_price_entry ("productExternalId", "priceTypeCode") VALUES
             ('p1', 'a'), ('p1', 'b'), ('p2', 'a'), ('never-received', 'a')`,
        );
        expect(await service.getLocalActiveCount(ctx, 'price')).toBe(2);
    });

    it('adds the latest-state active folder warehouses to real active warehouses', async () => {
        await warehouseEvent('f-active', 'v1', { isFolder: true, isActive: true });
        await warehouseEvent('f-inactive', 'v1', { isFolder: true, isActive: false });
        await warehouseEvent('f-deleted', 'v1', {
            isFolder: true,
            isActive: true,
            isDeleted: true,
        });
        await warehouseEvent('f-flipped', 'v1', { isFolder: true, isActive: true });
        await warehouseEvent('f-flipped', 'v2', { isFolder: true, isActive: false });
        await warehouseEvent('real', 'v1', { isFolder: false, isActive: true });
        expect(await service.getLocalActiveCount(ctx, 'warehouse')).toBe(2);
    });

    it('keeps counting a folder after retention emptied its older versions', async () => {
        await warehouseEvent('f-1', '2026-10-25T06:00:00.000Z', {});
        await warehouseEvent('f-1', '2026-10-25T07:00:00.000Z', { isFolder: true, isActive: true });
        expect(await service.getLocalActiveCount(ctx, 'warehouse')).toBe(2);
    });
});
