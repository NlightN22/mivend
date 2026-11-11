import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { dropTestSchema } from 'shared';

import { SettlementSuggestService } from '../../settlement-suggest.service';
import { createHarness, ctx, documentInput } from './settlement-harness';
import type { Harness } from './settlement-harness';
import type { SettlementEntryInput } from '../../types';

let h: Harness;
let service: SettlementSuggestService;
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
    entries = [entry()],
): Promise<unknown> =>
    h.documents.apply(
        ctx,
        documentInput(erpId, {
            number,
            documentType,
            date: new Date('2026-09-01T00:00:00Z'),
            entries,
        }),
    );

beforeAll(async () => {
    h = await createHarness('settlement_suggest');
    await h.dataSource.query(
        `CREATE TABLE contract (id serial primary key, "erpId" varchar, name varchar,
            "counterpartyId" varchar, "isCustomerContract" boolean)`,
    );
    await h.dataSource.query(
        `CREATE TABLE counterparty (id int primary key, "erpId" varchar, "shortName" varchar)`,
    );
    service = new SettlementSuggestService(h.connection, {
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
        'TRUNCATE settlement_document, settlement_document_type, contract, counterparty RESTART IDENTITY CASCADE',
    );
    for (const [documentType, category] of [
        ['Sale', 'sale'],
        ['Purchase', 'supplier'],
    ] as const)
        await h.types.apply(ctx, {
            documentType,
            version: '2026-10-01T10:00:00Z',
            isDeleted: false,
            label: documentType,
            category,
            customerVisible: false,
            sortOrder: 1,
        });
    h.counterparties.clear();
    h.contracts.clear();
    for (const [erpId, id] of [
        ['cp-1', 1],
        ['cp-2', 2],
        ['cp-3', 3],
        ['cp-4', 4],
    ] as const)
        h.counterparties.set(erpId, id);
    for (const [erpId, id] of [
        ['ct-1', 1],
        ['ct-2', 2],
        ['ct-3', 3],
        ['ct-4', 4],
        ['ct-5', 5],
    ] as const)
        h.contracts.set(erpId, id);
    await h.dataSource.query(
        `INSERT INTO counterparty (id, "erpId", "shortName") VALUES
         (1, 'cp-1', 'Alpha'), (2, 'cp-2', 'Alpine'), (3, 'cp-3', 'Alder supplier only'),
         (4, 'cp-4', 'Algae no customer contract'), (5, 'cp-5', 'Alfa pending')`,
    );
    await h.dataSource.query(
        `INSERT INTO contract ("erpId", name, "counterpartyId", "isCustomerContract") VALUES
         ('ct-1', 'Main', '1', true), ('ct-2', 'Second', '2', true),
         ('ct-3', 'Third', '3', true), ('ct-4', 'Fourth', '4', NULL), ('ct-5', 'Fifth', '5', true)`,
    );
    await doc('d1', '101', 'Sale');
    await doc('d2', '201', 'Sale', [entry({ counterpartyErpId: 'cp-2', contractErpId: 'ct-2' })]);
    await doc('d3', '301', 'Purchase', [
        entry({ counterpartyErpId: 'cp-3', contractErpId: 'ct-3' }),
    ]);
    await doc('d4', '401', 'Sale', [entry({ counterpartyErpId: 'cp-4', contractErpId: 'ct-4' })]);
    await doc('d6', '501', 'Sale', [entry({ counterpartyErpId: 'cp-5', contractErpId: 'ct-5' })]);
    await doc('d5', '109', 'Sale');
    await h.documents.apply(
        ctx,
        documentInput('d7', {
            number: '177',
            accounting: { reflectedInAccounting: false },
            entries: [entry()],
        }),
    );
    await h.documents.apply(
        ctx,
        documentInput('d5', { number: '109', isDeleted: true, version: '2026-10-02T10:00:00Z' }),
    );
});

describe('settlement filter suggestions (real Postgres)', () => {
    it('suggests customers by prefix, case-insensitively and in name order', async () => {
        expect(await service.suggest(ctx, 'customer', 'AL')).toEqual(['Alpha', 'Alpine']);
        expect(await service.suggest(ctx, 'customer', 'alpi')).toEqual(['Alpine']);
    });

    it('never suggests a customer without a listable document', async () => {
        const names = await service.suggest(ctx, 'customer', 'al');
        expect(names).not.toContain('Alder supplier only');
        expect(names).not.toContain('Algae no customer contract');
    });

    it('does not suggest an entry whose counterparty is not yet resolved locally (listable, by decision)', async () => {
        expect(await service.suggest(ctx, 'customer', 'alf')).toEqual([]);
        expect(await service.suggest(ctx, 'number', '50')).toEqual([]);
    });

    it('never suggests the number of a deleted, supplier or non-customer-contract document', async () => {
        expect(await service.suggest(ctx, 'number', '10')).toEqual(['101']);
        expect(await service.suggest(ctx, 'number', '30')).toEqual([]);
        expect(await service.suggest(ctx, 'number', '40')).toEqual([]);
        expect(await service.suggest(ctx, 'number', '17')).toEqual([]);
    });

    it.each([
        ['customer', 'al', ['Alpine']],
        ['number', '10', []],
        ['number', '20', ['201']],
    ])('keeps %s suggestions inside the caller scope (%s)', async (field, prefix, expected) => {
        scope = { sql: `SELECT "erpId" FROM counterparty WHERE id = 2`, params: {} };
        expect(await service.suggest(ctx, field, prefix)).toEqual(expected);
    });

    it('treats a LIKE wildcard in the prefix as a literal character', async () => {
        expect(await service.suggest(ctx, 'customer', '%%')).toEqual([]);
        expect(await service.suggest(ctx, 'customer', 'a_')).toEqual([]);
    });

    it('answers nothing for a prefix under two characters and rejects an oversized one', async () => {
        expect(await service.suggest(ctx, 'customer', 'a')).toEqual([]);
        expect(await service.suggest(ctx, 'customer', ' a ')).toEqual([]);
        await expect(service.suggest(ctx, 'customer', 'x'.repeat(65))).rejects.toThrow(
            'Invalid suggestion',
        );
    });

    it('rejects a field that has no suggestions', async () => {
        for (const field of ['contract', 'organization', 'counterpartyId', 'nope'])
            await expect(service.suggest(ctx, field, 'ab')).rejects.toThrow('No suggestions');
    });

    it('clamps the limit to 1..20', async () => {
        for (let i = 0; i < 25; i++) await doc(`n${i}`, `N-${String(i).padStart(2, '0')}`, 'Sale');
        expect(await service.suggest(ctx, 'number', 'n-')).toHaveLength(10);
        expect(await service.suggest(ctx, 'number', 'n-', 500)).toHaveLength(20);
        expect(await service.suggest(ctx, 'number', 'n-', 0)).toHaveLength(1);
        expect(await service.suggest(ctx, 'number', 'n-', 3)).toEqual(['N-00', 'N-01', 'N-02']);
    });
});
