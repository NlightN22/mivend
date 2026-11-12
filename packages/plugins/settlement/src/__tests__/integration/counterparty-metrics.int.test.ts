import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { CounterpartyMetricsService } from '../../counterparty-metrics.service';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementDocumentInput } from '../../types';

let h: Harness;
let service: CounterpartyMetricsService;

const NOW = new Date('2026-11-12T12:00:00Z');
const TZ = process.env.TZ;

const type = async (documentType: string, category: string, movesTurnover: boolean): Promise<void> => {
    await h.types.apply(ctx, {
        documentType,
        version: '2026-10-01T10:00:00Z',
        isDeleted: false,
        label: documentType,
        category,
        customerVisible: false,
        sortOrder: null,
    });
    await h.dataSource.query(
        `UPDATE settlement_document_type SET "movesTurnover" = $2 WHERE "documentType" = $1`,
        [documentType, movesTurnover],
    );
};

const doc = (
    erpId: string,
    documentType: string,
    date: string,
    amount: number,
    over: { cp?: string; ct?: string; isDeleted?: boolean } = {},
): Promise<unknown> =>
    h.documents.apply(
        ctx,
        documentInput(erpId, {
            documentType,
            date: new Date(date),
            isDeleted: over.isDeleted ?? false,
            entries: [
                {
                    organizationErpId: 'org-1',
                    counterpartyErpId: over.cp ?? 'cp-1',
                    contractErpId: over.ct ?? 'ct-1',
                    currency: 'RUB',
                    amount,
                    dueDate: null,
                    orderLinks: [],
                },
            ],
        } as Partial<SettlementDocumentInput>),
    );

const balance = (cp: string, ct: string, closing: number, over: { isDeleted?: boolean } = {}): Promise<unknown> =>
    h.balances.apply(ctx, {
        key: `org-1:${cp}:${ct}`,
        version: '2026-10-01T10:00:00Z',
        isDeleted: over.isDeleted ?? false,
        organizationErpId: 'org-1',
        counterpartyErpId: cp,
        contractErpId: ct,
        currency: 'RUB',
        openingDate: null,
        openingBalance: 0,
        closingBalance: closing,
    });

beforeAll(async () => {
    process.env.TZ = 'UTC';
    h = await createHarness('counterparty_metrics');
    await h.dataSource.query(
        `ALTER TABLE "order" ADD COLUMN "customFieldsCounterpartyid" varchar`,
    );
    await h.dataSource.query(`CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar)`);
    await h.dataSource.query(
        `CREATE TABLE organization_requisites (id serial primary key, "erpId" varchar, "legalName" varchar)`,
    );
    service = new CounterpartyMetricsService(h.connection);
});

afterAll(async () => {
    if (TZ === undefined) delete process.env.TZ;
    else process.env.TZ = TZ;
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_balance, settlement_document_type, "order", contract, organization_requisites RESTART IDENTITY CASCADE',
    );
    h.counterparties.clear();
    h.contracts.clear();
    h.counterparties.set('cp-1', 1);
    h.counterparties.set('cp-2', 2);
    h.contracts.set('ct-1', 1);
    await h.dataSource.query(`INSERT INTO contract ("erpId", name) VALUES ('ct-1', 'Main contract')`);
    await type('Sale', 'sale', true);
    await type('Ret', 'return', true);
    await type('SaleFix', 'correction', true);
    await type('DebtFix', 'correction', false);
    await type('Pay', 'payment', false);
    await type('Supply', 'supplier', false);
});

describe('CounterpartyMetricsService (real Postgres)', () => {
    it('balance is the sum of all live rows, with unlinked contracts, and ignores deleted rows', async () => {
        await balance('cp-1', 'ct-1', 1000);
        await balance('cp-1', 'ct-unknown', -300);
        await balance('cp-1', 'ct-gone', 999, { isDeleted: true });
        await balance('cp-2', 'ct-1', 5000);
        const m = await service.metrics(ctx, '1', NOW);
        expect(m.balanceMinor).toBe(700);
        expect(m.currency).toBe('RUB');
        expect(m.contractBalances.map(r => r.contractErpId).sort()).toEqual(['ct-1', 'ct-unknown']);
        const unlinked = m.contractBalances.find(r => r.contractErpId === 'ct-unknown');
        expect(unlinked?.contractName).toBeNull();
        expect(m.contractBalances.find(r => r.contractErpId === 'ct-1')?.contractName).toBe('Main contract');
    });

    it('turnover counts flagged types only: returns and sales corrections reduce it, payments and suppliers do not', async () => {
        await doc('s1', 'Sale', '2026-11-10T10:00:00Z', 1000);
        await doc('s2', 'Sale', '2026-11-11T10:00:00Z', 500);
        await doc('r1', 'Ret', '2026-11-11T11:00:00Z', -200);
        await doc('f1', 'SaleFix', '2026-11-11T12:00:00Z', -50);
        await doc('d1', 'DebtFix', '2026-11-11T13:00:00Z', 777);
        await doc('p1', 'Pay', '2026-11-11T14:00:00Z', -900);
        await doc('u1', 'Supply', '2026-11-11T15:00:00Z', -400);
        await doc('x1', 'Sale', '2026-11-11T16:00:00Z', 9999, { isDeleted: true });
        const m = await service.metrics(ctx, '1', NOW);
        expect(m.salesLast30DaysMinor).toBe(1250);
        expect(m.salesLast12MonthsMinor).toBe(1250);
        expect(m.saleDocumentsLast12Months).toBe(2);
        expect(m.averageCheckMinor).toBe(625);
    });

    it('window boundaries: today is inside, the 30-day edge and the previous window split on local midnight', async () => {
        await doc('today', 'Sale', '2026-11-12T23:59:00Z', 1);
        await doc('tomorrow', 'Sale', '2026-11-13T00:00:00Z', 100000);
        await doc('edge-in', 'Sale', '2026-10-14T00:00:00Z', 10);
        await doc('edge-out', 'Sale', '2026-10-13T23:59:00Z', 100);
        await doc('prev-start', 'Sale', '2026-09-14T00:00:00Z', 1000);
        await doc('older', 'Sale', '2026-09-13T23:59:00Z', 10000);
        await doc('year-in', 'Sale', '2025-11-13T00:00:00Z', 100000000);
        await doc('year-out', 'Sale', '2025-11-12T23:59:00Z', 1000000000);
        const m = await service.metrics(ctx, '1', NOW);
        expect(m.salesLast30DaysMinor).toBe(11);
        expect(m.salesPrev30DaysMinor).toBe(1100);
        expect(m.salesLast12MonthsMinor).toBe(100000000 + 11 + 1100 + 10000);
    });

    it('isolates counterparties and gives a null average check with no sale documents', async () => {
        await doc('other', 'Sale', '2026-11-10T10:00:00Z', 4000, { cp: 'cp-2' });
        await doc('pay', 'Pay', '2026-11-10T10:00:00Z', -10);
        const m = await service.metrics(ctx, '1', NOW);
        expect(m.salesLast12MonthsMinor).toBe(0);
        expect(m.saleDocumentsLast12Months).toBe(0);
        expect(m.averageCheckMinor).toBeNull();
        const other = await service.metrics(ctx, '2', NOW);
        expect(other.salesLast30DaysMinor).toBe(4000);
    });

    it('counts open orders of the counterparty only, excluding carts, drafts and closed states', async () => {
        for (const [state, cp] of [
            ['PaymentSettled', '1'],
            ['Shipped', '1'],
            ['AddingItems', '1'],
            ['Draft', '1'],
            ['Cancelled', '1'],
            ['Delivered', '1'],
            ['PaymentSettled', '2'],
        ]) {
            await h.dataSource.query(
                `INSERT INTO "order" (state, "customFieldsCounterpartyid") VALUES ($1, $2)`,
                [state, cp],
            );
        }
        expect((await service.metrics(ctx, '1', NOW)).openOrdersCount).toBe(2);
    });
});
