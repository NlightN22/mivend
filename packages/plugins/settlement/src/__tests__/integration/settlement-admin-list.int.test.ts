import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementAdminListService } from '../../settlement-admin-list.service';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementEntryInput } from '../../types';

let h: Harness;
let service: SettlementAdminListService;
let scope: { sql: string; params: Record<string, unknown> } | null = null;

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

const doc = (
    erpId: string,
    number: string,
    documentType: string,
    date: string,
    entries = [entry()],
): Promise<unknown> =>
    h.documents.apply(
        ctx,
        documentInput(erpId, { number, documentType, date: new Date(date), entries }),
    );

const numbers = async (
    options: Parameters<SettlementAdminListService['findVisible']>[1] = {},
): Promise<string[]> => (await service.findVisible(ctx, options)).items.map(i => i.number);

beforeAll(async () => {
    h = await createHarness('settlement_admin_list');
    await h.dataSource.query(
        `ALTER TABLE "order" ADD COLUMN code varchar, ADD COLUMN "customFieldsCounterpartyid" varchar`,
    );
    await h.dataSource.query(
        `CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar,
            "isCustomerContract" boolean)`,
    );
    await h.dataSource.query(
        `CREATE TABLE counterparty (id int primary key, "erpId" varchar, "shortName" varchar,
            "legalName" varchar, inn varchar)`,
    );
    await h.dataSource.query(
        `CREATE TABLE organization_requisites (id serial primary key, "erpId" varchar, "legalName" varchar)`,
    );
    await h.dataSource.query(
        `CREATE TABLE proforma_invoice (id serial primary key, number varchar,
            "salesInvoiceNumber" varchar, "counterpartyId" int)`,
    );
    service = new SettlementAdminListService(h.connection, {
        visibleErpIdsSql: async () => scope,
    } as never);
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    scope = null;
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_document_type, "order", contract, counterparty, organization_requisites, proforma_invoice RESTART IDENTITY CASCADE',
    );
    const type = (documentType: string, category: string, sortOrder: number): Promise<unknown> =>
        h.types.apply(ctx, {
            documentType,
            version: '2026-10-01T10:00:00Z',
            isDeleted: false,
            label: `${documentType} label`,
            category,
            customerVisible: false,
            sortOrder,
        });
    await type('Sale', 'sale', 1);
    await type('Pay', 'payment', 2);
    await type('Purchase', 'supplier', 3);
    h.counterparties.clear();
    h.contracts.clear();
    for (const [erpId, id] of [
        ['cp-1', 1],
        ['cp-2', 2],
    ] as const)
        h.counterparties.set(erpId, id);
    for (const [erpId, id] of [
        ['ct-1', 1],
        ['ct-2', 2],
        ['ct-sup', 3],
    ] as const)
        h.contracts.set(erpId, id);
    await h.dataSource.query(
        `INSERT INTO contract ("erpId", name, "isCustomerContract")
         VALUES ('ct-1', 'Main', true), ('ct-2', 'Second', true), ('ct-sup', 'Supplier deal', NULL)`,
    );
    await h.dataSource.query(
        `INSERT INTO counterparty (id, "erpId", "shortName", "legalName", inn)
         VALUES (1, 'cp-1', 'Alpha', 'Alpha LLC', '111'), (2, 'cp-2', 'Beta', 'Beta LLC', '222')`,
    );
    await h.dataSource.query(
        `INSERT INTO organization_requisites ("erpId", "legalName") VALUES ('org-1', 'Seller One')`,
    );
    await doc('d1', '101', 'Sale', '2026-09-01T00:00:00Z', [entry({ amount: 500 })]);
    await doc('d2', '102', 'Pay', '2026-09-10T00:00:00Z', [entry({ amount: -200 })]);
    await doc('d3', '201', 'Sale', '2026-09-05T00:00:00Z', [
        entry({ counterpartyErpId: 'cp-2', contractErpId: 'ct-2', amount: 70 }),
    ]);
});

describe('visible settlement documents (real Postgres)', () => {
    it('lists newest first with the type label, contract, organization and signed minor amount', async () => {
        const page = await service.findVisible(ctx);
        expect(page.totalItems).toBe(3);
        expect(page.items.map(i => i.number)).toEqual(['102', '201', '101']);
        expect(page.items[0]).toMatchObject({
            documentType: 'Pay',
            documentTypeLabel: 'Pay label',
            counterpartyShortName: 'Alpha',
            contractName: 'Main',
            organizationName: 'Seller One',
            currencyCode: 'RUB',
            amount: -20000,
        });
    });

    it('leaves out supplier documents, deleted documents and non-customer contracts', async () => {
        await doc('d4', '301', 'Purchase', '2026-09-20T00:00:00Z');
        await doc('d5', '302', 'Sale', '2026-09-21T00:00:00Z', [
            entry({ contractErpId: 'ct-sup' }),
        ]);
        await h.documents.apply(
            ctx,
            documentInput('d1', {
                number: '101',
                isDeleted: true,
                version: '2026-10-02T10:00:00Z',
            }),
        );
        expect(await numbers()).toEqual(['102', '201']);
    });

    it('scope applies first: a filter, a search and a counterparty argument only narrow it', async () => {
        scope = {
            sql: 'SELECT cp."erpId" FROM counterparty cp WHERE cp.id = :scopeCp',
            params: { scopeCp: 1 },
        };
        expect(await numbers()).toEqual(['102', '101']);
        expect(await numbers({ search: '201' })).toEqual([]);
        expect(
            await numbers({
                filter: { _or: [{ customer: { eq: 'Beta' } }, { number: { eq: '101' } }] },
            }),
        ).toEqual(['101']);
        expect((await service.findVisible(ctx, {}, '2')).totalItems).toBe(0);
        expect(await service.findVisible(ctx, {}, 'abc')).toEqual({ items: [], totalItems: 0 });
        expect(await service.typeCounts(ctx, {}, '1; DROP')).toEqual([]);
        expect((await service.typeCounts(ctx, {})).map(c => c.count)).toEqual([1, 1]);
    });

    it('filters, sorts and searches through bound parameters only', async () => {
        expect(await numbers({ filter: { amount: { gt: 10000 } } })).toEqual(['101']);
        expect(await numbers({ filter: { typeLabel: { contains: 'pay' } } })).toEqual(['102']);
        expect(await numbers({ sort: { amount: 'ASC' } })).toEqual(['102', '201', '101']);
        expect(await numbers({ search: 'beta' })).toEqual(['201']);
        expect(await numbers({ search: '%' })).toEqual([]);
        expect(await numbers({ search: "x'; DROP TABLE settlement_document;--" })).toEqual([]);
        expect(await numbers({ filter: { number: { contains: "'" } } })).toEqual([]);
        await expect(numbers({ filter: { bogus: { eq: 'x' } } })).rejects.toThrow(
            'Unknown filter field',
        );
        await expect(numbers({ sort: { documentType: 'ASC' } })).rejects.toThrow('Cannot sort by');
        expect(await service.findVisible(ctx, undefined)).toMatchObject({ totalItems: 3 });
    });

    it('clamps take and skip; take 0 is a count only', async () => {
        expect(await service.findVisible(ctx, { take: 0 })).toEqual({ items: [], totalItems: 3 });
        expect((await service.findVisible(ctx, { take: 1, skip: -4 })).items).toHaveLength(1);
        expect(
            (await service.findVisible(ctx, { take: 1, skip: 2 })).items.map(i => i.number),
        ).toEqual(['101']);
        expect((await service.findVisible(ctx, { take: 100000 })).items).toHaveLength(3);
    });

    it('type counts follow the search and the filter, not the chosen type', async () => {
        const all = await service.typeCounts(ctx, { documentType: 'Pay' });
        expect(all).toEqual([
            { documentType: 'Sale', label: 'Sale label', count: 2 },
            { documentType: 'Pay', label: 'Pay label', count: 1 },
        ]);
        const searched = await service.typeCounts(ctx, { search: 'Alpha' });
        expect(searched.map(c => `${c.documentType}:${c.count}`)).toEqual(['Pay:1', 'Sale:1']);
        const narrowed = await service.typeCounts(ctx, { filter: { amount: { lt: 0 } } });
        expect(narrowed.map(c => c.documentType)).toEqual(['Pay']);
        expect(await numbers({ documentType: 'Sale' })).toEqual(['201', '101']);
    });

    it('resolves the order code of the own counterparty only and the proforma by sales invoice number', async () => {
        await h.dataSource.query(
            `INSERT INTO "order" (id, code, "customFieldsCounterpartyid") VALUES (7, '000777', '1'), (8, '000888', '2')`,
        );
        await doc('d6', '401', 'Sale', '2026-09-30T00:00:00Z', [
            entry({
                orderLinks: [
                    { orderErpId: 'o-7', orderUuid: null, amount: 50 },
                    { orderErpId: 'o-8', orderUuid: null, amount: 50 },
                ],
            }),
        ]);
        await h.dataSource.query(
            `UPDATE settlement_order_link SET "orderId" = CASE "orderErpId" WHEN 'o-7' THEN 7 ELSE 8 END`,
        );
        await h.dataSource.query(
            `INSERT INTO proforma_invoice (number, "salesInvoiceNumber", "counterpartyId") VALUES ('555-01-1', '401', 1), ('999-01-1', '401', 2)`,
        );
        const [row] = (await service.findVisible(ctx, { filter: { number: { eq: '401' } } })).items;
        expect(row.orderCodes).toEqual(['000777']);
        expect(row.proformaInvoiceNumber).toBe('555-01-1');
        expect(await numbers({ filter: { orderCode: { eq: '000777' } } })).toEqual(['401']);
        expect(await numbers({ search: '000888' })).toEqual([]);
        expect(await numbers({ filter: { proformaInvoiceNumber: { eq: '555-01-1' } } })).toEqual([
            '401',
        ]);
    });
});
