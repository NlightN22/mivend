import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { ManagerCardService } from '../../manager-card.service';
import { SettlementShopService } from '../../settlement-shop.service';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { SettlementDocumentInput } from '../../types';
import type { Harness } from './settlement-harness';

let h: Harness;
let service: ManagerCardService;
let customers: { id: number; erpId: string; shortName: string }[] = [];

const NOW = new Date('2026-11-17T12:00:00Z');

const fakeCounterparties = {
    visibleFilteredQb: async () => {
        const qb = {
            select: () => qb,
            orderBy: () => qb,
            limit: () => qb,
            getRawMany: async () =>
                customers.map(c => ({ id: c.id, erpId: c.erpId, name: c.shortName })),
        };
        return qb;
    },
};

const day = (erpId: string, date: string, turnover: number, docs = 1): Promise<unknown> =>
    h.dataSource.query(`INSERT INTO settlement_turnover_daily VALUES ($1, $2, 'RUB', $3, $4)`, [
        erpId,
        date,
        turnover,
        docs,
    ]);

beforeAll(async () => {
    process.env.TZ = 'UTC';
    h = await createHarness('manager_card');
    await h.dataSource.query(
        `CREATE TABLE counterparty (id serial primary key, "erpId" varchar, "paymentDelayDays" int, "assignedManagerId" varchar)`,
    );
    await h.dataSource.query(
        `CREATE TABLE contract (id serial primary key, name varchar, "controlledIndividually" boolean, "debtDaysLimit" int, "isCustomerContract" boolean)`,
    );
    await h.dataSource.query(
        `CREATE TABLE organization_requisites (id serial primary key, "erpId" varchar, "legalName" varchar)`,
    );
    await h.dataSource.query(`ALTER TABLE "order" ADD COLUMN "customFieldsCounterpartyid" varchar`);
    service = new ManagerCardService(h.connection, fakeCounterparties as never, {} as never);
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_turnover_daily, settlement_balance, counterparty, contract, "order" RESTART IDENTITY CASCADE',
    );
    await h.dataSource.query(
        `INSERT INTO counterparty ("erpId", "paymentDelayDays", "assignedManagerId") VALUES ('cp-1', 10, '7'), ('cp-2', 10, '7'), ('cp-3', 10, '8')`,
    );
    await h.dataSource.query(
        `INSERT INTO contract (name, "isCustomerContract") VALUES ('Main', true)`,
    );
    customers = [
        { id: 1, erpId: 'cp-1', shortName: 'Customer one' },
        { id: 2, erpId: 'cp-2', shortName: 'Customer two' },
    ];
});

describe('manager card', () => {
    it('compares sales windows and counts the average check per sales document', async () => {
        await day('cp-1', '2026-11-10', 1000, 2);
        await day('cp-1', '2026-10-05', 600, 1);
        await day('cp-2', '2026-11-02', 500, 1);
        await day('cp-2', '2025-11-05', 300, 1);
        await day('cp-3', '2026-11-10', 99999, 1);
        const card = await service.card(ctx, '7', 'Manager', 90, NOW);
        expect(card.customersVisible).toBe(2);
        expect(card.customersTotal).toBe(2);
        expect(card.sales.last30).toEqual({ currentMinor: 1500, previousMinor: 600 });
        expect(card.sales.monthToDayVsPrevMonth).toEqual({
            currentMinor: 1500,
            previousMinor: 600,
        });
        expect(card.sales.monthToDayVsPrevYear).toEqual({ currentMinor: 1500, previousMinor: 300 });
        expect(card.sales.averageCheckMinor).toBe(Math.round(2100 / 4));
    });

    it('lists customers idle past the threshold by their 12-month turnover', async () => {
        await day('cp-1', '2026-06-01', 4000, 1);
        await day('cp-2', '2026-09-01', 900, 1);
        const card = await service.card(ctx, '7', 'Manager', 90, NOW);
        expect(card.lost.rows.map(r => r.name)).toEqual(['Customer one']);
        expect(card.lost.rows[0]).toMatchObject({ turnover12mMinor: 4000, idleDays: 169 });
        expect([card.lost.count60, card.lost.count90, card.lost.count180]).toEqual([2, 1, 0]);
    });

    it('counts active, new, returned and lost customers against earlier points', async () => {
        await day('cp-1', '2026-11-10', 100);
        await day('cp-1', '2026-02-01', 100);
        await day('cp-2', '2026-11-12', 100);
        const card = await service.card(ctx, '7', 'Manager', 90, NOW);
        expect(card.dynamics.current).toEqual({ active: 2, newCustomers: 1, returned: 1, lost: 0 });
        expect(card.dynamics.previous.active).toBe(0);
        expect(card.dynamics.historyStartsAt).toBe('2026-02-01');
    });

    it('ages receivables per customer like the single-customer figure', async () => {
        h.counterparties.set('cp-1', 1);
        h.contracts.set('ct-1', 1);
        await h.balances.apply(ctx, {
            key: 'org-1:cp-1:ct-1',
            version: '2026-10-01T10:00:00Z',
            isDeleted: false,
            organizationErpId: 'org-1',
            counterpartyErpId: 'cp-1',
            contractErpId: 'ct-1',
            currency: 'RUB',
            openingDate: null,
            openingBalance: 0,
            closingBalance: 10,
        });
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                documentType: 'Sale',
                date: new Date('2026-10-01T10:00:00Z'),
                entries: [
                    {
                        organizationErpId: 'org-1',
                        counterpartyErpId: 'cp-1',
                        contractErpId: 'ct-1',
                        currency: 'RUB',
                        amount: 10,
                        dueDate: new Date('2026-10-10T00:00:00Z'),
                        orderLinks: [],
                    },
                ],
            } as Partial<SettlementDocumentInput>),
        );
        const card = await service.card(ctx, '7', 'Manager', 90, NOW);
        const single = await new SettlementShopService(h.connection).overdue(
            { channel: { defaultCurrencyCode: 'RUB' } } as never,
            '1',
        );
        expect(card.receivables.overdueMinor).toBe(single.amount);
        expect(card.receivables.debtMinor).toBe(1000);
        expect(single.amount).toBeGreaterThan(0);
        expect(
            card.receivables.aging.overdueOver60Minor +
                card.receivables.aging.overdue31to60Minor +
                card.receivables.aging.overdue1to30Minor,
        ).toBe(1000);
        expect(card.receivables.topDebtors[0]).toMatchObject({
            name: 'Customer one',
            debtMinor: 1000,
        });
    });

    it('answers with zeroes for a manager without visible customers', async () => {
        customers = [];
        const card = await service.card(ctx, '7', 'Manager', 90, NOW);
        expect(card.sales.last30).toEqual({ currentMinor: 0, previousMinor: 0 });
        expect(card.receivables.topDebtors).toEqual([]);
        expect(card.customersTotal).toBe(2);
    });
});
