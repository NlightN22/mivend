import { beforeAll, describe, expect, it } from 'vitest';

import { DENIED, admin, customerToken, seed, shop, staff, staffToken } from '../harness/actors';
import { stateOf } from '../counterparty/counterparty-queries';
import {
    ALL_ORDERS,
    NOT_FOUND,
    noteCount,
    orderOf,
    pointState,
    seesOrder,
    setPointBranch,
} from '../order/order-queries';
import {
    CUSTOMERS,
    ORDERS,
    STAFF,
    VISIBLE_ORDERS,
    orderContractErpIds,
    saleContractName,
    type ActorKey,
    type CounterpartyKey,
    type OrderKey,
} from '../seed/fixture-plan';

const CONTRACTS = `query($id: ID!) { orderContracts(orderId: $id) { erpId organizationId } }`;
const AVAILABILITY = `query($id: ID!) { orderLineAvailability(orderId: $id) { organizations { hasContract } } }`;
const SET = `mutation($id: ID!, $c: String!) { setOrderContract(orderId: $id, contractId: $c) { erpId } }`;
const SELECTED = `query($id: ID!) { order(id: $id) { customFields { selectedContractId } } }`;
const GENERATE = `mutation($c: ID!) { generateContract(counterpartyId: $c) }`;
const CONTRACT_DOCS = `query($c: ID!) { documents(counterpartyId: $c, options: { take: 200, type: "contract" }) { totalItems } }`;
const MOVE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;
const MY_CONTRACTS = `query { myContracts { name } }`;

type Option = { erpId: string; organizationId: string };
const counterpartyOf = (key: OrderKey): CounterpartyKey =>
    ORDERS.find(o => o.key === key)!.counterparty;

async function contractsOf(token: string, key: OrderKey): Promise<Option[] | null> {
    const result = await admin<{ orderContracts: Option[] }>(token, CONTRACTS, {
        id: orderOf(key).id,
    });
    return result.data?.orderContracts ?? null;
}

async function untouched(
    key: OrderKey,
): Promise<{ contract: string | null; notes: number; docs: number }> {
    const superadmin = await staffToken('superadmin');
    const selected = await admin<{
        order: { customFields: { selectedContractId: string | null } };
    }>(superadmin, SELECTED, { id: orderOf(key).id });
    const docs = await admin<{ documents: { totalItems: number } }>(superadmin, CONTRACT_DOCS, {
        c: seed().counterparties[counterpartyOf(key)],
    });
    expect([...selected.errors, ...docs.errors]).toEqual([]);
    return {
        contract: selected.data!.order.customFields.selectedContractId,
        notes: await noteCount(key),
        docs: docs.data!.documents.totalItems,
    };
}

describe.each(STAFF.map(s => s.key))('contracts for %s', (key: ActorKey) => {
    let token: string;
    let superadmin: string;
    const expected = new Set<OrderKey>(VISIBLE_ORDERS[key]);
    const hidden = ALL_ORDERS.filter(o => !expected.has(o));

    beforeAll(async () => {
        token = await staffToken(key);
        superadmin = await staffToken('superadmin');
    });

    it('contracts and organizations of an order follow the order scope', async () => {
        if (staff(key).scope !== 'all') expect(hidden.length, 'a hidden order').toBeGreaterThan(0);
        for (const o of ALL_ORDERS) {
            const contracts = orderContractErpIds(counterpartyOf(o));
            const result = await admin<{ orderContracts: Option[] }>(token, CONTRACTS, {
                id: orderOf(o).id,
            });
            const availability = await admin(token, AVAILABILITY, { id: orderOf(o).id });
            if (expected.has(o)) {
                expect(result.errors, o).toEqual([]);
                const got = result.data!.orderContracts;
                expect(got.map(c => c.erpId).sort(), o).toEqual(contracts);
                for (const c of got) expect(c.organizationId).not.toBe('');
                expect(availability.errors).toEqual([]);
            } else {
                expect(result.errors.join(' '), o).toMatch(NOT_FOUND);
                expect(availability.errors.join(' ')).toMatch(NOT_FOUND);
                const proof = await contractsOf(superadmin, o);
                expect(proof?.map(c => c.erpId).sort(), `${o} for the superadmin`).toEqual(
                    contracts,
                );
            }
        }
    });

    // Scope 'all' sees every order, so it has no hidden case to probe.
    it.skipIf(staff(key).scope === 'all')(
        'a hidden order contract cannot be changed and a contract cannot be generated',
        async () => {
            expect(hidden.length, 'a hidden order exists').toBeGreaterThan(0);
            const target = hidden[0];
            const before = await untouched(target);
            const set = await admin(token, SET, {
                id: orderOf(target).id,
                c: orderContractErpIds(counterpartyOf(target))[0],
            });
            expect(set.errors.join(' '), `setOrderContract on ${target}`).toMatch(
                new RegExp(`${NOT_FOUND.source}|${DENIED.source}`, 'i'),
            );
            const generated = await admin(token, GENERATE, {
                c: seed().counterparties[counterpartyOf(target)],
            });
            expect(generated.errors.join(' ')).toMatch(DENIED);
            expect(await untouched(target), 'nothing was written').toEqual(before);
        },
    );
});

// A point is pinned to its counterparty's branch at creation, so the order follows the client only once unpinned.
it('a client moved to another branch takes the order contracts of an unpinned point along, and the move is undone', async () => {
    const superadmin = await staffToken('superadmin');
    const [headA, headB] = [await staffToken('head-a'), await staffToken('head-b')];
    const cp = seed().counterparties['b-own'];
    const pointId = orderOf('b-own').pointId;
    const before = await stateOf('b-own');
    const pinned = (await pointState(pointId)).servicingBranchId;
    const sees = async (token: string): Promise<boolean> =>
        (await contractsOf(token, 'b-own')) !== null;
    expect(await sees(headB)).toBe(true);
    expect(await sees(headA)).toBe(false);
    try {
        await setPointBranch(pointId, null);
        const moved = await admin(superadmin, MOVE, { c: cp, b: seed().branches.a });
        expect(moved.errors).toEqual([]);
        expect(await sees(headA), 'now in branch a').toBe(true);
        expect(await sees(headB), 'gone from branch b').toBe(false);
        expect(await seesOrder(headA, 'b-own'), 'the order moved too').toBe(true);
    } finally {
        await admin(superadmin, MOVE, { c: cp, b: null });
        await setPointBranch(pointId, pinned);
    }
    expect(await stateOf('b-own'), 'branch and override are back').toEqual(before);
    expect((await pointState(pointId)).servicingBranchId, 'the point is pinned again').toBe(pinned);
    expect(await sees(headB)).toBe(true);
    expect(await sees(headA)).toBe(false);
});

it.each(CUSTOMERS.map(c => c.key))(
    '%s sees only its own contracts in the storefront',
    async key => {
        const own = CUSTOMERS.find(c => c.key === key)!.counterparty;
        const listed = await shop<{ myContracts: { name: string }[] }>(
            await customerToken(key),
            MY_CONTRACTS,
        );
        expect(listed.errors).toEqual([]);
        expect(listed.data!.myContracts.map(c => c.name)).toEqual([saleContractName(own)]);
        const guest = await shop<{ myContracts: unknown[] }>('', MY_CONTRACTS);
        expect(guest.data?.myContracts ?? []).toEqual([]);
    },
);
