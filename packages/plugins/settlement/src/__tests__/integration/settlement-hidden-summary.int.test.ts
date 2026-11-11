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
    h = await createHarness('settlement_hidden');
    await h.dataSource.query(
        `ALTER TABLE "order" ADD COLUMN code varchar, ADD COLUMN "customFieldsCounterpartyid" varchar`,
    );
    await h.dataSource.query(
        `CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar,
            "contractKind" varchar, "paymentDelayDays" int, "isCustomerContract" boolean,
            "controlledIndividually" boolean, "debtDaysLimit" int)`,
    );
    await h.dataSource.query(
        `CREATE TABLE counterparty (id int primary key, "paymentDelayDays" int)`,
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
        'TRUNCATE settlement_document, settlement_balance, settlement_document_type, "order", contract, counterparty, organization_requisites RESTART IDENTITY CASCADE',
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
        `INSERT INTO counterparty (id, "paymentDelayDays") VALUES (1, 10), (2, 0)`,
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

const hiddenAccounting = { reflectedInAccounting: false };

const balance = async (): Promise<void> => {
    await h.balances.apply(ctx, {
        key: 'org-1:cp-1:ct-1',
        version: '2026-10-01T10:00:00Z',
        isDeleted: false,
        organizationErpId: 'org-1',
        counterpartyErpId: 'cp-1',
        contractErpId: 'ct-1',
        currency: 'RUB',
        openingDate: new Date('2026-08-01T00:00:00Z'),
        openingBalance: 500,
        closingBalance: 900,
    });
};

describe('hidden documents stay aggregate-only (real Postgres)', () => {
    it('counts hidden documents per currency with a signed net and lists none of them', async () => {
        await doc('d-1', { number: '1', entries: [entry()] });
        await doc('d-2', {
            number: '222',
            accounting: hiddenAccounting,
            entries: [entry({ amount: 30 }), entry({ amount: -5, currency: 'USD' })],
        });
        await typeRef('Purchase', 'supplier', true);
        await doc('d-3', {
            number: '333',
            documentType: 'Purchase',
            entries: [entry({ amount: -10 })],
        });
        const page = await shop.documents(ctx, '1', {}, 0, 20);
        expect(page.items.map(i => i.number)).toEqual(['1']);
        expect(page.totalItems).toBe(1);
        expect(page.hiddenSummary).toEqual([
            { currency: 'RUB', count: 1, netAmount: 3000 },
            { currency: 'USD', count: 1, netAmount: -500 },
        ]);
        expect(JSON.stringify(page.hiddenSummary)).not.toMatch(/222|333|Purchase|supplier/);
    });

    it('ignores supplier and payroll documents whatever their accounting flag', async () => {
        await typeRef('Purchase', 'supplier', true);
        await typeRef('Salary', 'payroll', false);
        for (const [i, type] of ['Purchase', 'Salary'].entries()) {
            for (const flag of [true, false]) {
                await doc(`d-${type}-${flag}`, {
                    number: `9${i}${flag ? 1 : 0}`,
                    documentType: type,
                    accounting: { reflectedInAccounting: flag },
                    entries: [entry({ amount: 777 })],
                });
            }
        }
        expect((await shop.documents(ctx, '1', {}, 0, 20)).hiddenSummary).toEqual([]);
        await doc('d-x', { number: '1', accounting: hiddenAccounting, entries: [entry()] });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).hiddenSummary).toEqual([
            { currency: 'RUB', count: 1, netAmount: 10000 },
        ]);
    });

    it('follows the contract, organization and period filters but not search or category', async () => {
        await doc('d-1', {
            number: '1',
            date: new Date('2026-09-01T00:00:00Z'),
            accounting: hiddenAccounting,
            entries: [entry()],
        });
        await doc('d-2', {
            number: '2',
            date: new Date('2026-09-20T00:00:00Z'),
            accounting: hiddenAccounting,
            entries: [entry({ amount: 7 })],
        });
        const period = await shop.documents(ctx, '1', { dateFrom: '2026-09-10' }, 0, 20);
        expect(period.hiddenSummary).toEqual([{ currency: 'RUB', count: 1, netAmount: 700 }]);
        const other = await shop.documents(ctx, '1', { organizationId: 'org-9' }, 0, 20);
        expect(other.hiddenSummary).toEqual([]);
        const searched = await shop.documents(
            ctx,
            '1',
            { search: 'nope', category: 'sale' },
            0,
            20,
        );
        expect(searched.hiddenSummary[0]).toMatchObject({ count: 2, netAmount: 10700 });
    });

    it('searching a hidden number finds nothing and only the aggregate changes nothing else', async () => {
        await doc('d-1', { number: '1', entries: [entry()] });
        await doc('d-2', { number: '98765', accounting: hiddenAccounting, entries: [entry()] });
        const found = await shop.documents(ctx, '1', { search: '98765' }, 0, 20);
        expect(found.items).toEqual([]);
        expect(found.totalItems).toBe(0);
        const all = await shop.documents(ctx, '1', {}, 0, 20);
        expect(all.totalItems).toBe(1);
    });

    it("never counts another customer's hidden documents or a non-customer contract", async () => {
        await doc('d-1', {
            number: '1',
            accounting: hiddenAccounting,
            entries: [entry({ counterpartyErpId: 'cp-2' })],
        });
        await doc('d-2', {
            number: '2',
            accounting: hiddenAccounting,
            entries: [entry({ contractErpId: 'ct-2' })],
        });
        expect((await shop.documents(ctx, '1', {}, 0, 20)).hiddenSummary).toEqual([]);
        expect((await shop.documents(ctx, '2', {}, 0, 20)).hiddenSummary).toEqual([
            { currency: 'RUB', count: 1, netAmount: 10000 },
        ]);
    });

    it('shows the same balance cards whatever is hidden', async () => {
        await balance();
        const before = await shop.balanceCards(ctx, '1');
        await doc('d-1', {
            number: '1',
            accounting: hiddenAccounting,
            entries: [entry({ amount: 400 })],
        });
        await typeRef('Salary', 'payroll', true);
        await doc('d-2', { number: '2', documentType: 'Salary', entries: [entry({ amount: 50 })] });
        const after = await shop.balanceCards(ctx, '1');
        expect(after).toHaveLength(1);
        expect(after[0]).toMatchObject({
            openingBalance: 50000,
            currentBalance: 90000,
            currency: 'RUB',
            contractId: 'ct-1',
        });
        expect(before[0]).toMatchObject({ openingBalance: 50000, currentBalance: 90000 });
    });

    it('keeps a card for a balance without any document', async () => {
        await balance();
        expect(await shop.balanceCards(ctx, '1')).toHaveLength(1);
    });
});
