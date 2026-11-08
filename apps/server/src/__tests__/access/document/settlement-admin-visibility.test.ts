import { describe, expect, it } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';
import { DENIED_OR_MISSING } from '../proforma/proforma-queries';
import { CUSTOMERS, SETTLEMENT_NUMBERS, STAFF, type ActorKey } from '../seed/fixture-plan';

const LIST = `query($o: SettlementListOptions, $cp: ID) { visibleSettlementDocuments(options: $o,
    counterpartyId: $cp) { totalItems items { number counterpartyId } } }`;
const COUNTS = `query($o: SettlementListOptions) { visibleSettlementTypeCounts(options: $o) {
    documentType count } }`;
type Page = { visibleSettlementDocuments: { totalItems: number; items: { number: string }[] } };

const allNumbers = CUSTOMERS.flatMap(c => Object.values(SETTLEMENT_NUMBERS[c.key])).sort();
const numbersOf = (r: Page): string[] => r.visibleSettlementDocuments.items.map(i => i.number);

describe('staff settlement documents', () => {
    it('the credit holder with scope all sees every customer, a client filter only narrows', async () => {
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

    describe.each(STAFF.filter(s => s.key !== 'director').map(s => s.key))(
        'staff %s without the credit permission',
        (key: ActorKey) => {
            it('gets no settlement documents and no type counts', async () => {
                const token = await staffToken(key);
                const list = await admin(token, LIST, { o: { take: 200 } });
                expect(list.errors.join(' ')).toMatch(DENIED_OR_MISSING);
                const counts = await admin(token, COUNTS, { o: {} });
                expect(counts.errors.join(' ')).toMatch(DENIED_OR_MISSING);
            });
        },
    );
});
