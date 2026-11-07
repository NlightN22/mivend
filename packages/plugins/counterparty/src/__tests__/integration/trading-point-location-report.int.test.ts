import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { RequestContext } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { TradingPointLocationReportService } from '../../trading-point-location-report.service';

@Entity('trading_point')
class TradingPointRecord {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
    @Column({ type: 'boolean', default: true }) isActive!: boolean;
}

const { schema, extra } = testSchemaOptions('trading_point_location_report');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: TradingPointLocationReportService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TradingPointRecord],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new TradingPointLocationReportService(createTestConnection(dataSource));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TradingPointRecord).clear();
});

async function seed(
    erpId: string,
    latitude: number | null,
    longitude: number | null,
    isActive = true,
) {
    await dataSource
        .getRepository(TradingPointRecord)
        .save({ erpId, latitude, longitude, isActive });
}

describe('TradingPointLocationReportService (real Postgres)', () => {
    it('counts active points with a missing coordinate, not complete or inactive ones', async () => {
        await seed('a-ok', 1, 2);
        await seed('b-none', null, null);
        await seed('c-half', 1, null);
        await seed('d-inactive', null, null, false);

        expect(await service.countMissing(ctx)).toBe(2);
    });

    it('also counts (0, 0) and out-of-range coordinates', async () => {
        await seed('a-ok', 1, 2);
        await seed('b-zero', 0, 0);
        await seed('c-lat', 91, 2);
        await seed('d-lng', 1, -181);
        await seed('e-equator', 0, 5);

        expect(await service.countMissing(ctx)).toBe(3);
    });

    it('is zero when every active point has a location', async () => {
        await seed('a-ok', 1, 2);
        expect(await service.countMissing(ctx)).toBe(0);
    });
});
