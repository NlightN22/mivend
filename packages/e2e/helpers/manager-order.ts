import { actingShopGql, adminGql } from './api';

interface ShopResult {
    __typename: string;
    id?: string;
    code?: string;
    message?: string;
}

async function counterpartyIdOf(token: string, customerId: string): Promise<string> {
    const found = await adminGql<{
        counterparties: { items: { id: string; linkedCustomerId: string | null }[] };
    }>(
        `query { counterparties(options: { take: 100 }) { items { id linkedCustomerId } } }`,
        undefined,
        token,
    );
    const id = found.data.counterparties.items.find(c => c.linkedCustomerId === customerId)?.id;
    if (!id) throw new Error(`No counterparty linked to customer ${customerId}`);
    return id;
}

function mustBeOrder(step: string, result: ShopResult | null): ShopResult {
    if (result?.__typename !== 'Order') {
        throw new Error(`Acting checkout failed at ${step}: ${JSON.stringify(result)}`);
    }
    return result;
}

// Same path as the portal: a ticket from the Admin API, exchanged for an acting session, then a storefront checkout.
export async function createConfirmedOrder(
    token: string,
    customerId: string,
    productVariantId: string,
): Promise<{ id: string; code: string }> {
    const counterpartyId = await counterpartyIdOf(token, customerId);
    const started = await adminGql<{ startActingSession: { ticket: string } }>(
        `mutation($c: ID!) { startActingSession(counterpartyId: $c) { ticket } }`,
        { c: counterpartyId },
        token,
    );
    const exchanged = await actingShopGql<{ exchangeActingTicket: { token: string } }>(
        `mutation($t: String!) { exchangeActingTicket(ticket: $t) { token } }`,
        { t: started.data.startActingSession.ticket },
    );
    const acting = exchanged.exchangeActingTicket.token;
    const shop = <T>(query: string, variables?: Record<string, unknown>): Promise<T> =>
        actingShopGql<T>(query, variables, acting);
    try {
        mustBeOrder(
            'addItemToOrder',
            (
                await shop<{ addItemToOrder: ShopResult }>(
                    `mutation($v: ID!) { addItemToOrder(productVariantId: $v, quantity: 2) {
                        __typename ... on ErrorResult { message } } }`,
                    { v: productVariantId },
                )
            ).addItemToOrder,
        );
        const eligible = await shop<{ eligibleShippingMethods: { id: string; code: string }[] }>(
            `query { eligibleShippingMethods { id code } }`,
        );
        // Self-pickup: courier delivery needs a chosen trading point, which this helper does not set.
        const pickup = eligible.eligibleShippingMethods.find(m => m.code === 'pickup');
        if (!pickup) throw new Error('Self-pickup shipping method is not available');
        mustBeOrder(
            'setOrderShippingMethod',
            (
                await shop<{ setOrderShippingMethod: ShopResult }>(
                    `mutation($id: [ID!]!) { setOrderShippingMethod(shippingMethodId: $id) {
                        __typename ... on ErrorResult { message } } }`,
                    { id: [pickup.id] },
                )
            ).setOrderShippingMethod,
        );
        mustBeOrder(
            'transitionOrderToState',
            (
                await shop<{ transitionOrderToState: ShopResult }>(
                    `mutation { transitionOrderToState(state: "ArrangingPayment") {
                        __typename ... on ErrorResult { message } } }`,
                )
            ).transitionOrderToState,
        );
        const placed = mustBeOrder(
            'addPaymentToOrder',
            (
                await shop<{ addPaymentToOrder: ShopResult }>(
                    `mutation { addPaymentToOrder(input: { method: "offline-terms", metadata: {} }) {
                        __typename ... on Order { id code } ... on ErrorResult { message } } }`,
                )
            ).addPaymentToOrder,
        );
        return { id: placed.id as string, code: placed.code as string };
    } finally {
        await shop(`mutation { finishActingSession }`).catch(() => undefined);
    }
}

export async function releaseOrderReservation(token: string, orderId: string): Promise<void> {
    await adminGql(
        `mutation($orderId: ID!) { releaseOrderReservation(orderId: $orderId) }`,
        { orderId },
        token,
    );
}

// Cancel releases reservations and closes the proformas itself, is never refused and is idempotent (#231).
export async function cancelTestOrder(token: string, orderId: string): Promise<void> {
    const result = await adminGql<{ cancelOrder: { __typename: string; message?: string } }>(
        `mutation($input: CancelOrderInput!) {
            cancelOrder(input: $input) { __typename ... on ErrorResult { message } }
        }`,
        { input: { orderId } },
        token,
    );
    if (result.data.cancelOrder.__typename !== 'Order') {
        throw new Error(`Could not cancel e2e order ${orderId}: ${JSON.stringify(result.data)}`);
    }
    const left = await adminGql<{
        orderReservations: { status: string }[];
        proformaInvoicesForOrder: { number: string; status: string }[];
    }>(
        `query($o: ID!) {
            orderReservations(orderId: $o) { status }
            proformaInvoicesForOrder(orderId: $o) { number status }
        }`,
        { o: orderId },
        token,
    );
    const active = left.data.orderReservations.filter(r => r.status === 'active');
    const open = left.data.proformaInvoicesForOrder.filter(
        p => p.status === 'issued' || p.status === 'pending' || p.status === 'paid',
    );
    if (active.length > 0 || open.length > 0) {
        throw new Error(
            `Cancelled order ${orderId} kept ${active.length} active reservations, open proformas ${JSON.stringify(open)}`,
        );
    }
}
