import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type {
    CustomerService,
    GlobalSettingsService,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import type { BranchSettingsService, WarehouseService } from '@mivend/plugin-access-control';
import type { CounterpartyService } from '@mivend/plugin-counterparty';
import {
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testSchemaOptions,
} from 'shared';

import type { ReservationAvailabilityService } from '../../reservation-availability.service';
import { StockLevelService } from '../../stock-level.service';

// StockLevelService is the one place every customer-facing stockLevel (catalog, product page, cart) is produced.
@Entity('product_variant')
class TVariant {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ name: 'customFieldsUnitratiotobase', type: 'double precision', nullable: true })
    ratio!: number | null;
}

const { schema, extra } = testSchemaOptions('stock_level_pack_ratio');
let dataSource: DataSource;
const ctx = {} as RequestContext;

function build(atp: Map<string, number>, packagesOnly: boolean): StockLevelService {
    const connection = {
        getRepository: () => ({ query: (sql: string, p?: unknown[]) => dataSource.query(sql, p) }),
    } as unknown as TransactionalConnection;
    return new StockLevelService(
        {
            getAvailableToPromiseBatch: async () => atp,
        } as unknown as ReservationAvailabilityService,
        {
            getGlobalDefaultBranchId: async () => 'branch-a',
            resolveEffective: async () => ({ packagesOnly }),
        } as unknown as BranchSettingsService,
        {} as WarehouseService,
        { getSettings: async () => ({ customFields: {} }) } as unknown as GlobalSettingsService,
        {} as CustomerService,
        {} as CounterpartyService,
        connection,
    );
}

describe('StockLevelService on real Postgres: packs variant', () => {
    const ids: Record<string, string> = {};

    beforeAll(async () => {
        await createTestSchema(schema);
        dataSource = new DataSource({
            type: 'postgres',
            ...testDataSourceConnectionOptions(),
            schema,
            extra,
            entities: [TVariant],
            synchronize: true,
        });
        await dataSource.initialize();
        const repo = dataSource.getRepository(TVariant);
        for (const [name, ratio] of [
            ['pack', 50],
            ['piece', null],
            ['unit', 1],
        ] as const) {
            ids[name] = String((await repo.save({ ratio })).id);
        }
    });

    afterAll(async () => {
        await dataSource.destroy();
        await dropTestSchema(schema);
    });

    it.each([
        [20, 'OUT_OF_STOCK'],
        [50, 'LOW_STOCK'],
        [99, 'LOW_STOCK'],
        [100, 'LOW_STOCK'],
    ])('packs-only branch: %i base units of a pack-50 variant is %s', async (qty, tier) => {
        const atp = new Map([
            [ids.pack, qty],
            [ids.piece, 20],
            [ids.unit, 20],
        ]);
        const tiers = await build(atp, true).getTiers(ctx, [ids.pack, ids.piece, ids.unit]);
        expect(tiers.get(ids.pack)).toBe(tier);
        expect(tiers.get(ids.piece)).toBe('HIGH_STOCK');
        expect(tiers.get(ids.unit)).toBe('HIGH_STOCK');
    });

    it('piece-selling branch keeps base units for the same variant', async () => {
        const tiers = await build(new Map([[ids.pack, 20]]), false).getTiers(ctx, [ids.pack]);
        expect(tiers.get(ids.pack)).toBe('HIGH_STOCK');
    });

    it('getTier (the Shop API stockLevel field) goes through the same rule', async () => {
        const service = build(new Map([[ids.pack, 20]]), true);
        expect(await service.getTier({} as RequestContext, ids.pack)).toBe('OUT_OF_STOCK');
    });
});
