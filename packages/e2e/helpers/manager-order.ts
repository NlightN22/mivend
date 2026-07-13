import { adminGql } from './api';

// Places a real order end-to-end via the same admin-api mutations the manager portal's
// /orders/new page uses (see packages/manager/src/api/orderCreate.ts), landing in
// PaymentSettled. Used to give the Orders list / Order Detail e2e specs a deterministic,
// visible order instead of depending on whatever orders happen to already exist in the dev DB.
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
                ... on OrderStateTransitionError { errorCode message }
            }
        }`,
        { id: orderId },
        token,
    );
    if (transition.data.transitionOrderToState.__typename !== 'Order') {
        throw new Error(`Could not move order ${orderId} to ArrangingPayment`);
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
