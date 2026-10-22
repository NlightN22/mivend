import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staff, staffToken } from '../harness/actors';
import {
    COUNTERPARTIES,
    CUSTOMERS,
    STAFF,
    VISIBLE_COUNTERPARTIES,
    VISIBLE_POINTS,
    counterpartyName,
    type ActorKey,
    type CustomerKey,
} from '../seed/fixture-plan';
import { stateOf } from '../counterparty/counterparty-queries';
import {
    ACTIVE,
    COMMENT,
    DETAILS,
    MOVE,
    NESTED,
    SEARCH,
    SHOP_NESTED,
    SHOP_WRITES,
    pointOf,
    pointRow,
    read,
    readAs,
} from './trading-point-queries';

const ALL = COUNTERPARTIES.map(c => c.key);

describe.each(STAFF.map(s => s.key))('trading points for %s', (key: ActorKey) => {
    const points = new Set(VISIBLE_POINTS[key]);
    const counterparties = new Set(VISIBLE_COUNTERPARTIES[key]);
    let token: string;
    let superadmin: string;

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('by id, with contacts, each point is visible exactly by the read-time branch rule', async () => {
        if (key !== 'director')
            expect(
                ALL.some(cp => !points.has(cp)),
                'a hidden point',
            ).toBe(true);
        for (const cp of ALL) {
            const shown = points.has(cp);
            expect((await read(token, pointOf(cp))) !== null, `point of ${cp}`).toBe(shown);
            if (!shown) expect(await read(superadmin, pointOf(cp)), `${cp} exists`).not.toBeNull();
        }
    });

    it('nested on a counterparty and in the searched list, only points of visible counterparties', async () => {
        for (const cp of ALL) {
            const id = seed().counterparties[cp];
            const result = await admin<{
                counterparty: { tradingPoints: { id: string }[] } | null;
            }>(token, NESTED, { id });
            const got = result.data?.counterparty ?? null;
            expect(got !== null, `counterparty ${cp}`).toBe(counterparties.has(cp));
            if (got) expect(got.tradingPoints.map(p => p.id)).toEqual([pointOf(cp)]);
            const listed = await admin<{
                counterparties: { items: { id: string; tradingPoints: { id: string }[] }[] };
            }>(token, SEARCH, { s: counterpartyName(cp) });
            expect(listed.errors).toEqual([]);
            const item = listed.data!.counterparties.items.find(i => i.id === id);
            expect(item !== undefined, `search ${cp}`).toBe(counterparties.has(cp));
            if (item) expect(item.tradingPoints.map(p => p.id)).toEqual([pointOf(cp)]);
        }
    });

    // Scope 'all' has no hidden counterparty; it must read exactly the superadmin's points instead.
    if (staff(key).scope === 'all')
        it("reads exactly the superadmin's points", async () => {
            const superadmin = await staffToken('superadmin');
            expect(ALL.length, 'seeded points').toBeGreaterThan(0);
            for (const cp of ALL)
                expect(await read(token, pointOf(cp)), cp).toEqual(
                    await read(superadmin, pointOf(cp)),
                );
        });
    else
        it('a point of a hidden counterparty cannot be edited, deactivated or commented', async () => {
            const target = ALL.find(cp => !counterparties.has(cp));
            expect(target, 'a hidden counterparty').toBeDefined();
            const id = pointOf(target!);
            const before = await pointRow(id);
            const writes = [
                await admin(token, DETAILS, {
                    id,
                    input: {
                        deliveryComment: 'access probe',
                        contacts: [{ name: 'access probe' }],
                    },
                }),
                await admin(token, ACTIVE, { id, a: false }),
                await admin(token, COMMENT, { id }),
            ];
            for (const w of writes) expect(w.errors.join(' '), target).toMatch(DENIED);
            expect(await pointRow(id), 'nothing was written').toEqual(before);
        });
});

describe('moves between branches', () => {
    it('a contact edit on a branch-a point is seen in branch a only and is undone', async () => {
        const point = pointOf('a-free');
        const before = await pointRow(point);
        expect((await readAs('superadmin', point))!.contacts).toEqual([]);
        try {
            const set = await admin(await staffToken('head-a'), DETAILS, {
                id: point,
                input: {
                    contacts: [{ name: 'access-contact', phone: '+70000000000', isPrimary: true }],
                },
            });
            expect(set.errors, 'head-a edits a point of its branch').toEqual([]);
            expect((await readAs('head-a', point))!.contacts.map(c => c.name)).toEqual([
                'access-contact',
            ]);
            expect(
                await readAs('head-b', point),
                'head-b reads neither point nor contact',
            ).toBeNull();
            expect(await readAs('manager-b', point)).toBeNull();
        } finally {
            await admin(await staffToken('superadmin'), DETAILS, {
                id: point,
                input: { contacts: [] },
            });
        }
        expect(await pointRow(point), 'contacts are back').toEqual(before);
    });

    it('a servicing branch override lets the other head read the point, not edit it, and is undone', async () => {
        const point = pointOf('a-free');
        const superadmin = await staffToken('superadmin');
        const before = await pointRow(point);
        expect(before.servicingBranchId, 'defaulted from the counterparty').toBe(seed().branches.a);
        expect(await readAs('head-b', point)).toBeNull();
        try {
            const set = await admin(superadmin, DETAILS, {
                id: point,
                input: { servicingBranchId: seed().branches.b },
            });
            expect(set.errors).toEqual([]);
            expect(
                await readAs('head-b', point),
                'head-b reads it through the override',
            ).not.toBeNull();
            expect(await readAs('head-a', point), 'head-a keeps its client').not.toBeNull();
            expect(await readAs('manager-b', point)).toBeNull();
            const write = await admin(await staffToken('head-b'), DETAILS, {
                id: point,
                input: { deliveryComment: 'access probe' },
            });
            expect(write.errors.join(' '), 'writes stay counterparty-scoped').toMatch(DENIED);
        } finally {
            await admin(superadmin, DETAILS, {
                id: point,
                input: { servicingBranchId: before.servicingBranchId },
            });
        }
        expect(await pointRow(point), 'the override is undone').toEqual(before);
    });

    it('a counterparty moved to another branch takes its unpinned point along, and the move is undone', async () => {
        const superadmin = await staffToken('superadmin');
        const point = pointOf('b-own');
        const before = await stateOf('b-own');
        const pinned = (await pointRow(point)).servicingBranchId;
        expect(before.branchId).toBe(seed().branches.b);
        try {
            // servicingBranchId defaults from the counterparty at creation; unpin so the point follows it.
            await admin(superadmin, DETAILS, { id: point, input: { servicingBranchId: null } });
            expect(await readAs('head-b', point)).not.toBeNull();
            expect(await readAs('head-a', point)).toBeNull();
            const moved = await admin(superadmin, MOVE, {
                c: seed().counterparties['b-own'],
                b: seed().branches.a,
            });
            expect(moved.errors).toEqual([]);
            expect(await readAs('head-a', point), 'now in branch a').not.toBeNull();
            expect(await readAs('head-b', point), 'gone from branch b').toBeNull();
        } finally {
            await admin(superadmin, MOVE, { c: seed().counterparties['b-own'], b: null });
            await admin(superadmin, DETAILS, { id: point, input: { servicingBranchId: pinned } });
        }
        expect(await stateOf('b-own'), 'the branch is back').toEqual(before);
        expect((await pointRow(point)).servicingBranchId).toBe(pinned);
        expect(await readAs('head-b', point)).not.toBeNull();
        expect(await readAs('head-a', point)).toBeNull();
    });

    it("the default branch reads a branch-less client's point and cannot edit it", async () => {
        const point = pointOf('none');
        expect(await readAs('head-default', point), 'head-default reads it').not.toBeNull();
        const write = await admin(await staffToken('head-default'), DETAILS, {
            id: point,
            input: { deliveryComment: 'access probe' },
        });
        expect(write.errors.join(' '), 'and cannot edit it').toMatch(DENIED);
    });

    it('the point of a branch-less client is read by no other branch head and edited by none', async () => {
        const point = pointOf('none');
        expect(await readAs('superadmin', point)).not.toBeNull();
        for (const head of ['head-a', 'head-b'] as const) {
            expect(await readAs(head, point), head).toBeNull();
            const write = await admin(await staffToken(head), DETAILS, {
                id: point,
                input: { deliveryComment: 'access probe' },
            });
            expect(write.errors.join(' '), head).toMatch(DENIED);
        }
    });
});

const PREFERRED = `query($id: ID!) { customer(id: $id) { preferredTradingPoint { id } } }`;

async function preferred(key: CustomerKey): Promise<string | null> {
    const result = await admin<{ customer: { preferredTradingPoint: { id: string } | null } }>(
        await staffToken('superadmin'),
        PREFERRED,
        { id: seed().customers[key] },
    );
    return result.data!.customer.preferredTradingPoint?.id ?? null;
}

describe.each(CUSTOMERS.map(c => c.key))('trading points of %s in the storefront', key => {
    const mine = CUSTOMERS.find(c => c.key === key)!.counterparty;
    const foreign = CUSTOMERS.find(c => c.key !== key)!.counterparty;

    it('lists and reads by id only its own point; a foreign point is null, also to a guest', async () => {
        const token = await customerToken(key);
        const listed = await shop<{ myTradingPoints: { id: string }[] }>(
            token,
            `query { myTradingPoints { id } }`,
        );
        expect(listed.errors).toEqual([]);
        expect(listed.data!.myTradingPoints.map(p => p.id)).toEqual([pointOf(mine)]);
        const BY_ID = `query($id: ID!) { tradingPoint(id: $id) { id } }`;
        const own = await shop<{ tradingPoint: { id: string } | null }>(token, BY_ID, {
            id: pointOf(mine),
        });
        expect(own.errors).toEqual([]);
        expect(own.data!.tradingPoint?.id).toBe(pointOf(mine));
        const theirs = await shop<{ tradingPoint: unknown }>(token, BY_ID, {
            id: pointOf(foreign),
        });
        expect(theirs.errors, 'no error that confirms the id exists').toEqual([]);
        expect(theirs.data!.tradingPoint).toBeNull();
        const guest = await shop<{ tradingPoint: unknown }>('', BY_ID, { id: pointOf(foreign) });
        expect(guest.data?.tradingPoint ?? null).toBeNull();
    });

    it('nested on its own counterparty and among hidden points, only its own points', async () => {
        const token = await customerToken(key);
        const nested = await shop<{
            activeCustomer: { counterparty: { tradingPoints: { id: string }[] } };
        }>(token, SHOP_NESTED);
        expect(nested.errors).toEqual([]);
        expect(nested.data!.activeCustomer.counterparty.tradingPoints.map(p => p.id)).toEqual([
            pointOf(mine),
        ]);
        const hidden = await shop<{ myHiddenTradingPoints: { id: string }[] }>(
            token,
            `query { myHiddenTradingPoints { id } }`,
        );
        expect(hidden.errors).toEqual([]);
        for (const p of hidden.data!.myHiddenTradingPoints) expect(p.id).toBe(pointOf(mine));
        const guest = await shop<{ myTradingPoints: unknown[] }>(
            '',
            `query { myTradingPoints { id } }`,
        );
        expect(guest.data?.myTradingPoints ?? []).toEqual([]);
    });

    it("cannot edit, hide, restore, prefer or comment the other customer's point; nothing changes", async () => {
        const token = await customerToken(key);
        const target = pointOf(foreign);
        const before = await pointRow(target);
        const preferredBefore = await preferred(key);
        for (const write of SHOP_WRITES) {
            const result = await shop<Record<string, unknown>>(token, write, { id: target });
            const value = result.data ? Object.values(result.data)[0] : null;
            expect(
                result.errors.length > 0 || value === null || value === false,
                `refused: ${write.slice(11, 50)}`,
            ).toBe(true);
        }
        expect(await pointRow(target), 'the foreign point is unchanged').toEqual(before);
        expect(await preferred(key), 'the preferred point is unchanged').toBe(preferredBefore);
    });
});
