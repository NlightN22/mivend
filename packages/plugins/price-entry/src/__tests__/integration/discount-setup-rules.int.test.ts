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

import { DiscountSetupRulesService } from '../../discount-setup-rules.service';
import { DiscountSetupService } from '../../discount-setup.service';
import type { DiscountRecipientInput } from '../../discount-setup.service';
import { LookupMemo } from '../../lookup-memo';
import {
    AMOUNT_KIND,
    QUANTITY_KIND,
    UNCONDITIONAL_KIND,
    SETUP_ENTITIES,
    TestPriceType,
    mapSetupEntities,
    resetSetupTables,
} from './discount-setup-harness';

const { schema, extra } = testSchemaOptions('discount_setup_rules');
const ctx = testRequestContext;
const day = 24 * 60 * 60 * 1000;
const now = new Date();
let dataSource: DataSource;
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
    const base = createTestConnection(dataSource);
    const counting = {
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
    rules = new DiscountSetupRulesService(counting);
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    await resetSetupTables(dataSource);
    await dataSource.getRepository(TestPriceType).save({ code: 'RETAIL', externalId: 'pt-1' });
    queries = 0;
});

interface Seed {
    percent: number;
    products?: string[];
    productPercents?: Array<{ productErpId: string; percent: number }>;
    allProducts?: boolean;
    recipients?: DiscountRecipientInput[];
    conditionName?: string;
    conditionNumber?: number | null;
    priceTypeErpId?: string | null;
    validFrom?: Date;
    validTo?: Date | null;
    active?: boolean;
}

async function seed(s: Seed): Promise<void> {
    seeded += 1;
    await setups.apply(ctx, {
        setup: {
            erpId: `doc-${seeded}`,
            documentNumber: '',
            percent: s.percent,
            conditionName: s.conditionName ?? '',
            conditionNumber: s.conditionNumber ?? null,
            priceTypeErpId: s.priceTypeErpId ?? null,
            limitPercent: null,
            validFrom: s.validFrom ?? new Date(now.getTime() - day),
            validTo: s.validTo === undefined ? null : s.validTo,
            active: s.active ?? true,
            inactiveReason: s.active === false ? 'test' : null,
            allProducts: s.allProducts ?? false,
            productMode: 'list',
            productFilter: null,
            sourceVersion: '1',
        },
        recipients: s.recipients ?? [{ counterpartyErpId: 'cp-1', contractErpId: '' }],
        productErpIds: s.products ?? [],
        productPercents: s.productPercents,
        operationKind: '',
    });
}

const cp = (erpId = 'cp-1'): Counterparty => ({ erpId }) as Counterparty;
const orderWith = (contract: string | null): Order =>
    ({ customFields: { erpContractId: contract } }) as unknown as Order;

function best(
    over: {
        counterparty?: Counterparty | null;
        order?: Order;
        priceType?: string | null;
        product?: string | null;
        quantities?: Record<string, number>;
        amount?: number;
        memo?: LookupMemo;
    } = {},
): Promise<number | null> {
    return rules.getBestPercent(
        ctx,
        over.order,
        over.counterparty === undefined ? cp() : over.counterparty,
        over.priceType === undefined ? 'RETAIL' : over.priceType,
        over.product === undefined ? 'p1' : over.product,
        new Map(Object.entries(over.quantities ?? {})),
        over.amount ?? 0,
        now,
        over.memo,
    );
}

describe('DiscountSetupRulesService matching (real Postgres)', () => {
    it('matches the counterparty of the setup and nobody else; no counterparty means no rule', async () => {
        await seed({ percent: 5, allProducts: true });

        expect(await best()).toBe(5);
        expect(await best({ counterparty: cp('cp-2') })).toBeNull();
        expect(await best({ counterparty: null })).toBeNull();
    });

    it('lets an empty recipient row cover every counterparty', async () => {
        await seed({
            percent: 4,
            allProducts: true,
            recipients: [{ counterpartyErpId: '', contractErpId: '' }],
        });

        expect(await best({ counterparty: cp('anyone') })).toBe(4);
    });

    it('applies a contract-scoped setup only to an order on that contract, never to the catalog', async () => {
        await seed({
            percent: 6,
            allProducts: true,
            recipients: [{ counterpartyErpId: 'cp-1', contractErpId: 'k-1' }],
        });

        expect(await best({ order: orderWith('k-1') })).toBe(6);
        expect(await best({ order: orderWith('k-2') })).toBeNull();
        expect(await best()).toBeNull();
    });

    it('applies a price-type-scoped setup only to a customer on that price type', async () => {
        await seed({ percent: -3, allProducts: true, priceTypeErpId: 'pt-1' });

        expect(await best({ priceType: 'RETAIL' })).toBe(-3);
        expect(await best({ priceType: 'WHOLESALE' })).toBeNull();
        expect(await best({ priceType: null })).toBeNull();
    });

    it('prices a product with its own line percent and the others with the header percent', async () => {
        await seed({
            percent: 7,
            products: ['p1', 'p2'],
            productPercents: [{ productErpId: 'p1', percent: 20 }],
        });
        expect(await best({ product: 'p1' })).toBe(20);
        expect(await best({ product: 'p2' })).toBe(7);
        expect(await best({ product: 'p9' })).toBeNull();
    });

    it('matches a list setup only for a member product', async () => {
        await seed({ percent: 7, products: ['p1', 'p2'] });

        expect(await best({ product: 'p2' })).toBe(7);
        expect(await best({ product: 'p9' })).toBeNull();
    });

    it('sums a quantity threshold over the list members only', async () => {
        await seed({
            percent: 8,
            products: ['p1', 'p2'],
            conditionName: QUANTITY_KIND,
            conditionNumber: 10,
        });

        expect(await best({ quantities: { p1: 6, p2: 3, p9: 100 } })).toBeNull();
        expect(await best({ quantities: { p1: 6, p2: 4, p9: 100 } })).toBe(8);
    });

    it('compares a document-amount threshold in kopecks against currency units', async () => {
        await seed({
            percent: 9,
            allProducts: true,
            conditionName: AMOUNT_KIND,
            conditionNumber: 100,
        });

        expect(await best({ amount: 9999 })).toBeNull();
        expect(await best({ amount: 10000 })).toBe(9);
    });

    it('applies a named no-condition kind at any quantity and amount, catalog included', async () => {
        await seed({
            percent: 6,
            allProducts: true,
            conditionName: UNCONDITIONAL_KIND,
            conditionNumber: 100,
        });

        expect(await best()).toBe(6);
        expect(await best({ amount: 0, quantities: {} })).toBe(6);
    });

    it('never matches a condition the kind table does not know', async () => {
        await seed({
            percent: 5,
            allProducts: true,
            conditionName: 'payment-kind-condition',
            conditionNumber: 0,
        });

        expect(await best()).toBeNull();
    });

    it('honors the validity window and the active flag', async () => {
        await seed({ percent: 1, allProducts: true, validTo: new Date(now.getTime() - 1000) });
        await seed({ percent: 2, allProducts: true, validFrom: new Date(now.getTime() + day) });
        await seed({ percent: 3, allProducts: true, active: false });

        expect(await best()).toBeNull();

        await seed({ percent: 4, allProducts: true, validTo: new Date(now.getTime() + day) });
        expect(await best()).toBe(4);
    });

    it('takes the highest percent among overlapping setups, never the sum', async () => {
        await seed({ percent: -5, allProducts: true });
        await seed({ percent: 3, allProducts: true });
        await seed({ percent: 10, products: ['p1'] });

        expect(await best()).toBe(10);
        expect(await best({ product: 'p2' })).toBe(3);
    });

    it('loads the setup headers once for many products when a memo is shared', async () => {
        await seed({ percent: 5, products: ['p0', 'p1'] });
        const memo = new LookupMemo();

        for (let i = 0; i < 20; i++) await best({ product: `p${i}`, memo });

        const headerQueries = 1;
        const memberQueries = 20;
        expect(queries).toBe(headerQueries + memberQueries);
    });
});
