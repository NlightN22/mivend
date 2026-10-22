import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, seed, staffToken } from '../harness/actors';
import { orderOf, pointState } from '../order/order-queries';
import { counterpartyName, POINT_OVERRIDE, type OrderKey } from '../seed/fixture-plan';
import type { OrderSeedIds } from '../seed/orders-seed';

const ORDER = `query($id: ID!) { order(id: $id) { id customer { counterparty {
    shortName tradingPoints { id } teamMembers { id } linkedCustomerId } } } }`;
const ORDER_PORTAL = `query($id: ID!) { order(id: $id) { customer { counterparty { portalUsers { id } } } } }`;
const COUNTERPARTY = `query($id: ID!) { counterparty(id: $id) {
    id shortName tradingPoints { id } teamMembers { id } linkedCustomerId } }`;
const COUNTERPARTY_PORTAL = `query($id: ID!) { counterparty(id: $id) { portalUsers { id } } }`;
// The counterparty lists the manager portal queries: customers page (searched), order create, approvals.
const LISTS = [
    `query($s: String!) { counterparties(options: { take: 100, search: $s }) { items { id tradingPoints { id } } } }`,
    `query { counterparties(options: { take: 500 }) { items { id tradingPoints { id } } } }`,
];
const POINT = `query($id: ID!) { tradingPoint(id: $id) { id } }`;
const DETAILS = `mutation($id: ID!, $input: TradingPointDetailsInput!) { updateTradingPointDetails(id: $id, input: $input) { id } }`;
const ACTIVE = `mutation($id: ID!, $a: Boolean!) { setTradingPointActive(id: $id, isActive: $a) { id } }`;
const COMMENT = `mutation($id: ID!, $c: String) { updateTradingPointComment(tradingPointId: $id, comment: $c) { id } }`;

interface Cp {
    shortName: string;
    tradingPoints: { id: string }[];
    teamMembers: { id: string }[];
    linkedCustomerId: string | null;
}

const ids = (list: { id: string }[]): string[] => list.map(x => x.id).sort();
const order = (): OrderSeedIds['orders'][OrderKey] => orderOf(POINT_OVERRIDE.counterparty);
const cpId = (): string => seed().counterparties[POINT_OVERRIDE.counterparty];

async function viaOrder(token: string): Promise<{ cp: Cp | null; errors: string[] }> {
    const r = await admin<{ order: { customer: { counterparty: Cp | null } | null } | null }>(
        token,
        ORDER,
        {
            id: order().id,
        },
    );
    return { cp: r.data?.order?.customer?.counterparty ?? null, errors: r.errors };
}

async function byId(token: string): Promise<Cp | null> {
    return (
        (await admin<{ counterparty: Cp | null }>(token, COUNTERPARTY, { id: cpId() })).data
            ?.counterparty ?? null
    );
}

// portalUsers needs ManageCounterpartyPortalAccess, so the field itself may be denied.
async function portalUsers(
    token: string,
    query: string,
    id: string,
): Promise<{ ids: string[] | null; errors: string }> {
    const r = await admin<{
        order?: { customer: { counterparty: { portalUsers: { id: string }[] } | null } };
        counterparty?: { portalUsers: { id: string }[] } | null;
    }>(token, query, { id });
    const cp = r.data?.order?.customer.counterparty ?? r.data?.counterparty ?? null;
    return { ids: cp ? ids(cp.portalUsers) : null, errors: r.errors.join(' ') };
}

async function pointRead(token: string): Promise<boolean> {
    const r = await admin<{ tradingPoint: { id: string } | null }>(token, POINT, {
        id: order().pointId,
    });
    return (r.data?.tradingPoint ?? null) !== null;
}

async function listed(token: string): Promise<string[]> {
    const out: string[] = [];
    for (const query of LISTS) {
        const r = await admin<{
            counterparties: { items: { id: string; tradingPoints: { id: string }[] }[] };
        }>(token, query, { s: counterpartyName(POINT_OVERRIDE.counterparty) });
        expect(r.errors).toEqual([]);
        for (const item of r.data!.counterparties.items)
            out.push(...ids(item.tradingPoints), `cp:${item.id}`);
    }
    return out;
}

// a-point's point is serviced by branch B in the seed: head-b services it, head-a owns the client.
describe('a trading point serviced by another branch', () => {
    let superadmin: string;
    let full: Cp;

    beforeAll(async () => {
        superadmin = await staffToken('superadmin');
        expect((await pointState(order().pointId)).servicingBranchId).toBe(seed().branches.b);
        full = (await byId(superadmin))!;
    });

    it('superadmin sees the order, the counterparty and all its points, team and users', async () => {
        const got = await viaOrder(superadmin);
        expect(got.errors).toEqual([]);
        expect(got.cp!.shortName).toBe(full.shortName);
        expect(ids(got.cp!.tradingPoints)).toContain(order().pointId);
        expect(ids(got.cp!.tradingPoints)).toEqual(ids(full.tradingPoints));
        expect(ids(got.cp!.teamMembers)).toEqual(ids(full.teamMembers));
        expect(got.cp!.linkedCustomerId).toBe(full.linkedCustomerId);
        expect(await pointRead(superadmin)).toBe(true);
        expect((await portalUsers(superadmin, COUNTERPARTY_PORTAL, cpId())).errors).toBe('');
    });

    it('servicing head: the order and the point, but not the counterparty data', async () => {
        const token = await staffToken('head-b');
        const got = await viaOrder(token);
        expect(got.errors).toEqual([]);
        expect(got.cp, 'head-b sees the order').not.toBeNull();
        expect(got.cp!.shortName, 'the customer name').toBe(full.shortName);
        expect(got.cp!.tradingPoints, 'no points').toEqual([]);
        expect(got.cp!.teamMembers, 'no team').toEqual([]);
        expect(got.cp!.linkedCustomerId, 'no linked customer').toBeNull();
        const users = await portalUsers(token, ORDER_PORTAL, order().id);
        if (users.errors) expect(users.errors).toMatch(DENIED);
        else expect(users.ids, 'no portal users').toEqual([]);
        expect(await pointRead(token), 'reads the point by id').toBe(true);
        expect(await byId(token), 'no counterparty by id').toBeNull();
        const lists = await listed(token);
        expect(lists, 'the point is in no list').not.toContain(order().pointId);
        expect(lists, 'the counterparty is in no list').not.toContain(`cp:${cpId()}`);
    });

    it('servicing head: point writes are denied and change nothing', async () => {
        const token = await staffToken('head-b');
        const id = order().pointId;
        const before = await pointState(id);
        try {
            const writes = [
                await admin(token, DETAILS, { id, input: { deliveryComment: 'access probe' } }),
                await admin(token, ACTIVE, { id, a: !before.isActive }),
                await admin(token, COMMENT, { id, c: 'access probe' }),
            ];
            for (const w of writes) expect(w.errors.join(' ')).toMatch(DENIED);
            expect(await pointState(id), 'nothing was written').toEqual(before);
        } finally {
            await admin(superadmin, ACTIVE, { id, a: before.isActive });
            await admin(superadmin, DETAILS, {
                id,
                input: { deliveryComment: before.deliveryComment },
            });
        }
        expect(await pointState(id), 'the row is as before').toEqual(before);
    });

    it('owner head: loses the order, keeps the counterparty and can edit the point', async () => {
        const token = await staffToken('head-a');
        expect((await viaOrder(token)).cp, 'head-a loses the order').toBeNull();
        const cp = await byId(token);
        expect(cp, 'keeps the counterparty').not.toBeNull();
        expect(ids(cp!.tradingPoints)).toEqual(ids(full.tradingPoints));
        expect(ids(cp!.tradingPoints).length).toBeGreaterThan(0);
        expect(ids(cp!.teamMembers)).toEqual(ids(full.teamMembers));
        const mine = await portalUsers(token, COUNTERPARTY_PORTAL, cpId());
        const all = await portalUsers(superadmin, COUNTERPARTY_PORTAL, cpId());
        if (mine.errors) expect(mine.errors).toMatch(DENIED);
        else expect(mine.ids).toEqual(all.ids);
        const before = await pointState(order().pointId);
        // updateTradingPointComment needs UpdateCustomer, which a head lacks; the portal edits through details.
        const edit = await admin(token, DETAILS, {
            id: order().pointId,
            input: { deliveryComment: before.deliveryComment },
        });
        expect(edit.errors, 'a no-op comment edit is allowed').toEqual([]);
        expect(await pointState(order().pointId)).toEqual(before);
    });
});
