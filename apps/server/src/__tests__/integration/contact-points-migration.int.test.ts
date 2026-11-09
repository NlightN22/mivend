import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { ContactPoints1791573000000 } from '../../migrations/1791573000000-contact-points';

const { schema, extra } = testSchemaOptions('contact_points_migration');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [],
    });
    await dataSource.initialize();
    await dataSource.query(`
        CREATE TABLE counterparty (id SERIAL PRIMARY KEY);
        CREATE TABLE administrator (id SERIAL PRIMARY KEY);
        CREATE TABLE erp_user (id SERIAL PRIMARY KEY);
        CREATE TABLE organization_requisites (id SERIAL PRIMARY KEY);
        CREATE TABLE trading_point (id SERIAL PRIMARY KEY);
        CREATE TABLE contact_person (
            "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
            id SERIAL PRIMARY KEY, name varchar NOT NULL, phone varchar, email varchar,
            "isPrimary" boolean NOT NULL DEFAULT false,
            "tradingPointId" integer NOT NULL REFERENCES trading_point(id) ON DELETE CASCADE);
        INSERT INTO trading_point DEFAULT VALUES;
        INSERT INTO contact_person (name, phone, email, "isPrimary", "tradingPointId")
            VALUES ('Person A', '+79120000001', 'a@example.com', true, 1), ('Person B', NULL, NULL, false, 1);
    `);
    const runner = dataSource.createQueryRunner();
    await new ContactPoints1791573000000().up(runner);
    await runner.release();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('contact points migration (real Postgres)', () => {
    it('keeps existing trading point contacts, gives each a distinct uuid and manual source', async () => {
        const rows = await dataSource.query(
            `SELECT name, phone, email, "isPrimary", "tradingPointId", source, "isActive", uuid FROM contact_person ORDER BY id`,
        );
        expect(
            rows.map(
                (r: {
                    name: string;
                    phone: string | null;
                    isPrimary: boolean;
                    tradingPointId: number;
                    source: string;
                    isActive: boolean;
                }) => [r.name, r.phone, r.isPrimary, r.tradingPointId, r.source, r.isActive],
            ),
        ).toEqual([
            ['Person A', '+79120000001', true, 1, 'manual', true],
            ['Person B', null, false, 1, 'manual', true],
        ]);
        expect(new Set(rows.map((r: { uuid: string }) => r.uuid)).size).toBe(2);
    });

    it('seeds the role table and allows an ERP person without a trading point', async () => {
        const roles = await dataSource.query(`SELECT code FROM contact_role ORDER BY code`);
        expect(roles.map((r: { code: string }) => r.code)).toEqual([
            'accounting',
            'general',
            'ordering',
            'receiving',
            'trusted',
        ]);
        await dataSource.query(
            `INSERT INTO contact_person (name, "erpId", source, uuid) VALUES ('ERP person', 'e-1', 'erp', gen_random_uuid())`,
        );
        await expect(
            dataSource.query(
                `INSERT INTO contact_person (name, "erpId", uuid) VALUES ('Dup', 'e-1', gen_random_uuid())`,
            ),
        ).rejects.toThrow();
    });

    it('removes a channel when its last owner goes, but keeps one that another owner still has', async () => {
        await dataSource.query(`
            INSERT INTO counterparty DEFAULT VALUES; INSERT INTO counterparty DEFAULT VALUES;
            INSERT INTO contact_point (uuid, type, value) VALUES (gen_random_uuid(), 'phone', '+79120000001'), (gen_random_uuid(), 'phone', '+79120000002');
            INSERT INTO counterparty_contact_point ("counterpartyId", "contactPointId") VALUES (1, 1), (1, 2), (2, 2);`);
        await dataSource.query(`DELETE FROM counterparty WHERE id = 1`);
        const left = await dataSource.query(`SELECT value FROM contact_point ORDER BY id`);
        expect(left).toEqual([{ value: '+79120000002' }]);
    });

    it('indexes the channel id of every link table', async () => {
        const rows = await dataSource.query(
            `SELECT tablename FROM pg_indexes WHERE schemaname = current_schema() AND indexdef LIKE '%("contactPointId")%'`,
        );
        expect(rows.map((r: { tablename: string }) => r.tablename).sort()).toEqual([
            'administrator_contact_point',
            'contact_person_contact_point',
            'counterparty_contact_point',
            'organization_contact_point',
            'trading_point_contact_point',
        ]);
    });
});
