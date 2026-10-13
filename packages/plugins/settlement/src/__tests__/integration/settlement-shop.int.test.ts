import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementShopService } from '../../settlement-shop.service';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementDocumentInput, SettlementEntryInput } from '../../types';

let h: Harness;
let shop: SettlementShopService;

const typeRef = async (
    documentType: string,
    category: string,
    customerVisible: boolean,
    version = '2026-10-01T10:00:00Z',
    label = documentType,
): Promise<void> => {
    await h.types.apply(ctx, {
        documentType,
        version,
        isDeleted: false,
        label,
        category,
        customerVisible,
        sortOrder: null,
    });
};

beforeAll(async () => {
    h = await createHarness('settlement_shop');
    await h.dataSource.query(
        `ALTER TABLE "order" ADD COLUMN code varchar, ADD COLUMN "customFieldsCounterpartyid" varchar`,
    );
    await h.dataSource.query(
        `CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar,
            "contractKind" varchar, "paymentDelayDays" int, "isCustomerContract" boolean)`,
    );
    await h.dataSource.query(
        `CREATE TABLE organization_requisites (id serial primary key, "erpId" varchar, "legalName" varchar)`,
    );
    shop = new SettlementShopService(h.connection);
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_balance, settlement_document_type, "order", contract, organization_requisites RESTART IDENTITY CASCADE',
    );
    await typeRef('Sale', 'sale', true);
    await typeRef('Pay', 'payment', true);
    await typeRef('Ret', 'return', true);
    h.counterparties.clear();
    h.contracts.clear();
    h.counterparties.set('cp-1', 1);
    h.counterparties.set('cp-2', 2);
    h.contracts.set('ct-1', 1);
    h.contracts.set('ct-2', 2);
    await h.dataSource.query(
        `INSERT INTO contract ("erpId", name, "contractKind", "paymentDelayDays", "isCustomerContract")
         VALUES ('ct-1', 'Main', 'client', 10, true), ('ct-2', 'Supplier deal', 'supplier', 0, NULL)`,
    );
    await h.dataSource.query(
        `INSERT INTO organization_requisites ("erpId", "legalName") VALUES ('org-1', 'Seller One')`,
    );
});

const entry = (over: Partial<SettlementEntryInput> = {}): SettlementEntryInput => ({
    organizationErpId: 'org-1',
    counterpartyErpId: 'cp-1',
    contractErpId: 'ct-1',
    currency: 'RUB',
    amount: 100,
    dueDate: null,
    orderLinks: [],
    ...over,
});

const doc = async (erpId: string, over: Partial<SettlementDocumentInput>): Promise<void> => {
    await h.documents.apply(ctx, documentInput(erpId, over));
};

const balance = async (cp: string, ct: string, opening: number, closing: number): Promise<void> => {
    await h.balances.apply(ctx, {
        key: `org-1:${cp}:${ct}`,
        version: '2026-10-01T10:00:00Z',
        isDeleted: false,
        organizationErpId: 'org-1',
        counterpartyErpId: cp,
        contractErpId: ct,
        currency: 'RUB',
        openingDate: new Date('2026-08-01T00:00:00Z'),
        openingBalance: opening,
        closingBalance: closing,
    });
};

describe('settlement shop queries (real Postgres)', () => {
    it('returns only the own counterparty and leaves the foreign one untouched', async () => {
        await doc('d-own', { number: '1', entries: [entry()] });
        await doc('d-foreign', {
            number: '2',
            entries: [entry({ counterpartyErpId: 'cp-2' })],
        });
        const own = await shop.documents(ctx, '1', {}, 0, 20);
        expect(own.items.map(i => i.number)).toEqual(['1']);
        const foreign = await shop.documents(ctx, '2', {}, 0, 20);
        expect(foreign.items.map(i => i.number)).toEqual(['2']);
        expect((await shop.documents(ctx, '3', {}, 0, 20)).totalItems).toBe(0);
    });

    it('does not show deleted documents or documents of a non-customer contract', async () => {
        await doc('d-sale', { number: '1', entries: [entry()] });
        await doc('d-supplier', { number: '2', entries: [entry({ contractErpId: 'ct-2' })] });
        await doc('d-gone', { number: '3', entries: [entry()] });
        await doc('d-gone', {
            number: '3',
            isDeleted: true,
            version: '2026-10-02T10:00:00Z',
            entries: [],
        });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).items.map(i => i.number)).toEqual(['1']);
    });

    it('filters by the reference category and shows the reference label', async () => {
        await typeRef('Bonus', 'bonus', true, '2026-10-01T10:00:00Z', 'Retro bonus accrual');
        await doc('d-sale', { number: '1', documentType: 'Sale', entries: [entry()] });
        await doc('d-pay', { number: '2', documentType: 'Pay', entries: [entry({ amount: -40 })] });
        await doc('d-bonus', {
            number: '3',
            documentType: 'Bonus',
            documentTypeLabel: 'Приходный кассовый ордер',
            entries: [entry({ amount: -5 })],
        });
        const payments = await shop.documents(ctx, '1', { category: 'payment' }, 0, 20);
        expect(payments.items.map(i => i.number)).toEqual(['2']);
        const bonus = await shop.documents(ctx, '1', { category: 'bonus' }, 0, 20);
        expect(bonus.items[0]).toMatchObject({
            category: 'bonus',
            documentTypeLabel: 'Retro bonus accrual',
        });
    });

    it('paginates server-side and filters by period and number', async () => {
        for (let i = 1; i <= 5; i += 1) {
            await doc(`d-${i}`, {
                number: String(100 + i),
                date: new Date(`2026-09-0${i}T00:00:00Z`),
                entries: [entry()],
            });
        }
        const page = await shop.documents(ctx, '1', {}, 1, 2);
        expect(page.totalItems).toBe(5);
        expect(page.items.map(i => i.number)).toEqual(['104', '103']);
        const period = await shop.documents(
            ctx,
            '1',
            {
                dateFrom: '2026-09-02',
                dateTo: '2026-09-03',
            },
            0,
            20,
        );
        expect(period.items.map(i => i.number).sort()).toEqual(['102', '103']);
        expect((await shop.documents(ctx, '1', { search: '105' }, 0, 20)).totalItems).toBe(1);
    });

    it('computes FIFO status and overdue from the balance fact', async () => {
        await balance('cp-1', 'ct-1', 0, 600);
        await doc('d-old', {
            number: '1',
            date: new Date('2026-08-05T00:00:00Z'),
            entries: [entry({ amount: 1000 })],
        });
        await doc('d-pay', {
            number: '2',
            documentType: 'Pay',
            date: new Date('2026-08-20T00:00:00Z'),
            entries: [entry({ amount: -400 })],
        });
        const page = await shop.documents(ctx, '1', {}, 0, 20);
        const sale = page.items.find(i => i.number === '1');
        expect(sale?.paymentStatus).toBe('overdue');
        expect(page.items.find(i => i.number === '2')?.paymentStatus).toBeNull();
        const [card] = await shop.balanceCards(ctx, '1');
        expect(card).toMatchObject({ currentBalance: 60000, overdue: 60000, currency: 'RUB' });
        const overdue = await shop.documents(ctx, '1', { overdueOnly: true }, 0, 20);
        expect(overdue.items.map(i => i.number)).toEqual(['1']);
    });

    it('shows an order code only for an order of the same counterparty', async () => {
        await h.dataSource.query(
            `INSERT INTO "order" (id, code, "customFieldsCounterpartyid") VALUES
               (1, '1000001', '1'), (2, '1000002', '2')`,
        );
        await doc('d-1', {
            number: '1',
            entries: [
                entry({
                    orderLinks: [
                        { orderErpId: 'o-1', orderUuid: null, amount: 50 },
                        { orderErpId: 'o-2', orderUuid: null, amount: 50 },
                    ],
                }),
            ],
        });
        await h.dataSource.query(
            `UPDATE settlement_order_link SET "orderId" = 1 WHERE "orderErpId" = 'o-1'`,
        );
        await h.dataSource.query(
            `UPDATE settlement_order_link SET "orderId" = 2 WHERE "orderErpId" = 'o-2'`,
        );
        const [row] = (await shop.documents(ctx, '1', {}, 0, 20)).items;
        expect(row.orders.map(o => o.orderCode)).toEqual(['1000001', null]);
        expect((await shop.documents(ctx, '1', { search: '1000001' }, 0, 20)).totalItems).toBe(1);
        expect((await shop.documents(ctx, '1', { search: '1000002' }, 0, 20)).totalItems).toBe(0);
    });

    it('leaves a foreign balance out of the cards', async () => {
        await balance('cp-1', 'ct-1', 0, 100);
        await balance('cp-2', 'ct-1', 0, 999);
        expect((await shop.balanceCards(ctx, '1')).map(c => c.currentBalance)).toEqual([10000]);
        expect((await shop.balanceCards(ctx, '2')).map(c => c.currentBalance)).toEqual([99900]);
    });

    it('keeps a document dated near midnight on its own calendar day', async () => {
        await doc('d-late', {
            number: '1',
            date: new Date('2026-09-02T23:59:00Z'),
            entries: [entry()],
        });
        const day = async (from: string, to: string) =>
            (await shop.documents(ctx, '1', { dateFrom: from, dateTo: to }, 0, 20)).totalItems;
        expect(await day('2026-09-02', '2026-09-02')).toBe(1);
        expect(await day('2026-09-03', '2026-09-03')).toBe(0);
        expect(await day('2026-09-01', '2026-09-01')).toBe(0);
    });

    it('treats LIKE wildcards in the search term literally', async () => {
        await doc('d-a', { number: '10%', entries: [entry()] });
        await doc('d-b', { number: '1000', entries: [entry()] });
        expect((await shop.documents(ctx, '1', { search: '10%' }, 0, 20)).items).toHaveLength(1);
        expect((await shop.documents(ctx, '1', { search: '1_' }, 0, 20)).totalItems).toBe(0);
    });

    it('masks the order id of a foreign order exactly like its code', async () => {
        await h.dataSource.query(
            `INSERT INTO "order" (id, code, "customFieldsCounterpartyid") VALUES (1, '1000001', '1'), (2, '1000002', '2')`,
        );
        await doc('d-1', {
            number: '1',
            entries: [
                entry({
                    orderLinks: [
                        { orderErpId: 'o-1', orderUuid: null, amount: 50 },
                        { orderErpId: 'o-2', orderUuid: null, amount: 50 },
                    ],
                }),
            ],
        });
        await h.dataSource.query(
            `UPDATE settlement_order_link SET "orderId" = CASE "orderErpId" WHEN 'o-1' THEN 1 ELSE 2 END`,
        );
        const [row] = (await shop.documents(ctx, '1', {}, 0, 20)).items;
        expect(row.orders.map(o => o.orderId)).toEqual(['1', null]);
        expect(row.orders.map(o => o.orderCode)).toEqual(['1000001', null]);
    });

    it('reports unknown status when the contract has no balance fact', async () => {
        await doc('d-1', { number: '1', entries: [entry({ amount: 100 })] });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).items[0].paymentStatus).toBe('unknown');
    });

    it('counts a positive opening balance as overdue in the card and the filter stays consistent', async () => {
        await balance('cp-1', 'ct-1', 700, 700);
        await doc('d-new', {
            number: '1',
            date: new Date('2026-10-12T00:00:00Z'),
            entries: [entry({ amount: 5, dueDate: new Date('2030-01-01T00:00:00Z') })],
        });
        const [card] = await shop.balanceCards(ctx, '1');
        expect(card.overdue).toBe(70000);
        expect((await shop.documents(ctx, '1', { overdueOnly: true }, 0, 20)).totalItems).toBe(0);
    });

    it('caps overdue at the current balance and keeps currencies apart', async () => {
        await h.dataSource.query(
            `UPDATE contract SET "isCustomerContract" = true WHERE "erpId" = 'ct-2'`,
        );
        await balance('cp-1', 'ct-1', 0, 100);
        await doc('d-old', {
            number: '1',
            date: new Date('2026-08-05T00:00:00Z'),
            entries: [entry({ amount: 1000 })],
        });
        await h.balances.apply(ctx, {
            key: 'org-1:cp-1:ct-2',
            version: '2026-10-01T10:00:00Z',
            isDeleted: false,
            organizationErpId: 'org-1',
            counterpartyErpId: 'cp-1',
            contractErpId: 'ct-2',
            currency: 'USD',
            openingDate: new Date('2026-08-01T00:00:00Z'),
            openingBalance: 0,
            closingBalance: 20,
        });
        const cards = await shop.balanceCards(ctx, '1');
        const rub = cards.find(c => c.currency === 'RUB');
        expect(rub).toMatchObject({ currentBalance: 10000, overdue: 10000 });
        expect(cards.find(c => c.currency === 'USD')).toMatchObject({ currentBalance: 2000 });
    });

    it('hides a type that is invisible, missing from the reference, or deleted there', async () => {
        await typeRef('Hidden', 'sale', false);
        await doc('d-hidden', { number: '1', documentType: 'Hidden', entries: [entry()] });
        await doc('d-unknown', { number: '2', documentType: 'NoReference', entries: [entry()] });
        await typeRef('Gone', 'sale', true);
        await doc('d-gone', { number: '3', documentType: 'Gone', entries: [entry()] });
        await h.types.apply(ctx, {
            documentType: 'Gone',
            version: '2026-10-02T10:00:00Z',
            isDeleted: true,
            label: 'Gone',
            category: 'sale',
            customerVisible: true,
            sortOrder: null,
        });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).totalItems).toBe(0);
    });

    it('shows a customer-contract balance only and hides a non-customer one', async () => {
        await balance('cp-1', 'ct-1', 0, 100);
        await balance('cp-1', 'ct-2', 0, 500);
        const cards = await shop.balanceCards(ctx, '1');
        expect(cards.map(c => c.contractId)).toEqual(['1']);
    });

    it('shows an unknown reference category under other', async () => {
        await typeRef('Odd', 'brand-new', true);
        await doc('d-odd', { number: '1', documentType: 'Odd', entries: [entry()] });
        const other = await shop.documents(ctx, '1', { category: 'other' }, 0, 20);
        expect(other.items.map(i => i.number)).toEqual(['1']);
        expect(other.items[0].category).toBe('other');
    });

    it('replaces a type by version and ignores a stale or repeated one', async () => {
        await typeRef('Sale', 'return', true, '2026-10-02T10:00:00Z');
        await typeRef('Sale', 'sale', false, '2026-10-01T10:00:00Z');
        await typeRef('Sale', 'return', true, '2026-10-02T10:00:00Z');
        await doc('d-1', { number: '1', documentType: 'Sale', entries: [entry()] });
        const page = await shop.documents(ctx, '1', { category: 'return' }, 0, 20);
        expect(page.items.map(i => i.number)).toEqual(['1']);
        const [{ n }] = await h.dataSource.query(
            `SELECT COUNT(*)::int AS n FROM settlement_document_type WHERE "documentType" = 'Sale'`,
        );
        expect(n).toBe(1);
    });

    it('always hides entries and balances whose contract is not imported', async () => {
        h.contracts.delete('ct-1');
        await balance('cp-1', 'ct-1', 0, 100);
        await doc('d-1', { number: '1', entries: [entry()] });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).totalItems).toBe(0);
        expect(await shop.balanceCards(ctx, '1')).toEqual([]);
    });
});
