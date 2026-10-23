import { beforeAll, describe, expect, it } from 'vitest';

import { admin, staff, staffToken } from '../harness/actors';
import { ALL_ORDERS, orderOf } from '../order/order-queries';
import { idOf, ALL_KEYS } from '../counterparty/counterparty-queries';
import {
    COUNTERPARTIES,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_ORDERS,
    type ActorKey,
    type OrderKey,
} from '../seed/fixture-plan';

// The manager dashboard's KPI filters (packages/manager/src/api/dashboard.ts).
const EXCLUDED = ['AddingItems', 'Draft', 'Cancelled', 'Delivered'];
const ACTIVE = { state: { notIn: EXCLUDED } };
const AWAITING = { state: { eq: 'PaymentSettled' } };

const KPIS = `query($active: OrderFilterParameter!, $awaiting: OrderFilterParameter!) {
    active: visibleOrders(options: { filter: $active }) { totalItems }
    awaiting: visibleOrders(options: { filter: $awaiting }) { totalItems }
    counterpartySummary { totalCount }
    unassignedCounterpartyCount }`;
const ORDER_LIST = `query($f: OrderFilterParameter!) {
    visibleOrders(options: { take: 1000, filter: $f }) { items { id } } }`;
const CP_LIST = `query($u: Boolean) {
    counterparties(options: { take: 1000, unassignedOnly: $u }) { items { id } } }`;
const STATES = `query($ids: [String!]!) {
    orders(options: { take: 100, filter: { id: { in: $ids } } }) { items { id state } } }`;

interface Kpis {
    active: { totalItems: number };
    awaiting: { totalItems: number };
    counterpartySummary: { totalCount: number };
    unassignedCounterpartyCount: number;
}

interface Lists {
    active: string[];
    awaiting: string[];
    counterparties: string[];
    unassigned: string[];
}

async function kpis(token: string): Promise<Kpis> {
    const result = await admin<Kpis>(token, KPIS, { active: ACTIVE, awaiting: AWAITING });
    expect(result.errors).toEqual([]);
    return result.data!;
}

async function lists(token: string): Promise<Lists> {
    const orders = async (f: unknown): Promise<string[]> => {
        const r = await admin<{ visibleOrders: { items: { id: string }[] } }>(token, ORDER_LIST, {
            f,
        });
        expect(r.errors).toEqual([]);
        return r.data!.visibleOrders.items.map(i => i.id).sort();
    };
    const cps = async (u: boolean | null): Promise<string[]> => {
        const r = await admin<{ counterparties: { items: { id: string }[] } }>(token, CP_LIST, {
            u,
        });
        expect(r.errors).toEqual([]);
        return r.data!.counterparties.items.map(i => i.id).sort();
    };
    return {
        active: await orders(ACTIVE),
        awaiting: await orders(AWAITING),
        counterparties: await cps(null),
        unassigned: await cps(true),
    };
}

const UNASSIGNED = new Set(COUNTERPARTIES.filter(c => c.manager === null).map(c => c.key));
const seededOrderIds = (): Set<string> => new Set(ALL_ORDERS.map(o => orderOf(o).id));
const seededCpIds = (): Set<string> => new Set(ALL_KEYS.map(idOf));
const seededOnly = (ids: string[], seeded: Set<string>): string[] =>
    ids.filter(id => seeded.has(id)).sort();

describe('dashboard KPI counts equal the scoped lists', () => {
    let states: Map<string, string>;
    let superadminLists: Lists;

    beforeAll(async () => {
        const superadmin = await staffToken('superadmin');
        const r = await admin<{ orders: { items: { id: string; state: string }[] } }>(
            superadmin,
            STATES,
            { ids: ALL_ORDERS.map(o => orderOf(o).id) },
        );
        expect(r.errors).toEqual([]);
        states = new Map(r.data!.orders.items.map(o => [o.id, o.state]));
        superadminLists = await lists(superadmin);
    });

    const expectedOrders = (key: ActorKey, test: (state: string) => boolean): string[] =>
        VISIBLE_ORDERS[key]
            .map((o: OrderKey) => orderOf(o).id)
            .filter(id => test(states.get(id)!))
            .sort();

    it('the seed has active and awaiting-shipment orders and unassigned clients', () => {
        const all = [...states.values()];
        expect(all.filter(s => !EXCLUDED.includes(s)).length).toBeGreaterThan(0);
        expect(all.filter(s => s === 'PaymentSettled').length).toBeGreaterThan(0);
        expect(seededOnly(superadminLists.unassigned, seededCpIds()).length).toBeGreaterThan(0);
    });

    it.each(STAFF.map(s => s.key))('for %s', async (key: ActorKey) => {
        const token = await staffToken(key);
        const [counts, own] = [await kpis(token), await lists(token)];
        expect(counts.active.totalItems, 'active orders').toBe(own.active.length);
        expect(counts.awaiting.totalItems, 'awaiting shipment').toBe(own.awaiting.length);
        expect(counts.counterpartySummary.totalCount, 'clients').toBe(own.counterparties.length);
        expect(counts.unassignedCounterpartyCount, 'unassigned').toBe(own.unassigned.length);

        const orders = seededOrderIds();
        expect(seededOnly(own.active, orders), 'active seeded orders').toEqual(
            expectedOrders(key, s => !EXCLUDED.includes(s)),
        );
        expect(seededOnly(own.awaiting, orders), 'awaiting seeded orders').toEqual(
            expectedOrders(key, s => s === 'PaymentSettled'),
        );
        const cps = seededCpIds();
        const visible = VISIBLE_COUNTERPARTIES[key];
        expect(seededOnly(own.counterparties, cps), 'seeded clients').toEqual(
            visible.map(idOf).sort(),
        );
        expect(seededOnly(own.unassigned, cps), 'seeded unassigned clients').toEqual(
            visible
                .filter(c => UNASSIGNED.has(c))
                .map(idOf)
                .sort(),
        );

        if (staff(key).scope === 'all') {
            expect(own.active.length).toBeGreaterThan(0);
            expect(own).toEqual(superadminLists);
        } else {
            expect(own.active.length).toBeLessThan(superadminLists.active.length);
        }
    });
});
