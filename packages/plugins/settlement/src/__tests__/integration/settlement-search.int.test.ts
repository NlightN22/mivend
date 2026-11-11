import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementAdminListService } from '../../settlement-admin-list.service';
import { SettlementSearchProvider } from '../../settlement-search.provider';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementEntryInput } from '../../types';

let h: Harness;
let provider: SettlementSearchProvider;
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

const found = async (term: string, limit = 10): Promise<string[]> =>
    (await provider.search(ctx, term, limit)).map(i => i.number);

beforeAll(async () => {
    h = await createHarness('settlement_search');
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
    const list = new SettlementAdminListService(h.connection, {
        visibleErpIdsSql: async () => scope,
    } as never);
    provider = new SettlementSearchProvider({ register: () => undefined } as never, list);
});

afterAll(async () => {
    await h.dataSource.destroy();
    await dropTestSchema(h.schema);
});

beforeEach(async () => {
    scope = null;
    await h.dataSource.query(
        'TRUNCATE settlement_document, settlement_document_type, "order", contract, counterparty, organization_requisites RESTART IDENTITY CASCADE',
    );
    for (const [documentType, category, sortOrder] of [
        ['Sale', 'sale', 1],
        ['Purchase', 'supplier', 2],
    ] as const)
        await h.types.apply(ctx, {
            documentType,
            version: '2026-10-01T10:00:00Z',
            isDeleted: false,
            label: `${documentType} label`,
            category,
            customerVisible: false,
            sortOrder,
        });
    h.counterparties.clear();
    h.contracts.clear();
    h.counterparties.set('cp-1', 1);
    h.counterparties.set('cp-2', 2);
    h.contracts.set('ct-1', 1);
    h.contracts.set('ct-2', 2);
    h.contracts.set('ct-sup', 3);
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
});

describe('settlement document global search (real Postgres)', () => {
    it('returns the list-shaped hit: id, number, type label, counterparty and category', async () => {
        await doc('d1', 'INV-4711', 'Sale', '2026-09-01T00:00:00Z');
        const [hit] = await provider.search(ctx, 'inv-47', 5);
        expect(hit).toMatchObject({
            number: 'INV-4711',
            title: 'Sale label',
            subtitle: 'Alpha',
            status: 'sale',
            counterpartyId: '1',
        });
    });

    it('matches anywhere in the number, ignoring case, from three characters', async () => {
        await doc('d1', 'XY-inv-4711', 'Sale', '2026-09-01T00:00:00Z');
        await doc('d2', 'OTHER-1', 'Sale', '2026-09-02T00:00:00Z');
        expect(await found('INV-47')).toEqual(['XY-inv-4711']);
    });

    it('treats a two-character term as a prefix of the number', async () => {
        await doc('d1', 'AB-1', 'Sale', '2026-09-01T00:00:00Z');
        await doc('d2', 'XAB-2', 'Sale', '2026-09-02T00:00:00Z');
        expect(await found('ab')).toEqual(['AB-1']);
    });

    it.each([
        ['A%B', ['A%B']],
        ['A_B', ['A_B']],
        ['%_', ['%_1']],
    ])('searches LIKE wildcards %s literally', async (term, expected) => {
        for (const [i, number] of ['A%B', 'AxxB', 'A_B', 'AzB', '%_1', 'abc'].entries())
            await doc(`d${i}`, number, 'Sale', `2026-09-0${i + 1}T00:00:00Z`);
        expect(await found(term)).toEqual(expected);
    });

    it('undoes the display dash of a document number', async () => {
        await doc('d1', '1000000303', 'Sale', '2026-09-01T00:00:00Z');
        expect(await found('100-0000303')).toEqual(['1000000303']);
    });

    it('returns the newest first and honours the limit', async () => {
        for (const [i, date] of ['2026-09-01', '2026-09-03', '2026-09-02'].entries())
            await doc(`d${i}`, `NUM-${i}`, 'Sale', `${date}T00:00:00Z`);
        expect(await found('NUM-')).toEqual(['NUM-1', 'NUM-2', 'NUM-0']);
        expect(await found('NUM-', 2)).toEqual(['NUM-1', 'NUM-2']);
    });

    it('leaves out supplier documents, deleted documents and non-customer contracts, like the list', async () => {
        await doc('d1', 'HIDE-1', 'Purchase', '2026-09-01T00:00:00Z');
        await doc('d2', 'HIDE-2', 'Sale', '2026-09-02T00:00:00Z', [
            entry({ contractErpId: 'ct-sup' }),
        ]);
        await doc('d3', 'HIDE-3', 'Sale', '2026-09-03T00:00:00Z');
        await h.documents.apply(
            ctx,
            documentInput('d3', {
                number: 'HIDE-3',
                isDeleted: true,
                version: '2026-10-02T10:00:00Z',
            }),
        );
        await doc('d4', 'HIDE-4', 'Sale', '2026-09-04T00:00:00Z');
        expect(await found('HIDE-')).toEqual(['HIDE-4']);
    });

    it('never returns a document outside the caller counterparty scope', async () => {
        await doc('d1', 'SC-1', 'Sale', '2026-09-01T00:00:00Z');
        await doc('d2', 'SC-2', 'Sale', '2026-09-02T00:00:00Z', [
            entry({ counterpartyErpId: 'cp-2', contractErpId: 'ct-2' }),
        ]);
        expect(await found('SC-')).toEqual(['SC-2', 'SC-1']);
        scope = { sql: `SELECT 'cp-1'`, params: {} };
        expect(await found('SC-')).toEqual(['SC-1']);
        scope = { sql: `SELECT 'cp-none'`, params: {} };
        expect(await found('SC-')).toEqual([]);
    });
});
