import { test, expect } from '@playwright/test';
import { adminGql } from '../../helpers/api';
import { adminTokenFor } from '../../helpers/api-tokens';
import { cancelTestOrder } from '../../helpers/manager-order';
import { MANAGER_ACCOUNTS } from '../../fixtures/accounts';
import { E2E_CUSTOMER } from '../../fixtures/seed';

interface Ids {
    customerId: string;
    variantId: string;
    points: Record<string, string>;
}

async function resolveIds(token: string): Promise<Ids> {
    const customers = await adminGql<{
        customers: { items: { id: string; emailAddress: string }[] };
    }>(
        `query { customers(options: { take: 200 }) { items { id emailAddress } } }`,
        undefined,
        token,
    );
    const customerId = customers.data.customers.items.find(
        c => c.emailAddress === E2E_CUSTOMER.email,
    )?.id;
    const variants = await adminGql<{ productVariants: { items: { id: string }[] } }>(
        `query { productVariants(options: { filter: { sku: { eq: "E2E-OIL-001" } } }) { items { id } } }`,
        undefined,
        token,
    );
    const counterparties = await adminGql<{
        counterparties: {
            items: { erpId: string; tradingPoints: { id: string; erpId: string }[] }[];
        };
    }>(
        `query { counterparties(options: { take: 100 }) { items { erpId tradingPoints { id erpId } } } }`,
        undefined,
        token,
    );
    const own = counterparties.data.counterparties.items.find(c => c.erpId === 'e2e-cnt-001');
    const variantId = variants.data.productVariants.items[0]?.id;
    if (!customerId || !variantId || !own)
        throw new Error('E2E seed data is missing; run make seed');
    return {
        customerId,
        variantId,
        points: Object.fromEntries(own.tradingPoints.map(p => [p.erpId, p.id])),
    };
}

async function draftWithLine(token: string, ids: Ids): Promise<string> {
    const draft = await adminGql<{ createDraftOrder: { id: string } }>(
        `mutation { createDraftOrder { id } }`,
        undefined,
        token,
    );
    const orderId = draft.data.createDraftOrder.id;
    await adminGql(
        `mutation($o: ID!, $c: ID!) { setCustomerForDraftOrder(orderId: $o, customerId: $c) { __typename } }`,
        { o: orderId, c: ids.customerId },
        token,
    );
    await adminGql(
        `mutation($o: ID!, $i: AddItemToDraftOrderInput!) { addItemToDraftOrder(orderId: $o, input: $i) { __typename } }`,
        { o: orderId, i: { productVariantId: ids.variantId, quantity: 2 } },
        token,
    );
    return orderId;
}

async function place(token: string, orderId: string, shippingCode: string): Promise<void> {
    await adminGql(
        `mutation($o: ID!, $i: CreateAddressInput!) { setDraftOrderShippingAddress(orderId: $o, input: $i) { id } }`,
        { o: orderId, i: { streetLine1: 'E2E Test Street 1', countryCode: 'RU' } },
        token,
    );
    const eligible = await adminGql<{
        eligibleShippingMethodsForDraftOrder: { id: string; code: string }[];
    }>(
        `query($o: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $o) { id code } }`,
        { o: orderId },
        token,
    );
    const method = eligible.data.eligibleShippingMethodsForDraftOrder.find(
        m => m.code === shippingCode,
    );
    if (!method) throw new Error(`Shipping method ${shippingCode} is not eligible`);
    await adminGql(
        `mutation($o: ID!, $id: ID!) { setDraftOrderShippingMethod(orderId: $o, shippingMethodId: $id) { __typename } }`,
        { o: orderId, id: method.id },
        token,
    );
    await adminGql(
        `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { __typename } }`,
        { id: orderId },
        token,
    );
    const paid = await adminGql<{ addManualPaymentToOrder: { __typename: string } }>(
        `mutation($i: ManualPaymentInput!) { addManualPaymentToOrder(input: $i) { __typename } }`,
        { i: { orderId, method: 'offline-terms', metadata: {} } },
        token,
    );
    expect(paid.data.addManualPaymentToOrder.__typename).toBe('Order');
}

async function readDelivery(
    token: string,
    orderId: string,
): Promise<{ tradingPointId: string | null; deliveryAddress: string | null }> {
    const result = await adminGql<{
        order: { customFields: { tradingPointId: string | null; deliveryAddress: string | null } };
    }>(
        `query($id: ID!) { order(id: $id) { customFields { tradingPointId deliveryAddress } } }`,
        { id: orderId },
        token,
    );
    return result.data.order.customFields;
}

test.describe('delivery point of a staff-created order', () => {
    let token: string;
    let ids: Ids;
    const created: string[] = [];

    test.beforeAll(async () => {
        token = await adminTokenFor(
            MANAGER_ACCOUNTS.operator.username,
            MANAGER_ACCOUNTS.operator.password,
        );
        ids = await resolveIds(token);
    });

    test.afterAll(async () => {
        for (const id of created) await cancelTestOrder(token, id);
    });

    test('a chosen point is stored, a point the client cannot use is refused, and null clears it', async () => {
        const orderId = await draftWithLine(token, ids);
        created.push(orderId);
        const set = (tradingPointId: string | null) =>
            adminGql(
                `mutation($o: ID!, $t: ID) { setDraftOrderTradingPoint(orderId: $o, tradingPointId: $t) }`,
                { o: orderId, t: tradingPointId },
                token,
            );

        await set(ids.points['e2e-tp-002']);
        expect(await readDelivery(token, orderId)).toEqual({
            tradingPointId: ids.points['e2e-tp-002'],
            deliveryAddress: 'North Ave 42',
        });

        await expect(set(ids.points['e2e-tp-004'])).rejects.toThrow();
        expect((await readDelivery(token, orderId)).tradingPointId).toBe(ids.points['e2e-tp-002']);

        await set(null);
        expect(await readDelivery(token, orderId)).toEqual({
            tradingPointId: null,
            deliveryAddress: null,
        });
    });

    test('courier placement snapshots the chosen address; pickup with no choice keeps none', async () => {
        const courier = await draftWithLine(token, ids);
        created.push(courier);
        await adminGql(
            `mutation($o: ID!, $t: ID) { setDraftOrderTradingPoint(orderId: $o, tradingPointId: $t) }`,
            { o: courier, t: ids.points['e2e-tp-003'] },
            token,
        );
        await place(token, courier, 'freight-delivery');
        expect(await readDelivery(token, courier)).toEqual({
            tradingPointId: ids.points['e2e-tp-003'],
            deliveryAddress: 'Warehouse Rd 7',
        });

        const pickup = await draftWithLine(token, ids);
        created.push(pickup);
        await place(token, pickup, 'pickup');
        expect(await readDelivery(token, pickup)).toEqual({
            tradingPointId: null,
            deliveryAddress: null,
        });
    });

    test('a courier order with no chosen point is refused at the placement transition', async () => {
        const orderId = await draftWithLine(token, ids);
        created.push(orderId);
        await adminGql(
            `mutation($o: ID!, $i: CreateAddressInput!) { setDraftOrderShippingAddress(orderId: $o, input: $i) { id } }`,
            { o: orderId, i: { streetLine1: 'E2E Test Street 1', countryCode: 'RU' } },
            token,
        );
        const eligible = await adminGql<{
            eligibleShippingMethodsForDraftOrder: { id: string; code: string }[];
        }>(
            `query($o: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $o) { id code } }`,
            { o: orderId },
            token,
        );
        const freight = eligible.data.eligibleShippingMethodsForDraftOrder.find(
            m => m.code === 'freight-delivery',
        );
        await adminGql(
            `mutation($o: ID!, $id: ID!) { setDraftOrderShippingMethod(orderId: $o, shippingMethodId: $id) { __typename } }`,
            { o: orderId, id: freight?.id },
            token,
        );
        const transition = await adminGql<{
            transitionOrderToState: { __typename: string; transitionError?: string };
        }>(
            `mutation($id: ID!) { transitionOrderToState(id: $id, state: "ArrangingPayment") { __typename ... on OrderStateTransitionError { transitionError } } }`,
            { id: orderId },
            token,
        );
        expect(transition.data.transitionOrderToState.__typename).toBe('OrderStateTransitionError');
        expect(transition.data.transitionOrderToState.transitionError).toContain(
            'needs a trading point',
        );
    });
});
