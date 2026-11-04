import { beforeAll, expect, it } from 'vitest';

import { admin, seed, staffToken } from '../harness/actors';

const BATCH = `query($ids: [ID!]!) { activeDiscountCounts(counterpartyIds: $ids) { counterpartyId count } }`;
const ONE = `query($id: ID!) { discountGrantsForCounterparty(counterpartyId: $id, options: { take: 0, status: "active" }) { totalItems } }`;

type Batch = { activeDiscountCounts: { counterpartyId: string; count: number }[] };

let ids: string[];

beforeAll(() => {
    ids = Object.values(seed().counterparties).map(String);
});

for (const actor of ['manager-a', 'superadmin'] as const) {
    it(`${actor}: the batched counts equal the per-counterparty counts`, async () => {
        const token = await staffToken(actor);
        const batch = await admin<Batch>(token, BATCH, { ids });
        expect(batch.errors).toEqual([]);
        const byId = new Map(
            batch.data!.activeDiscountCounts.map(r => [r.counterpartyId, r.count]),
        );
        expect([...byId.keys()].sort()).toEqual([...ids].sort());
        for (const id of ids) {
            const one = await admin<{ discountGrantsForCounterparty: { totalItems: number } }>(
                token,
                ONE,
                { id },
            );
            expect(one.errors).toEqual([]);
            expect(byId.get(id), `counterparty ${id}`).toBe(
                one.data!.discountGrantsForCounterparty.totalItems,
            );
        }
    });
}
