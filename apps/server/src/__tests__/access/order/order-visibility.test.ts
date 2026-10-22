import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, staff, staffToken } from '../harness/actors';
import { STAFF, VISIBLE_ORDERS, type ActorKey, type OrderKey } from '../seed/fixture-plan';
import { ALL_ORDERS, NOT_FOUND, noteCount, orderOf } from './order-queries';

const ONE = `query($id: ID!) { order(id: $id) { id lines { id } history { totalItems } } }`;
const LIST = `query($ids: [String!]!) { orders(options: { take: 100, filter: { id: { in: $ids } } }) {
    totalItems items { id } } }`;
const RESERVATIONS = `query($id: ID!) { orderReservations(orderId: $id) { id } }`;
const NOTE = `mutation($id: ID!) { addNoteToOrder(input: { id: $id, note: "access scope probe", isPublic: false }) { id } }`;

describe.each(STAFF.map(s => s.key))('order visibility for %s', (key: ActorKey) => {
    let token: string;
    let superadmin: string;
    const expected = new Set<OrderKey>(VISIBLE_ORDERS[key]);
    const hidden = ALL_ORDERS.filter(o => !expected.has(o));

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('by id, with lines and history, each order is visible exactly when the scope allows', async () => {
        if (staff(key).scope !== 'all')
            expect(hidden.length, 'a hidden order exists').toBeGreaterThan(0);
        for (const o of ALL_ORDERS) {
            const shown = expected.has(o);
            const result = await admin<{ order: { id: string } | null }>(token, ONE, {
                id: orderOf(o).id,
            });
            expect(result.data?.order != null, `order ${o}`).toBe(shown);
            if (shown) expect(result.errors).toEqual([]);
            else for (const e of result.errors) expect(e).toMatch(NOT_FOUND);
            if (!shown) {
                const proof = await admin<{ order: unknown }>(superadmin, ONE, {
                    id: orderOf(o).id,
                });
                expect(proof.data?.order, `order ${o} exists for the superadmin`).toBeTruthy();
            }
        }
    });

    it('the order list returns only the visible seeded orders', async () => {
        const result = await admin<{ orders: { totalItems: number; items: { id: string }[] } }>(
            token,
            LIST,
            { ids: ALL_ORDERS.map(o => orderOf(o).id) },
        );
        expect(result.errors).toEqual([]);
        const ids = [...expected].map(o => orderOf(o).id).sort();
        expect(result.data!.orders.items.map(i => i.id).sort()).toEqual(ids);
        expect(result.data!.orders.totalItems).toBe(expected.size);
    });

    // Scope 'all' has no hidden order; it must see exactly the superadmin's set instead.
    if (staff(key).scope === 'all')
        it("sees exactly the superadmin's orders", async () => {
            const ids = { ids: ALL_ORDERS.map(o => orderOf(o).id) };
            const listOf = async (t: string): Promise<string[]> =>
                (await admin<{ orders: { items: { id: string }[] } }>(t, LIST, ids))
                    .data!.orders.items.map(i => i.id)
                    .sort();
            const all = await listOf(superadmin);
            expect(all.length, 'the superadmin sees seeded orders').toBeGreaterThan(0);
            expect(await listOf(token)).toEqual(all);
        });
    else
        it('a hidden order gives away nothing through reservations or a note', async () => {
            expect(hidden.length, 'a hidden order exists').toBeGreaterThan(0);
            for (const o of hidden) {
                const reservations = await admin(token, RESERVATIONS, { id: orderOf(o).id });
                expect(reservations.errors.join(' '), `reservations of ${o}`).toMatch(NOT_FOUND);
                const before = await noteCount(o);
                const note = await admin(token, NOTE, { id: orderOf(o).id });
                expect(note.errors.join(' '), `note on ${o}`).toMatch(
                    new RegExp(`${NOT_FOUND.source}|${DENIED.source}`, 'i'),
                );
                expect(await noteCount(o), `no note written on ${o}`).toBe(before);
            }
        });
});
