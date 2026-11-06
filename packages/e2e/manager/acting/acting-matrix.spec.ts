import { test, expect } from '@playwright/test';
import { adminGql, shopGql, shopLoginCookie } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import {
    acting,
    actingHeaders,
    actingToken,
    ADD,
    CART,
    counterpartyIdByErpId,
    counterpartyIdOfCustomerEmail,
    rawShop,
    skus,
    type Cart,
    variantIdsBySku,
} from '../../helpers/acting';
import { cancelTestOrder } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS, SUPERADMIN } from '../../fixtures/accounts';
import { E2E_COUNTERPARTY_ID, E2E_CUSTOMER } from '../../fixtures/seed';
import { CREDIT_BUYER, PASSWORD } from '../../storefront/checkout-credit/helpers';

const OWN = 'E2E-OIL-002';
const ACT = 'E2E-OIL-001';
const MY_SESSIONS = `query { mySessions { id } }`;
const CLEAR = `mutation { removeAllOrderLines { __typename } }`;

let operator: string;
let superadmin: string;
let counterpartyId: string;
let variants: Record<string, string>;
const actingTokens: string[] = [];
const cookies: string[] = [];
const orderIds: string[] = [];

const login = async (email = E2E_CUSTOMER.email, password = E2E_CUSTOMER.password) => {
    const c = await shopLoginCookie(email, password);
    cookies.push(c);
    return c;
};
const cartOf = (cookie: string) => shopGql<Cart>(CART, undefined, cookie);
const start = async (admin = operator, counterparty = counterpartyId) => {
    const t = await actingToken(admin, counterparty);
    actingTokens.push(t);
    return t;
};
const actingCartId = async (t: string) => (await acting<Cart>(t, CART)).activeOrder?.id;

test.beforeAll(async () => {
    operator = await adminTokenFor(
        MANAGER_ACCOUNTS.operator.username,
        MANAGER_ACCOUNTS.operator.password,
    );
    superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    counterpartyId = await counterpartyIdByErpId(superadmin, E2E_COUNTERPARTY_ID);
    variants = await variantIdsBySku(superadmin, [OWN, ACT]);
});

test.afterEach(async () => {
    for (const t of actingTokens.splice(0)) {
        await rawShop(`mutation { finishActingSession }`, undefined, actingHeaders(t));
    }
    for (const c of cookies.splice(0)) await shopGql(CLEAR, undefined, c).catch(() => undefined);
    const cleaner = await login();
    await shopGql(CLEAR, undefined, cleaner);
});

test.afterAll(async () => {
    for (const id of orderIds) await cancelTestOrder(superadmin, id);
});

test.describe('customer and manager sessions together @on:manager-operator', () => {
    test('(1) own cart then acting: the carts stay independent in both directions', async () => {
        const own = await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, own);
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 2 });
        await shopGql(ADD, { v: variants[OWN], q: 1 }, own);
        await acting(t, ADD, { v: variants[ACT], q: 1 });

        const ownCart = await cartOf(own);
        expect(skus(ownCart)).toEqual([OWN]);
        expect(ownCart.activeOrder?.lines[0].quantity).toBe(2);
        const actCart = await acting<Cart>(t, CART);
        expect(skus(actCart)).toEqual([ACT]);
        expect(actCart.activeOrder?.lines[0].quantity).toBe(3);
        expect(actCart.activeOrder?.id).not.toBe(ownCart.activeOrder?.id);
    });

    test('(2) acting open with items, then a fresh customer login gets only its own cart or none', async () => {
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 2 });
        const withoutOwn = await login();
        expect(skus(await cartOf(withoutOwn))).toEqual([]);
        await shopGql(ADD, { v: variants[OWN], q: 1 }, withoutOwn);
        const withOwn = await login();
        expect(skus(await cartOf(withOwn))).toEqual([OWN]);
        expect(skus(await acting<Cart>(t, CART))).toEqual([ACT]);
    });

    test('(3) the customer logs out and in again while the manager keeps the acting cart', async () => {
        const first = await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, first);
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 1 });
        const cartId = await actingCartId(t);
        await shopGql(`mutation { endAllSessions }`, undefined, first);
        const again = await login();
        expect(skus(await cartOf(again))).toEqual([OWN]);
        expect(await actingCartId(t)).toBe(cartId);
        expect(skus(await acting<Cart>(t, CART))).toEqual([ACT]);
    });

    test('(4)+(5) endOtherSessions and endAllSessions leave the acting session; finish leaves the customer session and cart', async () => {
        const a = await login();
        await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, a);
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 1 });
        const cartId = await actingCartId(t);

        await shopGql(`mutation { endOtherSessions }`, undefined, a);
        expect(skus(await acting<Cart>(t, CART))).toEqual([ACT]);

        const before = await shopGql<{ mySessions: { id: string }[] }>(MY_SESSIONS, undefined, a);
        await acting(t, `mutation { finishActingSession }`);
        const after = await shopGql<{ mySessions: { id: string }[] }>(MY_SESSIONS, undefined, a);
        expect(after.mySessions.map(s => s.id)).toEqual(before.mySessions.map(s => s.id));
        expect(skus(await cartOf(a))).toEqual([OWN]);
        const gone = await adminGql<{ order: unknown }>(
            `query($id: ID!) { order(id: $id) { id } }`,
            { id: cartId },
            superadmin,
        );
        expect(gone.data.order).toBeNull();

        const t2 = await start();
        await acting(t2, ADD, { v: variants[ACT], q: 1 });
        await shopGql(`mutation { endAllSessions }`, undefined, a);
        expect(skus(await acting<Cart>(t2, CART))).toEqual([ACT]);
    });

    test('(6) the manager signing out ends the acting session and leaves the customer alone', async () => {
        const own = await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, own);
        const manager = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        const t = await start(manager);
        await acting(t, ADD, { v: variants[ACT], q: 1 });
        await adminGql(`mutation { logout { success } }`, undefined, manager);
        operator = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );

        const dead = await rawShop<Cart>(CART, undefined, actingHeaders(t));
        expect(dead.data?.activeOrder ?? null).toBeNull();
        expect(skus(await cartOf(own))).toEqual([OWN]);
    });

    test('(7) two customers, and two managers for one customer, get independent acting carts', async () => {
        const other = await counterpartyIdOfCustomerEmail(superadmin, CREDIT_BUYER);
        const forA = await start();
        const forB = await start(superadmin, other);
        const byAdmin = await start(superadmin);
        await acting(forA, ADD, { v: variants[ACT], q: 1 });
        await acting(forB, ADD, { v: variants[OWN], q: 1 });
        await acting(byAdmin, ADD, { v: variants[OWN], q: 2 });

        expect(skus(await acting<Cart>(forA, CART))).toEqual([ACT]);
        expect(skus(await acting<Cart>(forB, CART))).toEqual([OWN]);
        expect(skus(await acting<Cart>(byAdmin, CART))).toEqual([OWN]);
        const ids = [forA, forB, byAdmin].map(actingCartId);
        expect(new Set(await Promise.all(ids)).size).toBe(3);
        const buyer = await login(CREDIT_BUYER, PASSWORD);
        expect(skus(await cartOf(buyer))).toEqual([]);
        await shopGql(CLEAR, undefined, buyer);
    });

    test('(8) real logins racing acting add-to-cart corrupt neither cart', async () => {
        const own = await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, own);
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 1 });
        const adds = Array.from({ length: 6 }, () => acting(t, ADD, { v: variants[ACT], q: 1 }));
        const logins = Array.from({ length: 6 }, () => login());
        const [, fresh] = await Promise.all([Promise.all(adds), Promise.all(logins)]);

        const actCart = await acting<Cart>(t, CART);
        expect(skus(actCart)).toEqual([ACT]);
        expect(actCart.activeOrder?.lines[0].quantity).toBe(7);
        for (const c of fresh) expect(skus(await cartOf(c))).toEqual([OWN]);
        expect(skus(await cartOf(own))).toEqual([OWN]);
    });

    test('(9) placing from the acting cart leaves the own cart and shows once in the history, attributed to the manager', async () => {
        const own = await login();
        await shopGql(ADD, { v: variants[OWN], q: 1 }, own);
        const ownId = (await cartOf(own)).activeOrder?.id;
        const operatorId = (
            await adminGql<{ activeAdministrator: { id: string } }>(
                `query { activeAdministrator { id } }`,
                undefined,
                operator,
            )
        ).data.activeAdministrator.id;
        const t = await start();
        await acting(t, ADD, { v: variants[ACT], q: 1 });
        const methods = await acting<{ eligibleShippingMethods: { id: string; code: string }[] }>(
            t,
            `query { eligibleShippingMethods { id code } }`,
        );
        await acting(
            t,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            { id: [methods.eligibleShippingMethods.find(m => m.code === 'pickup')?.id] },
        );
        await acting(
            t,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
        );
        const placed = await acting<{ addPaymentToOrder: { __typename: string; id: string } }>(
            t,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename ... on Order { id } } }`,
        );
        expect(placed.addPaymentToOrder.__typename).toBe('Order');
        const placedId = placed.addPaymentToOrder.id;
        orderIds.push(placedId);

        const history = await shopGql<{ myOrders: { items: { id: string }[] } }>(
            `query { myOrders(options: { take: 100 }) { items { id } } }`,
            undefined,
            own,
        );
        const ids = history.myOrders.items.map(o => o.id);
        expect(ids.filter(id => id === placedId)).toHaveLength(1);
        expect(ids).not.toContain(ownId);
        const cart = await cartOf(own);
        expect(cart.activeOrder?.id).toBe(ownId);
        expect(skus(cart)).toEqual([OWN]);
        const o = await adminGql<{ order: { customFields: { placedByAdministratorId: string } } }>(
            `query($id: ID!) { order(id: $id) { customFields { placedByAdministratorId } } }`,
            { id: placedId },
            superadmin,
        );
        expect(o.data.order.customFields.placedByAdministratorId).toBe(operatorId);
    });
});
