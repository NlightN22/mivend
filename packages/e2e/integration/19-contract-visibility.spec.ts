import { expect, test } from '@playwright/test';
import { shopLoginCookie } from '../helpers/api';
import { adminCall, superadminToken } from './price-type-access';
import { customerCounterparty, shop } from './document-scope';
import {
    ACTORS,
    actorCredentials,
    actorState,
    actorToken,
    expectedIds,
    type ActorKey,
} from './branch-actors';
import { expectedOrderIds, noteCount } from './order-scope';
import { branchOf, shopCustomers } from './trading-point-scope';
import {
    contractDocumentCount,
    contractOrders,
    counterpartyBranch,
    customerContracts,
    orderCounterparty,
    selectedContract,
    type ContractOrder,
} from './contract-scope';

const CONTRACTS = `query($id: ID!) { orderContracts(orderId: $id) { erpId organizationId organizationName } }`;
const AVAILABILITY = `query($id: ID!) { orderLineAvailability(orderId: $id) { organizations { hasContract } } }`;
const SET = `mutation($id: ID!, $c: String!) { setOrderContract(orderId: $id, contractId: $c) { erpId } }`;
const GENERATE = `mutation($c: ID!) { generateContract(counterpartyId: $c) }`;
const GAPS = `query($s: String) { priceTypeGapCounterparties(take: 500, search: $s) { totalItems items { id shortName } } }`;
const MOVE = `mutation($c: ID!, $b: String) { setCounterpartyBranchOverride(counterpartyId: $c, branchId: $b) }`;
const NOT_FOUND = /Order not found|No Order with the id|not found/i;
const DENIED = new RegExp(`${NOT_FOUND.source}|not currently authorized`, 'i');

type Option = { erpId: string; organizationId: string; organizationName: string | null };
type Gaps = { totalItems: number; items: { id: string; shortName: string }[] };

let superadmin: string;
let orders: ContractOrder[];

async function contractsOf(token: string, id: string): Promise<Option[] | null> {
    const result = await adminCall(token, CONTRACTS, { id });
    return (result.data as { orderContracts: Option[] } | null)?.orderContracts ?? null;
}

async function gaps(token: string, search?: string): Promise<Gaps> {
    const result = await adminCall(token, GAPS, { s: search });
    expect(result.errors).toEqual([]);
    return (result.data as { priceTypeGapCounterparties: Gaps }).priceTypeGapCounterparties;
}

test.beforeAll(async () => {
    superadmin = await superadminToken();
    orders = contractOrders();
    expect(
        orders.filter(o => o.contracts.length > 0).length,
        'orders of two clients with contracts',
    ).toBeGreaterThan(1);
});

for (const actor of ACTORS) {
    test.describe(`19: contracts for ${actor.key} (${actor.role}, ${actor.scope} scope)`, () => {
        let token: string;
        let counterparties: Set<string>;
        let expected: Set<string>;

        test.beforeAll(async () => {
            if (!actorCredentials(actor.key)) return;
            const state = actorState(actor);
            counterparties = expectedIds(actor, state);
            expected = expectedOrderIds(actor, state, counterparties, orders);
            token = await actorToken(actor.key);
        });
        test.beforeEach(() => {
            test.skip(!actorCredentials(actor.key), `the ${actor.key} login is not set`);
        });

        test('contracts and organizations of an order follow the order scope', async () => {
            if (actor.scope !== 'all')
                expect(
                    orders.some(o => !expected.has(o.id)),
                    'a hidden order',
                ).toBe(true);
            for (const order of orders) {
                const shown = expected.has(order.id);
                const result = await adminCall(token, CONTRACTS, { id: order.id });
                const availability = await adminCall(token, AVAILABILITY, { id: order.id });
                if (shown) {
                    expect(result.errors, `${order.label}: ${order.code}`).toEqual([]);
                    const got = (result.data as { orderContracts: Option[] }).orderContracts;
                    expect(got.map(c => c.erpId).sort(), order.code).toEqual(
                        [...order.contracts].sort(),
                    );
                    for (const c of got) expect(c.organizationId).not.toBe('');
                    expect(availability.errors).toEqual([]);
                } else {
                    expect(result.errors.join(' '), `${order.label}: ${order.code}`).toMatch(
                        NOT_FOUND,
                    );
                    expect(availability.errors.join(' ')).toMatch(NOT_FOUND);
                    const asSuperadmin = await contractsOf(superadmin, order.id);
                    expect(asSuperadmin?.map(c => c.erpId).sort()).toEqual(
                        [...order.contracts].sort(),
                    );
                }
            }
        });

        test('a hidden order contract cannot be changed and a hidden contract cannot be generated', async () => {
            const target = orders.find(o => !expected.has(o.id) && o.contracts.length > 0);
            test.skip(!target, 'no hidden order with contracts for this actor');
            const before = { contract: selectedContract(target!.id), notes: noteCount(target!.id) };
            const set = await adminCall(token, SET, { id: target!.id, c: target!.contracts[0] });
            expect(set.errors.join(' '), `setOrderContract on ${target!.code}`).toMatch(DENIED);
            expect({
                contract: selectedContract(target!.id),
                notes: noteCount(target!.id),
            }).toEqual(before);
            const cp = orderCounterparty(target!.id);
            const documents = contractDocumentCount(cp);
            const generated = await adminCall(token, GENERATE, { c: cp });
            expect(generated.errors.join(' ')).toMatch(/not currently authorized/i);
            expect(contractDocumentCount(cp), 'no contract document').toBe(documents);
        });

        test('the price type gap list (main contract) shows only visible clients, in the count and by search', async () => {
            const all = await gaps(superadmin);
            test.skip(all.totalItems === 0, 'the contour has no price type gap client');
            const own = await gaps(token);
            for (const item of own.items)
                expect(counterparties.has(item.id), `gap client ${item.id}`).toBe(true);
            const visibleInAll = all.items.filter(i => counterparties.has(i.id));
            expect(own.totalItems).toBe(visibleInAll.length);
            expect(own.items.map(i => i.id).sort()).toEqual(visibleInAll.map(i => i.id).sort());
            const hidden = all.items.find(i => !counterparties.has(i.id));
            if (actor.scope === 'all') return;
            expect(hidden, 'a hidden gap client the superadmin sees').toBeDefined();
            const searched = await gaps(token, hidden!.shortName);
            expect(searched.items.map(i => i.id)).not.toContain(hidden!.id);
            expect((await gaps(superadmin, hidden!.shortName)).items.map(i => i.id)).toContain(
                hidden!.id,
            );
        });
    });
}

test('19: a client moved to another branch takes its order contracts along, and the move is undone', async () => {
    const HEADS: ActorKey[] = ['head-a', 'head-b'];
    test.skip(!HEADS.every(k => actorCredentials(k)), 'a head login is not set');
    const order = orders.find(
        o =>
            o.contracts.length > 0 &&
            counterpartyBranch(orderCounterparty(o.id)).b === branchOf('head-b'),
    );
    test.skip(!order, 'no branch-b order with contracts');
    const cp = orderCounterparty(order!.id);
    const before = counterpartyBranch(cp);
    const sees = async (key: ActorKey): Promise<boolean> =>
        (await contractsOf(await actorToken(key), order!.id)) !== null;
    expect(await sees('head-b')).toBe(true);
    expect(await sees('head-a')).toBe(false);
    try {
        const moved = await adminCall(superadmin, MOVE, { c: cp, b: branchOf('head-a') });
        expect(moved.errors).toEqual([]);
        expect(await sees('head-a'), 'now in branch a').toBe(true);
        expect(await sees('head-b'), 'gone from branch b').toBe(false);
    } finally {
        await adminCall(superadmin, MOVE, { c: cp, b: before.o });
    }
    expect(counterpartyBranch(cp), 'branch and override are back').toEqual(before);
    expect(await sees('head-b')).toBe(true);
    expect(await sees('head-a')).toBe(false);
});

const customers = shopCustomers();
for (const customer of customers) {
    const other = customers.find(c => c !== customer)!;
    test(`19: ${customer.label} sees only its own contracts in the storefront`, async () => {
        test.skip(!customer.login || !other.login, 'a customer login is not set');
        const cookie = await shopLoginCookie(customer.login!.email, customer.login!.password);
        const mine = customerContracts(customerCounterparty(customer.login!.email));
        const foreign = customerContracts(customerCounterparty(other.login!.email));
        expect(mine.length, 'own contracts').toBeGreaterThan(0);
        expect(foreign.length, 'the other customer has contracts to protect').toBeGreaterThan(0);
        const listed = await shop<{ myContracts: { id: string }[] }>(
            `query { myContracts { id } }`,
            undefined,
            cookie,
        );
        expect(listed.errors).toEqual([]);
        expect(listed.data!.myContracts.map(c => c.id).sort()).toEqual([...mine].sort());
        const guest = await shop<{ myContracts: unknown[] }>(`query { myContracts { id } }`);
        expect(guest.data?.myContracts ?? []).toEqual([]);
    });
}
