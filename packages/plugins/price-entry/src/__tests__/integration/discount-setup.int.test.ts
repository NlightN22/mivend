import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountSetupService } from '../../discount-setup.service';
import type { DiscountSetupInput } from '../../discount-setup.service';
import {
    SETUP_ENTITIES,
    TestPriceType,
    mapSetupEntities,
    resetSetupTables,
} from './discount-setup-harness';

const { schema, extra } = testSchemaOptions('discount_setup');
const ctx = testRequestContext;
let dataSource: DataSource;
let service: DiscountSetupService;

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: SETUP_ENTITIES,
        synchronize: true,
    });
    await dataSource.initialize();
    service = new DiscountSetupService(mapSetupEntities(createTestConnection(dataSource)));
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await resetSetupTables(dataSource);
    await dataSource.getRepository(TestPriceType).save({ code: 'RETAIL', externalId: 'pt-1' });
});

function input(version: string, productErpIds: string[], overrides = {}): DiscountSetupInput {
    return {
        setup: {
            erpId: 'doc-1',
            documentNumber: '1',
            percent: 5,
            conditionName: '',
            conditionNumber: null,
            priceTypeErpId: null,
            limitPercent: null,
            validFrom: new Date('2026-01-01T00:00:00Z'),
            validTo: null,
            active: true,
            inactiveReason: null,
            allProducts: false,
            productMode: 'list',
            productFilter: null,
            sourceVersion: version,
            ...overrides,
        },
        recipients: [{ counterpartyErpId: 'cp-1', contractErpId: '' }],
        productErpIds,
    };
}

const products = async (): Promise<string[]> =>
    (
        await dataSource.query(
            `SELECT "productErpId" FROM discount_setup_product ORDER BY "productErpId"`,
        )
    ).map((r: { productErpId: string }) => r.productErpId);
const row = async (): Promise<{ active: boolean; sourceVersion: string; percent: number }> =>
    (await dataSource.query(`SELECT active, "sourceVersion", percent FROM discount_setup`))[0];

describe('DiscountSetupService.apply (real Postgres)', () => {
    it('replaces the whole product set and the recipients with a newer version', async () => {
        await service.apply(ctx, input('1', ['a', 'b', 'c']));
        const replaced = input('2', ['b', 'd']);
        replaced.recipients = [{ counterpartyErpId: 'cp-2', contractErpId: 'k-1' }];

        expect(await service.apply(ctx, replaced)).toBe('applied');

        expect(await products()).toEqual(['b', 'd']);
        expect(
            await dataSource.query(
                `SELECT "counterpartyErpId", "contractErpId" FROM discount_setup_recipient`,
            ),
        ).toEqual([{ counterpartyErpId: 'cp-2', contractErpId: 'k-1' }]);
        expect((await row()).sourceVersion).toBe('2');
    });

    it('ignores an equal or older version and leaves the data untouched', async () => {
        await service.apply(ctx, input('5', ['a']));

        expect(await service.apply(ctx, input('5', ['x', 'y'], { percent: 9 }))).toBe('stale');
        expect(await service.apply(ctx, input('4', ['x', 'y'], { percent: 9 }))).toBe('stale');

        expect(await products()).toEqual(['a']);
        expect((await row()).percent).toBe(5);
    });

    it('treats equal content under a newer version as no change, however the lists are ordered', async () => {
        await service.apply(ctx, input('1', ['a', 'b']));
        const before = await dataSource.query(
            `SELECT ctid FROM discount_setup_product ORDER BY "productErpId"`,
        );

        expect(await service.apply(ctx, input('2', ['b', 'a']))).toBe('unchanged');

        expect((await row()).sourceVersion).toBe('2');
        expect(
            await dataSource.query(
                `SELECT ctid FROM discount_setup_product ORDER BY "productErpId"`,
            ),
        ).toEqual(before);
    });

    it('stores a document mivend cannot evaluate inactive with no members, and a later version restores them', async () => {
        await service.apply(ctx, input('1', ['a', 'b']));

        await service.apply(
            ctx,
            input('2', ['a', 'b'], { active: false, inactiveReason: 'fixed-price' }),
        );
        expect(await products()).toEqual([]);
        expect((await row()).active).toBe(false);

        await service.apply(ctx, input('3', ['a', 'b']));
        expect(await products()).toEqual(['a', 'b']);
        expect((await row()).active).toBe(true);
    });

    it('keeps no product rows for an all-products setup', async () => {
        await service.apply(ctx, input('1', ['a', 'b'], { allProducts: true }));

        expect(await products()).toEqual([]);
    });
});

describe('DiscountSetupService.deactivate (real Postgres)', () => {
    it('deactivates, keeps the members, and is reactivated only by a strictly newer version', async () => {
        await service.apply(ctx, input('3', ['a']));

        expect(await service.deactivate(ctx, 'doc-1', '5')).toBe(true);
        expect(await service.apply(ctx, input('4', ['a']))).toBe('stale');
        expect(await service.apply(ctx, input('5', ['a']))).toBe('stale');
        expect((await row()).active).toBe(false);

        expect(await service.apply(ctx, input('6', ['a']))).toBe('applied');
        expect((await row()).active).toBe(true);
        expect(await products()).toEqual(['a']);
    });

    it('reports an unknown document without creating a row', async () => {
        expect(await service.deactivate(ctx, 'ghost', '1')).toBe(false);
        expect(await dataSource.query(`SELECT 1 FROM discount_setup`)).toEqual([]);
    });
});

describe('DiscountSetupService under load and concurrency (real Postgres)', () => {
    it('replaces a large list and shrinks it back, one row per id', async () => {
        const big = Array.from({ length: 60_000 }, (_, i) => `p${i}`);
        await service.apply(ctx, input('1', big));
        expect(
            await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup_product`),
        ).toEqual([{ n: 60_000 }]);

        await service.apply(ctx, input('2', big.slice(0, 10)));
        expect(
            await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup_product`),
        ).toEqual([{ n: 10 }]);
    }, 60_000);

    it('serializes concurrent replaces of one document: the highest version wins with exactly its own set', async () => {
        const versions = ['1', '2', '3', '4', '5', '6'];

        await Promise.all(
            versions.map(v =>
                service.apply(
                    ctx,
                    input(v, [`only-${v}-a`, `only-${v}-b`], { percent: Number(v) }),
                ),
            ),
        );

        expect((await row()).sourceVersion).toBe('6');
        expect((await row()).percent).toBe(6);
        expect(await products()).toEqual(['only-6-a', 'only-6-b']);
        expect(await dataSource.query(`SELECT count(*)::int AS n FROM discount_setup`)).toEqual([
            { n: 1 },
        ]);
    });
});
