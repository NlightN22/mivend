import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import { fillMissingLocation } from '../../trading-point-location';

@Entity('trading_point')
class TradingPointRecord {
    @PrimaryGeneratedColumn('increment') id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'float', nullable: true }) latitude!: number | null;
    @Column({ type: 'float', nullable: true }) longitude!: number | null;
}

const { schema, extra } = testSchemaOptions('trading_point_location_fill');
let dataSource: DataSource;

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
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await dataSource.getRepository(TradingPointRecord).clear();
});

const repo = () => dataSource.getRepository(TradingPointRecord);

async function seed(latitude: number | null, longitude: number | null): Promise<number> {
    return (await repo().save({ erpId: 'pos-1', latitude, longitude })).id;
}

async function read(id: number) {
    const row = await repo().findOneByOrFail({ id });
    return { latitude: row.latitude, longitude: row.longitude };
}

describe('fillMissingLocation (real Postgres)', () => {
    it.each([
        ['null coordinates', null, null],
        ['one null coordinate', 5, null],
        ['a (0, 0) pair', 0, 0],
        ['an out-of-range pair', 95, 10],
    ])('fills a point with %s', async (_name, lat, lng) => {
        const id = await seed(lat, lng);
        await fillMissingLocation(repo(), id, { latitude: 11, longitude: 21 });
        expect(await read(id)).toEqual({ latitude: 11, longitude: 21 });
    });

    it('leaves a point that already has a valid location untouched', async () => {
        const id = await seed(10.5, 20.5);
        await fillMissingLocation(repo(), id, { latitude: 11, longitude: 21 });
        expect(await read(id)).toEqual({ latitude: 10.5, longitude: 20.5 });
    });

    it('concurrent fills with different values leave exactly one of them in place', async () => {
        const id = await seed(null, null);
        await Promise.all([
            fillMissingLocation(repo(), id, { latitude: 11, longitude: 21 }),
            fillMissingLocation(repo(), id, { latitude: 12, longitude: 22 }),
        ]);
        const row = await read(id);
        expect([
            { latitude: 11, longitude: 21 },
            { latitude: 12, longitude: 22 },
        ]).toContainEqual(row);
    });

    it('does not overwrite a location a customer saved between the stream read and the fill', async () => {
        const id = await seed(null, null);
        await repo().update({ id }, { latitude: 7, longitude: 8 });
        await fillMissingLocation(repo(), id, { latitude: 11, longitude: 21 });
        expect(await read(id)).toEqual({ latitude: 7, longitude: 8 });
    });
});
