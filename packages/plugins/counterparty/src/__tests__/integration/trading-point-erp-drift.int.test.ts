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

import { ContactPerson } from '../../entities/contact-person.entity';
import { Counterparty } from '../../entities/counterparty.entity';
import { TradingPoint } from '../../entities/trading-point.entity';
import { TradingPointErp } from '../../entities/trading-point-erp.entity';
import { TradingPointLocationReportService } from '../../trading-point-location-report.service';

const { schema, extra } = testSchemaOptions('trading_point_erp_drift');
const ctx = {} as RequestContext;
let dataSource: DataSource;
let service: TradingPointLocationReportService;
let counterpartyId: string;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [Counterparty, TradingPoint, ContactPerson, TradingPointErp],
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
    await dataSource.query(
        `TRUNCATE contact_person, trading_point, trading_point_erp, counterparty RESTART IDENTITY CASCADE`,
    );
    const cp = await dataSource
        .getRepository(Counterparty)
        .save(
            dataSource
                .getRepository(Counterparty)
                .create({ erpId: 'cp-1' } as never) as unknown as Counterparty,
        );
    counterpartyId = String(cp.id);
});

const sent = { name: 'Point', address: 'Test Street 12', latitude: 10.5, longitude: 20.5 };

async function seed(erpId: string, ours: Partial<typeof sent>, mirrored = true): Promise<void> {
    const base = { erpId, counterpartyId, workingHours: null, isActive: true };
    await dataSource
        .getRepository(TradingPoint)
        .save(dataSource.getRepository(TradingPoint).create({ ...base, ...sent, ...ours }));
    if (mirrored) {
        await dataSource
            .getRepository(TradingPointErp)
            .save(
                dataSource
                    .getRepository(TradingPointErp)
                    .create({ ...base, ...sent, contactPhone: null }),
            );
    }
}

describe('trading point drift against the ERP mirror (real Postgres)', () => {
    it('lists only the points whose record moved away from what the ERP sent', async () => {
        await seed('same', {});
        await seed('renamed', { name: 'Our name' });
        await seed('moved', { latitude: 11 });

        const { items, totalItems } = await service.listDifferingFromErp(ctx);

        expect(items.map(i => i.erpId).sort()).toEqual(['moved', 'renamed']);
        expect(totalItems).toBe(2);
    });

    it('lists the points the ERP never sent', async () => {
        await seed('known', {});
        await seed('cust_1', {}, false);

        const { items } = await service.listNotConfirmedByErp(ctx);

        expect(items.map(i => i.erpId)).toEqual(['cust_1']);
    });

    it('does not report a point without a mirror row as drifted', async () => {
        await seed('cust_1', { name: 'Anything' }, false);

        expect((await service.listDifferingFromErp(ctx)).totalItems).toBe(0);
    });
});
