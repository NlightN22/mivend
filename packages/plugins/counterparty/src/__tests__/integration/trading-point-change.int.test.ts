import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { TradingPointChange } from '../../entities/trading-point-change.entity';
import { TradingPointErp } from '../../entities/trading-point-erp.entity';
import { savePendingChange, type ProposedPointFields } from '../../trading-point-change';
import { writeErpMirror } from '../../trading-point-erp-mirror';

const { schema, extra } = testSchemaOptions('trading_point_change');
let dataSource: DataSource;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TradingPointChange, TradingPointErp],
        synchronize: true,
    });
    await dataSource.initialize();
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.query(`TRUNCATE trading_point_change, trading_point_erp RESTART IDENTITY`);
});

const changes = (): Repository<TradingPointChange> => dataSource.getRepository(TradingPointChange);
const mirror = (): Repository<TradingPointErp> => dataSource.getRepository(TradingPointErp);
const proposed = (name: string): ProposedPointFields => ({
    name,
    address: 'Test Street 12',
    latitude: 10.5,
    longitude: 20.5,
    workingHours: null,
});

describe('savePendingChange (real Postgres)', () => {
    const point = { id: '1', counterpartyId: '7' };

    it('keeps one pending change per point and supersedes the older one', async () => {
        await savePendingChange(changes(), point, proposed('First'), 'u1');
        await savePendingChange(changes(), point, proposed('Second'), 'u1');
        const rows = await changes().find({ order: { id: 'ASC' } });
        expect(rows.map(r => r.status)).toEqual(['rejected', 'pending']);
        expect(JSON.parse(rows[1].payload).name).toBe('Second');
    });

    it('concurrent proposals for one point leave exactly one pending change', async () => {
        const results = await Promise.allSettled([
            savePendingChange(changes(), point, proposed('A'), 'u1'),
            savePendingChange(changes(), point, proposed('B'), 'u2'),
        ]);
        expect(results.some(r => r.status === 'fulfilled')).toBe(true);
        expect(await changes().count({ where: { status: 'pending' } })).toBe(1);
    });

    it('different points keep their own pending changes', async () => {
        await savePendingChange(changes(), point, proposed('A'), null);
        await savePendingChange(changes(), { id: '2', counterpartyId: '7' }, proposed('B'), null);
        expect(await changes().count({ where: { status: 'pending' } })).toBe(2);
    });
});

describe('writeErpMirror (real Postgres)', () => {
    const base = { counterpartyId: '7', isActive: true, name: 'Point', address: 'Test Street 12' };

    it('delivering the same message twice leaves one row', async () => {
        await writeErpMirror(mirror(), 'pos-1', base);
        await writeErpMirror(mirror(), 'pos-1', base);
        expect(await mirror().count()).toBe(1);
    });

    it('a later message updates the mirror and keeps the fields it omits', async () => {
        await writeErpMirror(mirror(), 'pos-1', { ...base, contactPhone: '+79990000000' });
        await writeErpMirror(mirror(), 'pos-1', { counterpartyId: '7', isActive: false });
        const row = await mirror().findOneByOrFail({ erpId: 'pos-1' });
        expect(row).toMatchObject({
            name: 'Point',
            address: 'Test Street 12',
            contactPhone: '+79990000000',
            isActive: false,
        });
    });

    it('stores an unusable location as no location', async () => {
        await writeErpMirror(mirror(), 'pos-1', { ...base, latitude: 0, longitude: 0 });
        const row = await mirror().findOneByOrFail({ erpId: 'pos-1' });
        expect([row.latitude, row.longitude]).toEqual([null, null]);
    });
});
