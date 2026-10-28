import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import type { Order, TransactionalConnection } from '@vendure/core';
import type { Counterparty } from '@mivend/plugin-counterparty';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { loadProductAttributes } from '../../discount-setup-filter-lookup';
import { DiscountSetupReclassifyService } from '../../discount-setup-reclassify.service';
import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { DiscountSetupService } from '../../discount-setup.service';
import { LookupMemo } from '../../lookup-memo';
import {
    SETUP_ENTITIES,
    TestPriceType,
    mapSetupEntities,
    resetSetupTables,
} from './discount-setup-harness';
import { CATALOG_TABLES_SQL, seedCatalog } from './discount-setup-filter-catalog';

const { schema, extra } = testSchemaOptions('discount_setup_filter');
const ctx = testRequestContext;
const day = 24 * 60 * 60 * 1000;
const now = new Date();
const MAKER = 'Номенклатура.Производитель';
const ITEM = 'Номенклатура';
let dataSource: DataSource;
let connection: TransactionalConnection;
let setups: DiscountSetupService;
let rules: DiscountSetupRulesService;
let queries = 0;
let seeded = 0;

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
    await dataSource.query(CATALOG_TABLES_SQL);
    const base = createTestConnection(dataSource);
    connection = {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (c: never, entity: unknown) => {
            const repo = base.getRepository(c, entity as never) as {
                query?: (...a: unknown[]) => unknown;
            };
            if (typeof repo.query !== 'function') return repo;
            return {
                query: (...args: unknown[]) => {
                    queries += 1;
                    return repo.query!(...args);
                },
            };
        },
    } as unknown as TransactionalConnection;
    setups = new DiscountSetupService(mapSetupEntities(base));
    rules = new DiscountSetupRulesService(connection);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await resetSetupTables(dataSource);
    await dataSource.getRepository(TestPriceType).save({ code: 'RETAIL', externalId: 'pt-1' });
    await seedCatalog(dataSource);
    queries = 0;
});

const ref = (refId: string) => ({ refId });
const cond = (field: string, comparison: string, ...ids: string[]) => ({
    field,
    comparison,
    values: ids.map(ref),
});

async function seedFilter(percent: number, filter: unknown[] | null): Promise<string> {
    seeded += 1;
    const erpId = `doc-${seeded}`;
    await setups.apply(ctx, {
        setup: {
            erpId,
            documentNumber: '',
            percent,
            conditionName: '',
            conditionNumber: null,
            priceTypeErpId: null,
            limitPercent: null,
            validFrom: new Date(now.getTime() - day),
            validTo: null,
            active: true,
            inactiveReason: null,
            allProducts: false,
            productMode: 'filter',
            productFilter: filter,
            sourceVersion: '1',
        },
        recipients: [{ counterpartyErpId: 'cp-1', contractErpId: '' }],
        productErpIds: [],
        operationKind: '',
    });
    return erpId;
}

const stored = async (erpId: string): Promise<{ active: boolean; inactiveReason: string | null }> =>
    (
        await dataSource.query(
            `SELECT active, "inactiveReason" FROM discount_setup WHERE "erpId" = $1`,
            [erpId],
        )
    )[0];
const cp = { erpId: 'cp-1' } as Counterparty;
const order = { customFields: { erpContractId: '' } } as unknown as Order;

function best(
    product: string,
    over: { order?: Order; quantities?: Record<string, number>; memo?: LookupMemo } = {},
): Promise<number | null> {
    return rules.getBestPercent(
        ctx,
        over.order,
        cp,
        'RETAIL',
        product,
        new Map(Object.entries(over.quantities ?? {})),
        0,
        now,
        over.memo,
    );
}

describe('product attribute query (real Postgres)', () => {
    it('returns manufacturer, own and ancestor categories, product-level categories, and none when unresolved', async () => {
        const attrs = await loadProductAttributes(connection, ctx, [
            'p-leaf',
            'p-prod-level',
            'p-orphan',
            'p-nomaker',
            'ghost',
        ]);

        expect(attrs.get('p-leaf')).toMatchObject({ manufacturerRef: 'm-1' });
        expect([...attrs.get('p-leaf')!.categoryRefs].sort()).toEqual(['c-leaf', 'c-mid', 'c-top']);
        expect([...attrs.get('p-prod-level')!.categoryRefs].sort()).toEqual(['c-mid', 'c-top']);
        expect(attrs.get('p-orphan')!.categoryRefs.size).toBe(0);
        expect(attrs.get('p-nomaker')!.manufacturerRef).toBeNull();
        expect(attrs.has('ghost')).toBe(false);
    });
});

describe('filter setups in catalog, cart and order (real Postgres)', () => {
    it('applies one hierarchy + manufacturer setup identically everywhere', async () => {
        await seedFilter(7, [cond(MAKER, 'Равно', 'm-1'), cond(ITEM, 'ВИерархии', 'c-top')]);
        const lines = { 'p-leaf': 1, 'p-prod-level': 2, 'p-other-maker': 1 };

        for (const product of ['p-leaf', 'p-prod-level', 'p-other-maker', 'p-orphan']) {
            const expected = product === 'p-leaf' || product === 'p-prod-level' ? 7 : null;
            const catalog = await best(product);
            const cart = await best(product, { order, quantities: lines });
            const memoized = await best(product, {
                order,
                quantities: lines,
                memo: new LookupMemo(),
            });
            expect([product, catalog, cart, memoized]).toEqual([
                product,
                expected,
                expected,
                expected,
            ]);
        }
    });

    it('fails closed for an unsynced ref, also negated, and keeps the best of several setups', async () => {
        await seedFilter(9, [cond(ITEM, 'НеВИерархии', 'c-ghost')]);
        await seedFilter(3, [cond(ITEM, 'НеВИерархии', 'c-other')]);
        await seedFilter(4, [cond(MAKER, 'ВСписке', 'm-1', 'm-ghost')]);

        expect(await best('p-leaf')).toBe(4);
        expect(await best('p-other-maker')).toBe(3);
        expect(await best('p-nomaker')).toBeNull();
    });

    it('stores an unsupported shape inactive with its reason and terms for an evaluable one', async () => {
        const unknown = await seedFilter(5, [cond('Поставщик', 'Равно', 'x')]);
        const comparison = await seedFilter(5, [cond(ITEM, 'Больше', 'x')]);
        const empty = await seedFilter(5, null);
        const ok = await seedFilter(5, [cond(ITEM, 'ВСпискеПоИерархии', 'c-mid', 'p-leaf')]);

        expect(await stored(unknown)).toEqual({
            active: false,
            inactiveReason: 'unknown-filter-field',
        });
        expect(await stored(comparison)).toEqual({
            active: false,
            inactiveReason: 'unknown-comparison',
        });
        expect(await stored(empty)).toEqual({ active: false, inactiveReason: 'empty-filter' });
        expect(await stored(ok)).toEqual({ active: true, inactiveReason: null });
    });
});

describe('query counts (no per-product storm)', () => {
    it('a 100-line cart costs a constant number of queries', async () => {
        await seedFilter(7, [cond(MAKER, 'Равно', 'm-1')]);
        const lines: Record<string, number> = {};
        for (let i = 0; i < 100; i++) lines[i === 0 ? 'p-leaf' : `ghost-${i}`] = 1;
        const memo = new LookupMemo();
        queries = 0;

        for (const product of Object.keys(lines)) {
            await best(product, { order, quantities: lines, memo });
        }

        // rules + filter terms + ref resolution + product attributes, once for the whole cart
        expect(queries).toBe(4);
    });

    it('a catalog page costs one attribute query per product on top of the shared lookups', async () => {
        await seedFilter(7, [cond(MAKER, 'Равно', 'm-1')]);
        const memo = new LookupMemo();
        const products = Array.from({ length: 24 }, (_, i) => `ghost-${i}`);
        queries = 0;

        for (const product of products) await best(product, { memo });

        // rules + terms + refs, then one attribute query per product
        expect(queries).toBe(3 + products.length);
    });
});

describe('legacy reclassification (real Postgres)', () => {
    it('writes terms, marks an evaluable row for re-delivery, and is idempotent', async () => {
        const evaluable = await seedFilter(5, [cond(ITEM, 'ВИерархии', 'c-top')]);
        const unknown = await seedFilter(5, [cond(ITEM, 'Больше', 'x')]);
        await dataSource.query(
            `DELETE FROM discount_setup_filter_term;
             UPDATE discount_setup SET active = false, "inactiveReason" = 'product-filter'`,
        );
        const service = new DiscountSetupReclassifyService(connection, {} as never, {} as never);

        expect(await service.reclassifyLegacy(ctx)).toBe(2);
        expect(await service.reclassifyLegacy(ctx)).toBe(0);

        expect((await stored(evaluable)).inactiveReason).toBe('awaiting-redelivery');
        expect((await stored(unknown)).inactiveReason).toBe('unknown-comparison');
        const terms = await dataSource.query(`SELECT "setupId" FROM discount_setup_filter_term`);
        expect(terms).toHaveLength(1);
        const [row] = await dataSource.query(
            `SELECT "sourceVersion" FROM discount_setup WHERE "erpId" = $1`,
            [evaluable],
        );
        expect(row.sourceVersion).toBe('0');
    });

    it('lets a re-delivered version activate the reclassified row', async () => {
        const erpId = await seedFilter(5, [cond(ITEM, 'ВИерархии', 'c-top')]);
        await dataSource.query(
            `UPDATE discount_setup SET active = false, "inactiveReason" = 'product-filter'`,
        );
        await new DiscountSetupReclassifyService(
            connection,
            {} as never,
            {} as never,
        ).reclassifyLegacy(ctx);
        seeded -= 1;

        await seedFilter(5, [cond(ITEM, 'ВИерархии', 'c-top')]);

        expect(await stored(erpId)).toEqual({ active: true, inactiveReason: null });
        expect(await best('p-leaf')).toBe(5);
    });
});
