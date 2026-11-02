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
    await dataSource.query(
        `CREATE TABLE unit_record (id serial PRIMARY KEY, "entityId" varchar, "isDeleted" boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE department (id serial PRIMARY KEY, "erpId" varchar, "isActive" boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE stock_organization (id serial PRIMARY KEY, "entityId" varchar, "isActive" boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE erp_user (id serial PRIMARY KEY, "erpId" varchar, active boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE contract (id serial PRIMARY KEY, "erpId" varchar, "isActive" boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE trading_point (id serial PRIMARY KEY, "erpId" varchar, "isActive" boolean)`,
    );
    await dataSource.query(
        `CREATE TABLE counterparty (id serial PRIMARY KEY, "erpId" varchar, "isActive" boolean)`,
    );
    for (const t of [
        'erp_position',
        'region_record',
        'legal_form_record',
        'bank_record',
        'bank_account_record',
    ]) {
        await dataSource.query(`CREATE TABLE ${t} (id serial PRIMARY KEY, "isActive" boolean)`);
    }
    await dataSource.query(
        `CREATE TABLE manufacturer (id serial PRIMARY KEY, name varchar, "isActive" boolean NOT NULL DEFAULT true)`,
    );
    for (const t of [
        'product_photo',
        'granted_discount',
        'granted_retro_bonus',
        'settlement_balance',
        'settlement_document_type',
    ]) {
        await dataSource.query(`CREATE TABLE ${t} (id serial PRIMARY KEY, "isDeleted" boolean)`);
    }
    await dataSource.query(
        `CREATE TABLE discount_setup (id serial PRIMARY KEY, "inactiveReason" varchar)`,
    );
    await dataSource.query(
        `CREATE TABLE discount_rule (id serial PRIMARY KEY, "erpId" varchar, "operationKind" varchar)`,
    );
    await dataSource.query(`CREATE TABLE retro_bonus_rule (id serial PRIMARY KEY, active boolean)`);
    await dataSource.query(
        `CREATE TABLE order_status_reference (id serial PRIMARY KEY, source varchar, "isDeleted" boolean)`,
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
        `TRUNCATE integration_inbox_event, product, product_variant_price_entry, collection, unit_record, department, stock_organization, erp_user, contract, trading_point, counterparty, erp_position, region_record, legal_form_record, bank_record, bank_account_record, manufacturer, product_photo, granted_discount, granted_retro_bonus, settlement_balance, settlement_document_type, discount_setup, retro_bonus_rule, order_status_reference RESTART IDENTITY`,
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

    it('counts only units that are not deleted', async () => {
        await dataSource.query(
            `INSERT INTO unit_record ("entityId", "isDeleted") VALUES ('u1', false), ('u2', true), ('u3', false)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'unit')).toBe(2);
    });

    it('counts only active departments', async () => {
        await dataSource.query(
            `INSERT INTO department ("erpId", "isActive") VALUES ('d1', true), ('d2', false)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'department')).toBe(1);
    });

    it('counts only active stock-organization rows', async () => {
        await dataSource.query(
            `INSERT INTO stock_organization ("entityId", "isActive") VALUES ('s1', true), ('s2', false), ('s3', true)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'stockOrganization')).toBe(2);
    });

    it('counts only active ERP users, linked or not, never null or inactive ones', async () => {
        await dataSource.query(
            `INSERT INTO erp_user ("erpId", active) VALUES ('e1', true), ('e2', false), ('e3', NULL), ('e4', true)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'user')).toBe(2);
    });

    it('counts only active contracts and active points of sale', async () => {
        await dataSource.query(
            `INSERT INTO contract ("erpId", "isActive") VALUES ('c1', true), ('c2', false), ('c3', true)`,
        );
        await dataSource.query(
            `INSERT INTO trading_point ("erpId", "isActive") VALUES ('t1', true), ('t2', false)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'contract')).toBe(2);
        expect(await service.getLocalActiveCount(ctx, 'pointOfSale')).toBe(1);
    });

    it('adds active named points without an address that were applied but never stored', async () => {
        await dataSource.query(
            `INSERT INTO counterparty ("erpId", "isActive") VALUES ('cp1', true)`,
        );
        const point = (id: string, evt: string, p: Record<string, unknown>) =>
            dataSource.query(
                `INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status)
                 VALUES ('point-of-sale', $1, '1', $2, $3, 'processed')`,
                [
                    id,
                    evt,
                    JSON.stringify({ name: 'P', counterpartyId: 'cp1', isActive: true, ...p }),
                ],
            );
        await point('a', 'e1', {});
        await point('b', 'e2', { address: '  ' });
        await point('c', 'e3', { address: 'Main st' });
        await point('d', 'e4', { isActive: false });
        await point('e', 'e5', { counterpartyId: 'unknown' });
        await point('f', 'e6', {});
        await point('g', 'e7', {});
        await dataSource.query(`UPDATE integration_inbox_event SET outcome = 'applied'`);
        await point('g', 'e8', { address: 'Old st' });
        await point('h', 'e9', {});
        await dataSource.query(
            `UPDATE integration_inbox_event SET outcome = 'applied' WHERE entity_id = 'h'`,
        );
        await dataSource.query(`INSERT INTO integration_inbox_event (stream, entity_id, version, source_event_id, payload, status, outcome)
             VALUES ('point-of-sale', 'h', '2', 'e10', '{"isDeleted":true}', 'processed', 'applied')`);
        await dataSource.query(
            `UPDATE integration_inbox_event SET outcome = 'superseded' WHERE source_event_id = 'e8'`,
        );
        await dataSource.query(
            `INSERT INTO trading_point ("erpId", "isActive") VALUES ('f', true)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'pointOfSale')).toBe(4);
    });

    it.each([
        ['position', 'erp_position'],
        ['counterparty', 'counterparty'],
        ['region', 'region_record'],
        ['legalForm', 'legal_form_record'],
        ['bank', 'bank_record'],
        ['bankAccount', 'bank_account_record'],
    ] as const)('counts only active rows for %s', async (type, table) => {
        await dataSource.query(
            `INSERT INTO ${table} ("isActive") VALUES (true), (false), (true), (NULL)`,
        );
        expect(await service.getLocalActiveCount(ctx, type)).toBe(2);
    });

    it('counts only active named manufacturers, not placeholders or deactivated ones', async () => {
        await dataSource.query(
            `INSERT INTO manufacturer (name, "isActive") VALUES ('m1', true), (NULL, true), ('m2', true), ('m3', false)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'manufacturer')).toBe(2);
    });

    it.each([
        ['productPhoto', 'product_photo'],
        ['grantedDiscount', 'granted_discount'],
        ['grantedRetroBonus', 'granted_retro_bonus'],
        ['settlementBalance', 'settlement_balance'],
        ['settlementDocumentType', 'settlement_document_type'],
    ] as const)('counts only non-deleted rows for %s', async (type, table) => {
        await dataSource.query(
            `INSERT INTO ${table} ("isDeleted") VALUES (false), (true), (false)`,
        );
        expect(await service.getLocalActiveCount(ctx, type)).toBe(2);
    });

    it('counts unevaluated discount setups but not cancelled ones', async () => {
        await dataSource.query(
            `INSERT INTO discount_setup ("inactiveReason") VALUES (NULL), ('fixed-price'), ('cancelled')`,
        );
        expect(await service.getLocalActiveCount(ctx, 'discountSetup')).toBe(2);
    });

    it('counts active retro-bonus rules only', async () => {
        await dataSource.query(`INSERT INTO retro_bonus_rule (active) VALUES (true), (false)`);
        expect(await service.getLocalActiveCount(ctx, 'retroBonusSetup')).toBe(1);
    });

    it('counts promo rows only, not tier rules without an operation kind', async () => {
        await dataSource.query(
            `INSERT INTO discount_rule ("erpId", "operationKind") VALUES
             ('p1', 'percent-discount'), ('p2', 'gift-one-from-list'), ('t1', NULL)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'promoRule')).toBe(2);
    });

    it('counts only ERP-owned, non-deleted order statuses', async () => {
        await dataSource.query(
            `INSERT INTO order_status_reference (source, "isDeleted") VALUES
             ('erp', false), ('erp', true), ('mivend', false)`,
        );
        expect(await service.getLocalActiveCount(ctx, 'orderStatus')).toBe(1);
    });
});
