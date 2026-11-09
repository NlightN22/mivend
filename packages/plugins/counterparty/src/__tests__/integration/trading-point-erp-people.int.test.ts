import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { TestContact, TestCounterparty, TestTradingPoint } from './trading-point-test-entities';

const { schema, extra } = testSchemaOptions('trading_point_erp_people');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestCounterparty, TestTradingPoint, TestContact],
        synchronize: true,
    });
    await dataSource.initialize();
});
afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('trading point contact list (real Postgres)', () => {
    it('lists the point contacts and not ERP-backed people without a trading point', async () => {
        await dataSource.query(
            `INSERT INTO trading_point ("erpId", "counterpartyId", name, address) VALUES ('tp-1', '1', 'Point', 'Street')`,
        );
        await dataSource.query(
            `INSERT INTO contact_person (name, "tradingPointId") VALUES ('On point', 1), ('ERP-backed person', NULL)`,
        );
        const [point] = await dataSource.getRepository(TestTradingPoint).find();
        expect(point.contacts.map(c => c.name)).toEqual(['On point']);
    });
});
