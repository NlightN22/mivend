import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { UserInputError } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountRegistryService } from '../../discount-registry.service';
import { TestRegistryEntry, mapEntity, sequentialNumbering } from './discount-registry-harness';

const { schema, extra } = testSchemaOptions('price_entry_discount_registry_list');
const ctx = testRequestContext;
const days = (n: number): Date => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const WHOLESALE = 'price-type-wholesale';
const RETAIL = 'price-type-retail';
const HIDDEN = 'price-type-confidential';

let dataSource: DataSource;
let service: DiscountRegistryService;

async function seed(
    number: string,
    priceTypeCode: string,
    status: string,
    validTo: Date,
    percent: number,
    customer: string | null,
): Promise<void> {
    await dataSource.getRepository(TestRegistryEntry).save({
        number,
        priceTypeCode,
        status,
        validFrom: days(-60),
        validTo,
        percent,
        facetValueCode: 'group-a',
        customerNamesForSearch: customer,
        justification: 'reason',
    });
}

const numbers = async (
    options: Parameters<DiscountRegistryService['findAllPaginated']>[1],
): Promise<string[]> =>
    (await service.findAllPaginated(ctx, options)).items.map(i => i.number).sort();

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [TestRegistryEntry],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new DiscountRegistryService(
        mapEntity(createTestConnection(dataSource)),
        sequentialNumbering(),
    );
    await seed('1000000001', WHOLESALE, 'materialized', days(90), 5, 'Customer One');
    await seed('1000000002', WHOLESALE, 'materialized', days(5), 10, 'Customer Two');
    await seed('1000000003', RETAIL, 'materialized', days(-3), 15, null);
    await seed('1000000004', WHOLESALE, 'pending', days(30), 20, 'Customer One');
    await seed('1000000005', RETAIL, 'rejected', days(30), 25, 'Customer Two');
    await seed('1000000006', HIDDEN, 'materialized', days(90), 30, 'Customer One');
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

const ALLOWED = [WHOLESALE, RETAIL];

describe('DiscountRegistryService list (integration, real Postgres)', () => {
    it('shows only the allowed price types, in rows and in the count', async () => {
        const result = await service.findAllPaginated(ctx, { allowedPriceTypeCodes: ALLOWED });
        expect(result.totalItems).toBe(5);
        expect(result.items.map(i => i.priceTypeCode)).not.toContain(HIDDEN);
        expect(await numbers({ allowedPriceTypeCodes: [] })).toEqual([]);
    });

    it('cannot reach a hidden price type through the builder, and refuses _or', async () => {
        expect(
            await numbers({
                allowedPriceTypeCodes: ALLOWED,
                filter: { priceType: { eq: HIDDEN } },
            }),
        ).toEqual([]);
        await expect(
            service.findAllPaginated(ctx, {
                allowedPriceTypeCodes: ALLOWED,
                filter: { _or: [{ priceType: { eq: HIDDEN } }, { status: { eq: 'active' } }] },
            }),
        ).rejects.toBeInstanceOf(UserInputError);
    });

    it('refuses an oversized filter', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        const many = Array.from({ length: 21 }, () => ({ percent: { gte: 1 } }));
        await expect(
            service.findAllPaginated(ctx, { ...scope, filter: { _and: many } }),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
            service.findAllPaginated(ctx, {
                ...scope,
                filter: { customer: { in: Array.from({ length: 101 }, (_, i) => `c${i}`) } },
            }),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
            service.findAllPaginated(ctx, {
                ...scope,
                filter: { customer: { contains: 'x'.repeat(201) } },
            }),
        ).rejects.toBeInstanceOf(UserInputError);
    });

    it('refuses malformed filter shapes', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        const bad: unknown[] = [{ _and: {} }, { _and: [null] }, { customer: { in: 'a' } }];
        for (const filter of bad) {
            await expect(
                service.findAllPaginated(ctx, { ...scope, filter: filter as never }),
            ).rejects.toBeInstanceOf(UserInputError);
        }
    });

    it('derives active, expiring-soon and expired from validTo and keeps stored statuses', async () => {
        const view = (
            status: 'active' | 'expiring-soon' | 'expired' | 'pending' | 'rejected',
        ): Promise<string[]> => numbers({ allowedPriceTypeCodes: ALLOWED, status });
        expect(await view('active')).toEqual(['1000000001']);
        expect(await view('expiring-soon')).toEqual(['1000000002']);
        expect(await view('expired')).toEqual(['1000000003']);
        expect(await view('pending')).toEqual(['1000000004']);
        expect(await view('rejected')).toEqual(['1000000005']);
    });

    it('filters by the derived status, a number range and a customer through the builder', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        expect(
            await numbers({ ...scope, filter: { status: { in: ['pending', 'rejected'] } } }),
        ).toEqual(['1000000004', '1000000005']);
        expect(await numbers({ ...scope, filter: { percent: { gte: 10, lt: 20 } } })).toEqual([
            '1000000002',
            '1000000003',
        ]);
        expect(await numbers({ ...scope, filter: { customer: { contains: 'two' } } })).toEqual([
            '1000000002',
            '1000000005',
        ]);
        expect(await numbers({ ...scope, filter: { customer: { isNull: true } } })).toEqual([
            '1000000003',
        ]);
        expect(
            await numbers({
                ...scope,
                filter: { validTo: { between: { start: days(-10), end: days(10) } } },
            }),
        ).toEqual(['1000000002', '1000000003']);
    });

    it('searches by the number (also in its displayed form) and by customer', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        expect(await numbers({ ...scope, search: '1000000004' })).toEqual(['1000000004']);
        expect(await numbers({ ...scope, search: '100-0000004' })).toEqual(['1000000004']);
        expect(await numbers({ ...scope, search: 'customer two' })).toEqual([
            '1000000002',
            '1000000005',
        ]);
    });

    it('treats LIKE metacharacters in the search as plain text', async () => {
        expect(await numbers({ allowedPriceTypeCodes: ALLOWED, search: '%' })).toEqual([]);
        expect(await numbers({ allowedPriceTypeCodes: ALLOWED, search: '_' })).toEqual([]);
    });

    it('answers take:0 with the count only and clamps take', async () => {
        const counted = await service.findAllPaginated(ctx, {
            allowedPriceTypeCodes: ALLOWED,
            take: 0,
            filter: { status: { eq: 'active' } },
        });
        expect(counted).toEqual({ items: [], totalItems: 1 });
        const clamped = await service.findAllPaginated(ctx, {
            allowedPriceTypeCodes: ALLOWED,
            take: -4,
        });
        expect(clamped.items).toEqual([]);
        expect(clamped.totalItems).toBe(5);
    });

    it('sorts by the chosen field with a stable tiebreak and pages without overlap', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        const sorted = await service.findAllPaginated(ctx, { ...scope, sort: { percent: 'ASC' } });
        expect(sorted.items.map(i => i.percent)).toEqual([5, 10, 15, 20, 25]);
        const first = await service.findAllPaginated(ctx, { ...scope, take: 2 });
        const second = await service.findAllPaginated(ctx, { ...scope, take: 2, skip: 2 });
        const ids = [...first.items, ...second.items].map(i => i.id);
        expect(new Set(ids).size).toBe(4);
    });

    it('rejects hostile input and leaves the table intact', async () => {
        const scope = { allowedPriceTypeCodes: ALLOWED };
        const injected = await service.findAllPaginated(ctx, {
            ...scope,
            filter: { customer: { eq: "x' OR 1=1; DROP TABLE discount_registry_entry; --" } },
        });
        expect(injected.totalItems).toBe(0);
        expect(await dataSource.getRepository(TestRegistryEntry).count()).toBe(6);
        await expect(
            service.findAllPaginated(ctx, { ...scope, filter: { justification: { eq: 'x' } } }),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
            service.findAllPaginated(ctx, { ...scope, filter: { percent: { gte: 'abc' } } }),
        ).rejects.toBeInstanceOf(UserInputError);
        await expect(
            service.findAllPaginated(ctx, {
                ...scope,
                sort: { '"entry"."id"; DROP TABLE x': 'ASC' },
            }),
        ).rejects.toBeInstanceOf(UserInputError);
    });
});
