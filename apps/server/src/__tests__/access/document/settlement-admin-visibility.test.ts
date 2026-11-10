import { describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, staffToken } from '../harness/actors';
import {
    CUSTOMERS,
    SETTLEMENT_NUMBERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
} from '../seed/fixture-plan';

const LIST = `query($o: SettlementListOptions, $cp: ID) { visibleSettlementDocuments(options: $o,
    counterpartyId: $cp) { totalItems items { number counterpartyId } } }`;
const COUNTS = `query($o: SettlementListOptions) { visibleSettlementTypeCounts(options: $o) {
    documentType count } }`;
const SUGGEST = `query($field: String!, $prefix: String!) {
    settlementFilterSuggestions(field: $field, prefix: $prefix) }`;
type Page = { visibleSettlementDocuments: { totalItems: number; items: { number: string }[] } };

const allNumbers = CUSTOMERS.flatMap(c => Object.values(SETTLEMENT_NUMBERS[c.key])).sort();
const numbersOf = (r: Page): string[] => r.visibleSettlementDocuments.items.map(i => i.number);

describe('staff settlement documents', () => {
    it('the director with scope all sees every customer, a client filter only narrows', async () => {
        const token = await staffToken('director');
        const plain = await admin<Page>(token, LIST, { o: { take: 200 } });
        expect(plain.errors).toEqual([]);
        expect(numbersOf(plain.data!)).toEqual(expect.arrayContaining(allNumbers));

        const cp = seed().counterparties['a-own'];
        const own = await admin<Page>(token, LIST, { o: { take: 200 }, cp });
        expect(numbersOf(own.data!).sort()).toEqual(
            Object.values(SETTLEMENT_NUMBERS['customer-a']).sort(),
        );

        const filtered = await admin<Page>(token, LIST, {
            o: {
                take: 200,
                filter: { _or: [{ amount: { gte: -1e9 } }, { customer: { eq: 'x' } }] },
            },
        });
        expect(filtered.data!.visibleSettlementDocuments.totalItems).toBe(
            plain.data!.visibleSettlementDocuments.totalItems,
        );
        const counts = await admin<{ visibleSettlementTypeCounts: { count: number }[] }>(
            token,
            COUNTS,
            { o: {} },
        );
        expect(counts.errors).toEqual([]);
        const total = counts.data!.visibleSettlementTypeCounts.reduce((n, c) => n + c.count, 0);
        expect(total).toBe(plain.data!.visibleSettlementDocuments.totalItems);
    });

    describe.each(STAFF.map(s => s.key))('staff %s', (key: ActorKey) => {
        it('sees the settlement documents of the visible customers only', async () => {
            const token = await staffToken(key);
            const visible = new Set(VISIBLE_COUNTERPARTIES[key]);
            const expected = CUSTOMERS.filter(c => visible.has(c.counterparty))
                .flatMap(c => Object.values(SETTLEMENT_NUMBERS[c.key]))
                .sort();
            const list = await admin<Page>(token, LIST, { o: { take: 200 } });
            expect(list.errors).toEqual([]);
            expect(
                numbersOf(list.data!)
                    .filter(n => allNumbers.includes(n))
                    .sort(),
            ).toEqual(expected);
            const counts = await admin<{ visibleSettlementTypeCounts: { count: number }[] }>(
                token,
                COUNTS,
                { o: {} },
            );
            expect(counts.errors).toEqual([]);
            const total = counts.data!.visibleSettlementTypeCounts.reduce((n, c) => n + c.count, 0);
            expect(total).toBe(list.data!.visibleSettlementDocuments.totalItems);
            for (const c of CUSTOMERS.filter(c => !visible.has(c.counterparty))) {
                const foreign = await admin<Page>(token, LIST, {
                    o: { take: 200 },
                    cp: seed().counterparties[c.counterparty],
                });
                expect(numbersOf(foreign.data!), `${c.key} hidden`).toEqual([]);
            }
        });
    });

    describe.each(STAFF.map(s => s.key))('filter suggestions for staff %s', (key: ActorKey) => {
        it('offers the numbers of the visible customers only', async () => {
            const token = await staffToken(key);
            const visible = new Set(VISIBLE_COUNTERPARTIES[key]);
            const expected = CUSTOMERS.filter(c => visible.has(c.counterparty))
                .flatMap(c => Object.values(SETTLEMENT_NUMBERS[c.key]))
                .sort();
            const res = await admin<{ settlementFilterSuggestions: string[] }>(token, SUGGEST, {
                field: 'number',
                prefix: '95',
            });
            expect(res.errors).toEqual([]);
            expect([...res.data!.settlementFilterSuggestions].sort()).toEqual(expected);
        });
    });

    it('refuses a caller without the settlement documents right', async () => {
        const res = await admin(await customerToken('customer-a'), SUGGEST, {
            field: 'number',
            prefix: '95',
        });
        expect(JSON.stringify(res.errors)).toMatch(DENIED);
    });
});
