import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { TradingPointErp } from '../../entities/trading-point-erp.entity';
import { markMirrorDeleted, type ErpPointExtra } from '../../trading-point-erp-extra';
import { writeErpMirror } from '../../trading-point-erp-mirror';

const { schema, extra } = testSchemaOptions('trading_point_erp_extra');
let dataSource: DataSource;

const sent: ErpPointExtra = {
    isDeleted: false,
    code: 'K-1',
    regionId: 'region-gone',
    storageStock: null,
    loyalty: null,
    area: 12.5,
    classification: null,
    hasCompetitors: true,
    mainManagerId: null,
    bankAccountId: null,
    internalTransferPointId: null,
    accuracyRadius: null,
    productGroupIds: '["pg-1"]',
    managerIds: '[]',
    pointTypeIds: '["type-unknown"]',
    salesChannels: '[]',
    contactInfos: '[{"type":"phone","presentation":"a@example.com"}]',
};

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TradingPointErp],
        synchronize: true,
    });
    await dataSource.initialize();
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE trading_point_erp RESTART IDENTITY`);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

describe('trading_point_erp unread fields (real Postgres)', () => {
    it('stores soft ids and lists as sent, one row on repeat, a later event clears what it omits', async () => {
        const fields = { counterpartyId: 'cp-missing', isActive: true, name: 'Point', extra: sent };
        await writeErpMirror(dataSource.getRepository(TradingPointErp), 'pos-1', fields);
        await writeErpMirror(dataSource.getRepository(TradingPointErp), 'pos-1', fields);

        const rows = await dataSource.getRepository(TradingPointErp).find();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            regionId: 'region-gone',
            pointTypeIds: '["type-unknown"]',
        });

        await writeErpMirror(dataSource.getRepository(TradingPointErp), 'pos-1', {
            ...fields,
            extra: { ...sent, regionId: null, pointTypeIds: '[]' },
        });
        const [row] = await dataSource.getRepository(TradingPointErp).find();
        expect(row).toMatchObject({ regionId: null, pointTypeIds: '[]', code: 'K-1' });
    });

    it('a tombstone flags the mirror deleted and inactive, keeping its values; unknown point is a no-op', async () => {
        await writeErpMirror(dataSource.getRepository(TradingPointErp), 'pos-1', {
            counterpartyId: 'cp-1',
            isActive: true,
            name: 'Point',
            extra: sent,
        });
        expect(await markMirrorDeleted(dataSource.getRepository(TradingPointErp), 'pos-1')).toBe(
            true,
        );
        expect(await markMirrorDeleted(dataSource.getRepository(TradingPointErp), 'pos-x')).toBe(
            false,
        );

        const [row] = await dataSource.getRepository(TradingPointErp).find();
        expect(row).toMatchObject({ isActive: false, isDeleted: true, name: 'Point', code: 'K-1' });
    });
});
