import { describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, staffToken } from '../harness/actors';
import {
    CUSTOMERS,
    ERP_CLAIM_DELETED,
    ERP_CLAIM_NUMBERS,
    ERP_CLAIM_UNKNOWN_COUNTERPARTY,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    type ActorKey,
} from '../seed/fixture-plan';

const LIST = `query($l: ErpDocumentListInput) { visibleCustomerClaims(list: $l) {
    totalItems items { number } } }`;
const COUNTS = `query($cp: ID) { relatedErpDocumentCounts(counterpartyId: $cp) { customerClaims } }`;
type Page = { visibleCustomerClaims: { totalItems: number; items: { number: string }[] } };

const ours = [
    ...Object.values(ERP_CLAIM_NUMBERS),
    ERP_CLAIM_DELETED,
    ERP_CLAIM_UNKNOWN_COUNTERPARTY,
];
const numbersOf = (r: Page): string[] =>
    r.visibleCustomerClaims.items.map(i => i.number).filter(n => ours.includes(n));

describe('staff ERP customer claims', () => {
    it('the director with scope all sees every live claim, tombstones stay hidden', async () => {
        const res = await admin<Page>(await staffToken('director'), LIST, { l: { take: 200 } });
        expect(res.errors).toEqual([]);
        expect(numbersOf(res.data!).sort()).toEqual(
            [...Object.values(ERP_CLAIM_NUMBERS), ERP_CLAIM_UNKNOWN_COUNTERPARTY].sort(),
        );
    });

    describe.each(STAFF.map(s => [s.key, s.scope] as const))('staff %s', (key: ActorKey, scope) => {
        it('sees the claims of the visible customers only, and the related count agrees', async () => {
            const token = await staffToken(key);
            const visible = new Set(VISIBLE_COUNTERPARTIES[key]);
            // Only scope 'all' sees a claim whose counterparty is unresolved.
            const expected = [
                ...CUSTOMERS.filter(c => visible.has(c.counterparty)).map(
                    c => ERP_CLAIM_NUMBERS[c.key],
                ),
                ...(scope === 'all' ? [ERP_CLAIM_UNKNOWN_COUNTERPARTY] : []),
            ].sort();
            const list = await admin<Page>(token, LIST, { l: { take: 200 } });
            expect(list.errors).toEqual([]);
            expect(numbersOf(list.data!).sort()).toEqual(expected);
            const counted = await admin<Page>(token, LIST, { l: { take: 0 } });
            expect(counted.data!.visibleCustomerClaims.totalItems).toBe(
                list.data!.visibleCustomerClaims.totalItems,
            );
            for (const c of CUSTOMERS) {
                const related = await admin<{
                    relatedErpDocumentCounts: { customerClaims: number };
                }>(token, COUNTS, { cp: seed().counterparties[c.counterparty] });
                expect(related.errors, c.key).toEqual([]);
                expect(related.data!.relatedErpDocumentCounts.customerClaims, c.key).toBe(
                    visible.has(c.counterparty) ? 1 : 0,
                );
            }
        });
    });

    it('refuses a caller without the order right', async () => {
        const res = await admin(await customerToken('customer-a'), LIST, { l: {} });
        expect(JSON.stringify(res.errors)).toMatch(DENIED);
        const counts = await admin(await customerToken('customer-a'), COUNTS, {});
        expect(JSON.stringify(counts.errors)).toMatch(DENIED);
    });
});
