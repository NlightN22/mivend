import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { TransactionalConnection } from '@vendure/core';
import {
    createTestConnection,
    createTestSchema,
    dropTestSchema,
    testDataSourceConnectionOptions,
    testRequestContext,
    testSchemaOptions,
} from 'shared';

import { DiscountSetupListService } from '../../discount-setup-list.service';
import {
    SETUP_ENTITIES,
    TestPriceType,
    TestProduct,
    TestRecipient,
    TestSetup,
} from './discount-setup-harness';

@Entity('counterparty')
class TestCounterparty {
    @PrimaryGeneratedColumn() id!: number;
    @Column({ type: 'varchar' }) erpId!: string;
    @Column({ type: 'varchar', default: '' }) legalName!: string;
    @Column({ type: 'varchar', default: '' }) shortName!: string;
}

const byName: Record<string, unknown> = {
    DiscountSetup: TestSetup,
    DiscountSetupRecipient: TestRecipient,
    DiscountSetupProduct: TestProduct,
};

function mapEntity(base: TransactionalConnection): TransactionalConnection {
    return {
        withTransaction: base.withTransaction.bind(base),
        getRepository: (ctx: never, entity: unknown) =>
            base.getRepository(
                ctx,
                (byName[(entity as { name?: string }).name ?? ''] ?? entity) as never,
            ),
    } as unknown as TransactionalConnection;
}

const { schema, extra } = testSchemaOptions('price_entry_setup_list');
const ctx = testRequestContext;
const day = 24 * 3600 * 1000;
const at = (days: number): Date => new Date(Date.now() + days * day);

let dataSource: DataSource;
let service: DiscountSetupListService;
let visibleErpIds: string[] | null = null;
let allowedCodes: string[] = ['wholesale'];

interface SetupSeed {
    number: string;
    recipients?: string[];
    percent?: number;
    validFrom?: Date;
    validTo?: Date | null;
    active?: boolean;
    inactiveReason?: string | null;
    priceTypeErpId?: string | null;
    productErpIds?: string[];
}

async function setup(seed: SetupSeed): Promise<void> {
    const row = await dataSource.getRepository(TestSetup).save({
        erpId: `erp-${seed.number}`,
        documentNumber: seed.number,
        percent: seed.percent ?? 5,
        validFrom: seed.validFrom ?? at(-30),
        validTo: seed.validTo === undefined ? null : seed.validTo,
        active: seed.active ?? true,
        inactiveReason: seed.inactiveReason ?? null,
        priceTypeErpId: seed.priceTypeErpId ?? null,
        sourceVersion: 'v1',
        contentHash: 'h',
    });
    for (const cp of seed.recipients ?? []) {
        await dataSource
            .getRepository(TestRecipient)
            .save({ setupId: row.id, counterpartyErpId: cp, contractErpId: '' });
    }
    for (const p of seed.productErpIds ?? []) {
        await dataSource.getRepository(TestProduct).save({ setupId: row.id, productErpId: p });
    }
}

const numbers = async (
    options: Parameters<DiscountSetupListService['findVisible']>[1] = {},
): Promise<string[]> =>
    (await service.findVisible(ctx, { take: 100, ...options })).items.map(i => i.documentNumber);

beforeAll(async () => {
    await createTestSchema(schema);
    dataSource = new DataSource({
        type: 'postgres',
        ...testDataSourceConnectionOptions(),
        schema,
        extra,
        entities: [...SETUP_ENTITIES, TestCounterparty],
        synchronize: true,
    });
    await dataSource.initialize();
    service = new DiscountSetupListService(
        mapEntity(createTestConnection(dataSource)),
        {
            visibleErpIdsSql: async () =>
                visibleErpIds
                    ? {
                          sql: 'SELECT c."erpId" FROM counterparty c WHERE c."erpId" IN (:...dsVisible)',
                          params: { dsVisible: visibleErpIds.length ? visibleErpIds : [''] },
                      }
                    : null,
        } as never,
        { allowedCodes: async () => allowedCodes } as never,
    );
});

afterAll(async () => {
    await dataSource.destroy();
    await dropTestSchema(schema);
});

beforeEach(async () => {
    visibleErpIds = null;
    allowedCodes = ['wholesale'];
    await dataSource.query(
        'TRUNCATE discount_setup, discount_setup_recipient, discount_setup_product, counterparty, price_type RESTART IDENTITY',
    );
    await dataSource.getRepository(TestPriceType).save([
        { code: 'wholesale', externalId: 'pt-wholesale' },
        { code: 'hidden', externalId: 'pt-hidden' },
    ]);
    await dataSource.getRepository(TestCounterparty).save([
        { erpId: 'cp-visible', legalName: 'Visible Legal', shortName: 'Visible Co' },
        { erpId: 'cp-other-visible', legalName: 'Other Visible Legal', shortName: 'Other Visible' },
        { erpId: 'cp-hidden', legalName: 'Hidden Legal', shortName: 'Hidden Co' },
    ]);
    await setup({ number: '100', recipients: ['cp-visible'] });
    await setup({ number: '200', recipients: ['cp-hidden'] });
    await setup({ number: '300' });
    await setup({ number: '400', recipients: [''] });
    await setup({ number: '500', recipients: ['cp-visible', 'cp-hidden'] });
});

describe('discountSetups visibility (integration, real Postgres)', () => {
    it('scope all sees every setup and every recipient name', async () => {
        expect((await numbers()).sort()).toEqual(['100', '200', '300', '400', '500']);
        const two = (await service.findVisible(ctx, { search: '500' })).items[0];
        expect(two.counterparties.map(c => c.name).sort()).toEqual(['Hidden Co', 'Visible Co']);
    });

    it('a restricted scope sees own, wide (no recipients, empty counterparty) and partly visible setups', async () => {
        visibleErpIds = ['cp-visible'];
        expect((await numbers()).sort()).toEqual(['100', '300', '400', '500']);
    });

    it('an inactive setup without recipients is never "for everyone": only scope all sees it', async () => {
        await setup({ number: '800', inactiveReason: 'cancelled' });
        await setup({ number: '810', active: false, inactiveReason: 'no-header-percent' });
        await setup({ number: '820', recipients: ['cp-visible'], inactiveReason: 'cancelled' });
        expect((await numbers({ search: '8' })).sort()).toEqual(['800', '810', '820']);
        visibleErpIds = ['cp-visible'];
        expect((await numbers({ search: '8' })).sort()).toEqual(['820']);
        expect((await service.counts(ctx)).all).toBe(5);
    });

    it('a setup naming only hidden counterparties is invisible', async () => {
        visibleErpIds = ['cp-visible'];
        expect(await numbers({ search: '200' })).toEqual([]);
    });

    it('returns only in-scope names, with recipientCount counting the hidden ones too', async () => {
        visibleErpIds = ['cp-visible'];
        const result = await service.findVisible(ctx, { take: 100 });
        const wide = result.items.find(i => i.documentNumber === '500')!;
        expect(wide.counterparties.map(c => c.name)).toEqual(['Visible Co']);
        expect(wide.recipientCount).toBe(2);
        expect(JSON.stringify(result)).not.toContain('Hidden');
        const everyone = result.items.find(i => i.documentNumber === '400')!;
        expect(everyone.counterparties).toEqual([]);
        expect(everyone.recipientCount).toBe(0);
    });

    it('a search by a hidden counterparty name finds nothing, by a visible one finds its setups', async () => {
        visibleErpIds = ['cp-visible'];
        expect(await numbers({ search: 'Hidden' })).toEqual([]);
        expect((await numbers({ search: 'Visible Co' })).sort()).toEqual(['100', '500']);
    });

    it('filters by counterparty: its setups plus the wide ones; a hidden counterparty gives only wide ones', async () => {
        expect((await numbers({ counterpartyId: '1' })).sort()).toEqual([
            '100',
            '300',
            '400',
            '500',
        ]);
        visibleErpIds = ['cp-visible'];
        expect((await numbers({ counterpartyId: '3' })).sort()).toEqual(['300', '400']);
    });

    it('a setup bound to an unseen price type is neither listed nor counted', async () => {
        await setup({ number: '600', priceTypeErpId: 'pt-hidden' });
        await setup({ number: '700', priceTypeErpId: 'pt-wholesale' });
        expect(await numbers({ search: '600' })).toEqual([]);
        expect(await numbers({ search: '700' })).toEqual(['700']);
        expect((await service.counts(ctx)).all).toBe(6);
        allowedCodes = [];
        expect(await numbers({ search: '700' })).toEqual([]);
    });
});

describe('discountSetups status, counts, sort, paging', () => {
    beforeEach(async () => {
        await dataSource.query(
            'TRUNCATE discount_setup, discount_setup_recipient, discount_setup_product',
        );
        await setup({ number: '1', validTo: at(90), percent: 10, productErpIds: ['p1', 'p2'] });
        await setup({ number: '2', validTo: at(3), percent: -4 });
        await setup({ number: '3', validTo: at(-2), percent: 7 });
        await setup({ number: '4', inactiveReason: 'cancelled', percent: 1 });
        await setup({ number: '5', active: false, inactiveReason: 'no-header-percent' });
        await setup({ number: '6', validFrom: at(5), percent: 2 });
    });

    it('filters by each status and the counts match the lists', async () => {
        expect(await numbers({ status: 'running' })).toEqual(['1']);
        expect(await numbers({ status: 'expiring-soon' })).toEqual(['2']);
        expect(await numbers({ status: 'expired' })).toEqual(['3']);
        expect((await numbers({ status: 'inactive' })).sort()).toEqual(['4', '5']);
        expect(await numbers({ status: 'upcoming' })).toEqual(['6']);
        expect(await service.counts(ctx)).toEqual({
            all: 6,
            running: 1,
            expiringSoon: 1,
            upcoming: 1,
            expired: 1,
            inactive: 2,
        });
    });

    it('computes the row status, product count and a negative percent', async () => {
        const items = (await service.findVisible(ctx, { take: 100 })).items;
        const byNumber = Object.fromEntries(items.map(i => [i.documentNumber, i]));
        expect(byNumber['1']).toMatchObject({ status: 'running', productCount: 2 });
        expect(byNumber['2']).toMatchObject({
            status: 'expiring-soon',
            percent: -4,
            productCount: 0,
        });
        expect(byNumber['4'].inactiveReason).toBe('cancelled');
    });

    it('sorts by a whitelisted field and pages with a stable total', async () => {
        expect(await numbers({ sort: { field: 'percent', direction: 'ASC' } })).toEqual([
            '2',
            '4',
            '6',
            '5',
            '3',
            '1',
        ]);
        const page = await service.findVisible(ctx, {
            take: 2,
            skip: 2,
            sort: { field: 'documentNumber', direction: 'ASC' },
        });
        expect(page.totalItems).toBe(6);
        expect(page.items.map(i => i.documentNumber)).toEqual(['3', '4']);
    });

    it('counts under a counterparty filter use the same scope rules', async () => {
        // The two inactive setups keep no recipients, so they are not "for everyone" under a counterparty filter.
        expect((await service.counts(ctx, '1')).all).toBe(4);
    });
});
