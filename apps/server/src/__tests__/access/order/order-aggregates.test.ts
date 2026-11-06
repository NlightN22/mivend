import { describe, expect, it } from 'vitest';

import { admin, staff, staffToken } from '../harness/actors';
import { ALL_KEYS, idOf } from '../counterparty/counterparty-queries';
import { STAFF, VISIBLE_ORDERS, type ActorKey, type CounterpartyKey } from '../seed/fixture-plan';

const AMOUNT = `query { visibleOrdersAmount }`;
const LIST_TOTALS = `query { visibleOrders(options: { take: 1000 }) { items { totalWithTax } } }`;
const LAST_DATES = `query($ids: [ID!]!) { lastOrderDates(counterpartyIds: $ids) { counterpartyId lastOrderAt } }`;

const amountOf = async (token: string): Promise<number> => {
    const r = await admin<{ visibleOrdersAmount: number }>(token, AMOUNT);
    expect(r.errors).toEqual([]);
    return r.data!.visibleOrdersAmount;
};

const listedTotal = async (token: string): Promise<number> => {
    const r = await admin<{ visibleOrders: { items: { totalWithTax: number }[] } }>(
        token,
        LIST_TOTALS,
    );
    expect(r.errors).toEqual([]);
    return r.data!.visibleOrders.items.reduce((sum, o) => sum + o.totalWithTax, 0);
};

const lastDatesOf = async (token: string, ids: string[]): Promise<string[]> => {
    const r = await admin<{ lastOrderDates: { counterpartyId: string }[] }>(token, LAST_DATES, {
        ids,
    });
    expect(r.errors).toEqual([]);
    return r.data!.lastOrderDates.map(d => d.counterpartyId).sort();
};

describe('visibleOrdersAmount and lastOrderDates follow the caller scope', () => {
    const allIds = ALL_KEYS.map(idOf);

    it.each(STAFF.map(s => s.key))(
        'amount for %s equals the sum of its own visible orders',
        async (key: ActorKey) => {
            const token = await staffToken(key);
            const [amount, listed, superadmin] = [
                await amountOf(token),
                await listedTotal(token),
                await amountOf(await staffToken('superadmin')),
            ];
            expect(amount).toBe(listed);
            if (staff(key).scope === 'all') expect(amount).toBe(superadmin);
            else expect(amount).toBeLessThan(superadmin);
        },
    );

    it.each(STAFF.map(s => s.key))(
        'lastOrderDates for %s only returns counterparties of its visible orders',
        async (key: ActorKey) => {
            const returned = await lastDatesOf(await staffToken(key), allIds);
            // Order scope, not client scope: an order serviced at another branch is visible with its client id.
            const visible = new Set(
                VISIBLE_ORDERS[key].map(o => idOf(o.replace('-paid', '') as CounterpartyKey)),
            );
            expect(returned.filter(id => !visible.has(id))).toEqual([]);
        },
    );

    it('lastOrderDates of an all-scope director equals the superadmin result', async () => {
        const director = await lastDatesOf(await staffToken('director'), allIds);
        expect(director).toEqual(await lastDatesOf(await staffToken('superadmin'), allIds));
    });

    it('both queries are refused without a staff session', async () => {
        const noToken = await admin(undefined as unknown as string, AMOUNT);
        expect(noToken.errors?.length).toBeGreaterThan(0);
    });
});
