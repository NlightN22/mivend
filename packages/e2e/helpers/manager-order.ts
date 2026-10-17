import { adminGql } from './api';

// Mirrors the portal's /orders/new mutations so the order takes the real path to PaymentSettled.
// Gives e2e specs a deterministic order instead of relying on pre-existing dev DB orders.
export async function createConfirmedOrder(
    token: string,
    customerId: string,
    productVariantId: string,
): Promise<{ id: string; code: string }> {
    const draft = await adminGql<{ createDraftOrder: { id: string } }>(
        `mutation { createDraftOrder { id } }`,
        undefined,
        token,
    );
    const orderId = draft.data.createDraftOrder.id;

    await adminGql(
        `mutation($orderId: ID!, $customerId: ID!) {
            setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {
                __typename
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, customerId },
        token,
    );

    await adminGql(
        `mutation($orderId: ID!, $input: AddItemToDraftOrderInput!) {
            addItemToDraftOrder(orderId: $orderId, input: $input) {
                __typename
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, input: { productVariantId, quantity: 2 } },
        token,
    );

    await adminGql(
        `mutation($orderId: ID!, $input: CreateAddressInput!) {
            setDraftOrderShippingAddress(orderId: $orderId, input: $input) { id }
        }`,
        { orderId, input: { streetLine1: 'E2E Test Street 1', countryCode: 'RU' } },
        token,
    );

    const eligible = await adminGql<{ eligibleShippingMethodsForDraftOrder: { id: string }[] }>(
        `query($orderId: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $orderId) { id } }`,
        { orderId },
        token,
    );
    const shippingMethodId = eligible.data.eligibleShippingMethodsForDraftOrder[0]?.id;
    if (shippingMethodId) {
        await adminGql(
            `mutation($orderId: ID!, $id: ID!) {
                setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $id) { __typename }
            }`,
            { orderId, id: shippingMethodId },
            token,
        );
    }

    const transition = await adminGql<{
        transitionOrderToState: { __typename: string; code?: string };
    }>(
        `mutation($id: ID!) {
            transitionOrderToState(id: $id, state: "ArrangingPayment") {
                __typename
                ... on Order { code }
                ... on OrderStateTransitionError { errorCode message transitionError }
            }
        }`,
        { id: orderId },
        token,
    );
    if (transition.data.transitionOrderToState.__typename !== 'Order') {
        throw new Error(
            `Could not move order ${orderId} to ArrangingPayment: ${JSON.stringify(transition.data.transitionOrderToState)}`,
        );
    }

    const payment = await adminGql<{
        addManualPaymentToOrder: { __typename: string; code?: string };
    }>(
        `mutation($input: ManualPaymentInput!) {
            addManualPaymentToOrder(input: $input) {
                __typename
                ... on Order { code }
                ... on ManualPaymentStateError { errorCode message }
            }
        }`,
        { input: { orderId, method: 'offline-terms', metadata: {} } },
        token,
    );
    const code = payment.data.addManualPaymentToOrder.code;
    if (!code) throw new Error(`Could not settle payment for order ${orderId}`);

    return { id: orderId, code };
}

export async function releaseOrderReservation(token: string, orderId: string): Promise<void> {
    await adminGql(
        `mutation($orderId: ID!) { releaseOrderReservation(orderId: $orderId) }`,
        { orderId },
        token,
    );
}

// Cancel releases reservations and withdraws open proformas itself, and is idempotent (#231).
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
        p => p.status === 'issued' || p.status === 'pending',
    );
    if (active.length > 0 || open.length > 0) {
        throw new Error(
            `Cancelled order ${orderId} kept ${active.length} active reservations, open proformas ${JSON.stringify(open)}`,
        );
    }
}
