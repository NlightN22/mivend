import { test, expect } from '@playwright/test';
import { adminGql, shopGql, shopLoginCookie } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import {
    acting,
    actingHeaders,
    actingToken,
    ADD,
    CART,
    customerState,
    skus,
    type Cart,
    variantIdsBySku,
    counterpartyIdByErpId,
    exchangeTicket,
    rawShop,
    startTicket,
} from '../../helpers/acting';
import { cancelTestOrder } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS, SUPERADMIN } from '../../fixtures/accounts';
import { PICKER_NO_PORTAL } from '../../fixtures/seed-picker';
import { E2E_COUNTERPARTY_ID, E2E_CUSTOMER } from '../../fixtures/seed';

let operator: string;
let superadmin: string;
let counterpartyId: string;
let customerId: string;
let variants: Record<string, string>;
let cookie: string;
const actingTokens: string[] = [];
const orderIds: string[] = [];

async function newActing(): Promise<string> {
    const token = await actingToken(operator, counterpartyId);
    actingTokens.push(token);
    return token;
}

async function realCart(): Promise<Cart> {
    return shopGql<Cart>(CART, undefined, cookie);
}

async function clearRealCart(): Promise<void> {
    await shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, cookie);
}

test.beforeAll(async () => {
    operator = await adminTokenFor(
        MANAGER_ACCOUNTS.operator.username,
        MANAGER_ACCOUNTS.operator.password,
    );
    superadmin = await adminTokenFor(SUPERADMIN.identifier, SUPERADMIN.password);
    counterpartyId = await counterpartyIdByErpId(superadmin, E2E_COUNTERPARTY_ID);
    variants = await variantIdsBySku(superadmin, ['E2E-OIL-001', 'E2E-OIL-002']);
    const customers = await adminGql<{
        customers: { items: { id: string; emailAddress: string }[] };
    }>(
        `query { customers(options: { take: 200 }) { items { id emailAddress } } }`,
        undefined,
        superadmin,
    );
    const id = customers.data.customers.items.find(c => c.emailAddress === E2E_CUSTOMER.email)?.id;
    if (!id) throw new Error('E2E customer is missing from the seed');
    customerId = id;
    cookie = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
    await clearRealCart();
});

test.afterAll(async () => {
    for (const t of actingTokens) {
        await rawShop(`mutation { finishActingSession }`, undefined, actingHeaders(t));
    }
    for (const id of orderIds) await cancelTestOrder(superadmin, id);
    await clearRealCart();
});

test.describe('acting session @on:manager-operator', () => {
    test('a manager places an order in an acting session: attributed to the manager, noted, found by the placed-by filter', async () => {
        const operatorId = (
            await adminGql<{ activeAdministrator: { id: string } }>(
                `query { activeAdministrator { id } }`,
                undefined,
                operator,
            )
        ).data.activeAdministrator.id;
        const token = await newActing();
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 2 });
        const methods = await acting<{ eligibleShippingMethods: { id: string; code: string }[] }>(
            token,
            `query { eligibleShippingMethods { id code } }`,
        );
        const pickup = methods.eligibleShippingMethods.find(m => m.code === 'pickup');
        expect(pickup, 'self-pickup method').toBeTruthy();
        await acting(
            token,
            `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) { __typename } }`,
            {
                id: [pickup?.id],
            },
        );
        await acting(
            token,
            `mutation { transitionOrderToState(state: "ArrangingPayment") { __typename } }`,
        );
        const placed = await acting<{ addPaymentToOrder: { __typename: string; id: string } }>(
            token,
            `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) { __typename ... on Order { id } ... on ErrorResult { message } } }`,
        );
        expect(placed.addPaymentToOrder.__typename).toBe('Order');
        const orderId = placed.addPaymentToOrder.id;
        orderIds.push(orderId);

        await expect
            .poll(
                async () => {
                    const o = await adminGql<{
                        order: {
                            customFields: { placedByAdministratorId: string | null };
                            history: { items: { type: string; data: { note?: string } }[] };
                        };
                    }>(
                        `query($id: ID!) { order(id: $id) { customFields { placedByAdministratorId } history(options: { take: 50 }) { items { type data } } } }`,
                        { id: orderId },
                        superadmin,
                    );
                    const note = o.data.order.history.items.find(
                        h =>
                            h.type === 'ORDER_NOTE' &&
                            h.data.note?.includes(`administrator ${operatorId}`),
                    );
                    return [o.data.order.customFields.placedByAdministratorId, Boolean(note)];
                },
                { timeout: 20_000 },
            )
            .toEqual([operatorId, true]);

        const filtered = await adminGql<{ visibleOrders: { items: { id: string }[] } }>(
            `query($c: ID!, $a: String!) { visibleOrders(customerId: $c, options: { filter: { placedByAdministratorId: { eq: $a } } }) { items { id } } }`,
            { c: customerId, a: operatorId },
            superadmin,
        );
        expect(filtered.data.visibleOrders.items.map(o => o.id)).toContain(orderId);
    });

    test('an acting session leaves the customer cart, preferred point, session list and login history unchanged', async () => {
        await shopGql(ADD, { v: variants['E2E-OIL-002'], q: 1 }, cookie);
        const pointsFound = await adminGql<{
            counterparties: {
                items: { erpId: string; tradingPoints: { id: string; erpId: string }[] }[];
            };
        }>(
            `query($erpId: String!) { counterparties(options: { take: 1, erpIds: [$erpId] }) { items { erpId tradingPoints { id erpId } } } }`,
            { erpId: E2E_COUNTERPARTY_ID },
            superadmin,
        );
        const point = pointsFound.data.counterparties.items
            .find(c => c.erpId === E2E_COUNTERPARTY_ID)
            ?.tradingPoints.find(p => p.erpId === 'e2e-tp-002');
        expect(point, 'seeded trading point e2e-tp-002').toBeTruthy();
        const before = await customerState(cookie, customerId, superadmin);
        const cartBefore = skus(await realCart());

        const token = await newActing();
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 1 });
        await acting(
            token,
            `mutation($id: ID!) { setPreferredTradingPoint(tradingPointId: $id) }`,
            { id: point?.id },
        );
        expect(await customerState(cookie, customerId, superadmin)).toEqual(before);
        expect(skus(await realCart())).toEqual(cartBefore);

        await acting(token, `mutation { finishActingSession }`);
        expect(await customerState(cookie, customerId, superadmin)).toEqual(before);
        expect(skus(await realCart())).toEqual(cartBefore);
        await clearRealCart();
    });

    test('cart isolation: a real login does not get the acting cart, and the acting session does not see the real one', async () => {
        await shopGql(ADD, { v: variants['E2E-OIL-002'], q: 1 }, cookie);
        const token = await newActing();
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 3 });

        const secondLogin = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
        const fresh = await shopGql<Cart>(CART, undefined, secondLogin);
        expect(skus(fresh)).toEqual(['E2E-OIL-002']);
        expect(skus(await realCart())).toEqual(['E2E-OIL-002']);
        expect(skus(await acting<Cart>(token, CART))).toEqual(['E2E-OIL-001']);

        await clearRealCart();
    });

    test('a real login for a customer whose only cart is an acting one gets no acting lines, and the own cart works afterwards', async () => {
        const token = await newActing();
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 3 });

        const login = await shopLoginCookie(E2E_CUSTOMER.email, E2E_CUSTOMER.password);
        expect(skus(await shopGql<Cart>(CART, undefined, login))).toEqual([]);
        const orders = await shopGql<{ myOrders: { items: { id: string }[] } }>(
            `query { myOrders(options: { take: 100 }) { items { id } } }`,
            undefined,
            login,
        );
        const actingCartId = (await acting<Cart>(token, CART)).activeOrder?.id;
        expect(orders.myOrders.items.map(o => o.id)).not.toContain(actingCartId);

        await shopGql(ADD, { v: variants['E2E-OIL-002'], q: 1 }, login);
        expect(skus(await shopGql<Cart>(CART, undefined, login))).toEqual(['E2E-OIL-002']);
        expect(skus(await acting<Cart>(token, CART))).toEqual(['E2E-OIL-001']);
        await shopGql(`mutation { removeAllOrderLines { __typename } }`, undefined, login);
    });

    test.setTimeout(90_000);
    test('a ticket works once, a used or unused-and-expired ticket is refused, a counterparty without portal access cannot start', async () => {
        const ticket = await startTicket(operator, counterpartyId);
        const first = await exchangeTicket(ticket);
        actingTokens.push(first.data?.exchangeActingTicket.token as string);
        expect(first.errors).toEqual([]);
        const again = await exchangeTicket(ticket);
        expect(again.data).toBeNull();
        expect(again.errors[0]).toMatch(/invalid, used or expired/);

        const stale = await startTicket(operator, counterpartyId);
        await new Promise(r => setTimeout(r, 61_000));
        const expired = await exchangeTicket(stale);
        expect(expired.errors[0]).toMatch(/invalid, used or expired/);

        const noPortal = await counterpartyIdByErpId(superadmin, PICKER_NO_PORTAL.erpId);
        await expect(startTicket(superadmin, noPortal)).rejects.toThrow(
            /no activated portal access/,
        );
    });

    test('finishing the session invalidates the token and removes the acting cart', async () => {
        const token = await newActing();
        await acting(token, ADD, { v: variants['E2E-OIL-001'], q: 1 });
        const cartId = (await acting<Cart>(token, CART)).activeOrder?.id;
        expect(cartId).toBeTruthy();

        const done = await acting<{ finishActingSession: boolean }>(
            token,
            `mutation { finishActingSession }`,
        );
        expect(done.finishActingSession).toBe(true);
        const after = await rawShop<Cart>(CART, undefined, actingHeaders(token));
        expect(after.data?.activeOrder ?? null).toBeNull();
        const dead = await rawShop(`query { mySessions { id } }`, undefined, actingHeaders(token));
        expect(dead.errors.length + (dead.data ? 0 : 1)).toBeGreaterThan(0);

        const gone = await adminGql<{ order: { id: string } | null }>(
            `query($id: ID!) { order(id: $id) { id } }`,
            { id: cartId },
            superadmin,
        );
        expect(gone.data.order).toBeNull();
    });
});
