import { adminApi } from './client';

export interface CustomerOption {
    counterpartyId: string;
    customerId: string;
    shortName: string;
    legalName: string;
    inn: string | null;
    priceType: string;
    tradingPoints: { id: string; name: string; address: string }[];
}

export interface CustomerCredit {
    creditLimit: number;
    creditBalance: number;
}

// One list fetch for the whole scoped book of clients — bounded at 500 (see issue #39; a real
// fix would be a search-as-you-type picker querying `counterparties(options:{search})` instead
// of fetching everything, same stopgap as `fetchAllCustomersCapped` in api/customers.ts).
export async function fetchCustomerOptions(): Promise<CustomerOption[]> {
    const result = await adminApi<{
        counterparties: {
            items: {
                id: string;
                shortName: string;
                legalName: string;
                inn: string | null;
                priceType: string;
                tradingPoints: { id: string; name: string; address: string }[];
            }[];
        };
    }>(
        `query OrderCreateCounterparties {
            counterparties(options: { take: 500 }) {
                items {
                    id
                    shortName
                    legalName
                    inn
                    priceType
                    tradingPoints { id name address }
                }
            }
        }`,
    );
    // Counterparty -> Customer is the reverse of Customer.counterparty (see
    // CounterpartyService.getForCustomer) — there's no direct reverse field on Counterparty, so
    // it's resolved via one batched lookup filtered to exactly the counterparty ids just fetched
    // above (not a separate, untracked flat cap — that silently dropped customers from this
    // picker once the customer book passed 200 rows, a real incident, see AGENTS.md's
    // Pagination section).
    const counterpartyIds = result.counterparties.items.map(c => c.id);
    const customersResult = await adminApi<{
        customers: { items: { id: string; counterparty: { id: string } | null }[] };
    }>(
        // counterpartyId is a customField, filterable as a flat StringOperators field (not
        // IDOperators, even though it holds an id) — see fetchCustomerIdForCounterparty's
        // comment in api/customers.ts for the same gotcha.
        `query OrderCreateCustomers($counterpartyIds: [String!]!, $take: Int!) {
            customers(options: { take: $take, filter: { counterpartyId: { in: $counterpartyIds } } }) {
                items { id counterparty { id } }
            }
        }`,
        { counterpartyIds, take: counterpartyIds.length },
    );
    const customerIdByCounterpartyId = new Map(
        customersResult.customers.items
            .filter(c => c.counterparty)
            .map(c => [c.counterparty?.id as string, c.id]),
    );

    return result.counterparties.items
        .filter(c => customerIdByCounterpartyId.has(c.id))
        .map(c => ({
            counterpartyId: c.id,
            customerId: customerIdByCounterpartyId.get(c.id) as string,
            shortName: c.shortName,
            legalName: c.legalName,
            inn: c.inn,
            priceType: c.priceType,
            tradingPoints: c.tradingPoints,
        }));
}

// Isolated from the main customer list on purpose: creditLimit/creditBalance require
// ReadCounterpartyCredit (Operator/Manager don't have it, only Dept Head/Director/SB/Portal
// Admin do — see docs/access-control.md layer 4). A ForbiddenError on a non-null field nulls
// the entire GraphQL response, so this must never share a request with data the page can't do
// without. Delegates to the shared single-counterparty lookup (api/customers.ts) instead of
// duplicating it.
export { fetchCreditForCounterparty as fetchCustomerCredit } from './customers';

export interface ProductSearchResult {
    productVariantId: string;
    productName: string;
    sku: string;
}

export async function searchProducts(term: string): Promise<ProductSearchResult[]> {
    if (!term.trim()) return [];
    const result = await adminApi<{
        search: { items: ProductSearchResult[] };
    }>(
        `query($term: String!) {
            search(input: { term: $term, take: 20, groupByProduct: false }) {
                items { productVariantId productName sku }
            }
        }`,
        { term },
    );
    return result.search.items;
}

export interface DraftOrderLine {
    id: string;
    quantity: number;
    unitPriceWithTax: number;
    linePriceWithTax: number;
    productVariant: { id: string; name: string; sku: string };
}

export interface DraftOrderState {
    id: string;
    code: string;
    state: string;
    currencyCode: string;
    subTotalWithTax: number;
    shippingWithTax: number;
    totalWithTax: number;
    lines: DraftOrderLine[];
}

const DRAFT_ORDER_FIELDS = `
    id
    code
    state
    currencyCode
    subTotalWithTax
    shippingWithTax
    totalWithTax
    lines {
        id
        quantity
        unitPriceWithTax
        linePriceWithTax
        productVariant { id name sku }
    }
`;

interface MutationErrorResult {
    __typename: string;
    errorCode?: string;
    message?: string;
}

function assertOrderResult(
    result: (DraftOrderState & { __typename?: string }) | MutationErrorResult,
): DraftOrderState {
    if (result.__typename && result.__typename !== 'Order') {
        throw new Error((result as MutationErrorResult).message ?? 'Order mutation failed');
    }
    return result as DraftOrderState;
}

export async function fetchOrder(orderId: string): Promise<DraftOrderState> {
    const result = await adminApi<{ order: DraftOrderState }>(
        `query($id: ID!) { order(id: $id) { ${DRAFT_ORDER_FIELDS} } }`,
        { id: orderId },
    );
    return result.order;
}

export async function createDraftOrder(): Promise<DraftOrderState> {
    const result = await adminApi<{ createDraftOrder: DraftOrderState }>(
        `mutation { createDraftOrder { ${DRAFT_ORDER_FIELDS} } }`,
    );
    return result.createDraftOrder;
}

export async function setCustomerForDraftOrder(
    orderId: string,
    customerId: string,
): Promise<DraftOrderState> {
    const result = await adminApi<{
        setCustomerForDraftOrder: DraftOrderState & { __typename: string };
    }>(
        `mutation($orderId: ID!, $customerId: ID!) {
            setCustomerForDraftOrder(orderId: $orderId, customerId: $customerId) {
                __typename
                ... on Order { ${DRAFT_ORDER_FIELDS} }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, customerId },
    );
    return assertOrderResult(result.setCustomerForDraftOrder);
}

export async function addItemToDraftOrder(
    orderId: string,
    productVariantId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi<{
        addItemToDraftOrder: DraftOrderState & { __typename: string };
    }>(
        `mutation($orderId: ID!, $input: AddItemToDraftOrderInput!) {
            addItemToDraftOrder(orderId: $orderId, input: $input) {
                __typename
                ... on Order { ${DRAFT_ORDER_FIELDS} }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, input: { productVariantId, quantity } },
    );
    return assertOrderResult(result.addItemToDraftOrder);
}

export async function adjustDraftOrderLineQuantity(
    orderId: string,
    orderLineId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi<{
        adjustDraftOrderLine: DraftOrderState & { __typename: string };
    }>(
        `mutation($orderId: ID!, $input: AdjustDraftOrderLineInput!) {
            adjustDraftOrderLine(orderId: $orderId, input: $input) {
                __typename
                ... on Order { ${DRAFT_ORDER_FIELDS} }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, input: { orderLineId, quantity } },
    );
    return assertOrderResult(result.adjustDraftOrderLine);
}

export async function removeDraftOrderLine(
    orderId: string,
    orderLineId: string,
): Promise<DraftOrderState> {
    const result = await adminApi<{
        removeDraftOrderLine: DraftOrderState & { __typename: string };
    }>(
        `mutation($orderId: ID!, $orderLineId: ID!) {
            removeDraftOrderLine(orderId: $orderId, orderLineId: $orderLineId) {
                __typename
                ... on Order { ${DRAFT_ORDER_FIELDS} }
                ... on ErrorResult { errorCode message }
            }
        }`,
        { orderId, orderLineId },
    );
    return assertOrderResult(result.removeDraftOrderLine);
}

export interface PriceAdjustmentResult {
    decision: 'apply-directly' | 'requires-approval';
    approvalRequestId: string | null;
}

export async function requestPriceAdjustment(
    orderId: string,
    orderLineId: string,
    requestedPrice: number,
    justification?: string,
): Promise<PriceAdjustmentResult> {
    const result = await adminApi<{ requestPriceAdjustment: PriceAdjustmentResult }>(
        `mutation($orderId: ID!, $orderLineId: ID!, $requestedPrice: Int!, $justification: String) {
            requestPriceAdjustment(
                orderId: $orderId
                orderLineId: $orderLineId
                requestedPrice: $requestedPrice
                justification: $justification
            ) {
                decision
                approvalRequestId
            }
        }`,
        { orderId, orderLineId, requestedPrice, justification },
    );
    return result.requestPriceAdjustment;
}

// Only two payment handlers actually exist (see apps/server/src/payment-method-handlers.ts) —
// "Deferred"/"Invoice" from the design concept both map to the same offline-terms handler.
export const PAYMENT_METHOD_OPTIONS = [
    { value: 'online-stub', label: 'Online payment' },
    { value: 'offline-terms', label: 'Invoice / deferred payment' },
] as const;

export async function finalizeOrder(
    orderId: string,
    tradingPointAddress: string,
    paymentMethod: string,
): Promise<{ code: string }> {
    await adminApi(
        `mutation($orderId: ID!, $input: CreateAddressInput!) {
            setDraftOrderShippingAddress(orderId: $orderId, input: $input) { id }
        }`,
        {
            orderId,
            input: { streetLine1: tradingPointAddress || 'N/A', countryCode: 'RU' },
        },
    );

    const eligible = await adminApi<{
        eligibleShippingMethodsForDraftOrder: { id: string }[];
    }>(`query($orderId: ID!) { eligibleShippingMethodsForDraftOrder(orderId: $orderId) { id } }`, {
        orderId,
    });
    const shippingMethodId = eligible.eligibleShippingMethodsForDraftOrder[0]?.id;
    if (shippingMethodId) {
        await adminApi(
            `mutation($orderId: ID!, $id: ID!) {
                setDraftOrderShippingMethod(orderId: $orderId, shippingMethodId: $id) {
                    __typename
                }
            }`,
            { orderId, id: shippingMethodId },
        );
    }

    const transition = await adminApi<{
        transitionOrderToState: { __typename: string; message?: string; code?: string };
    }>(
        `mutation($id: ID!) {
            transitionOrderToState(id: $id, state: "ArrangingPayment") {
                __typename
                ... on Order { code }
                ... on OrderStateTransitionError { errorCode message }
            }
        }`,
        { id: orderId },
    );
    if (transition.transitionOrderToState.__typename !== 'Order') {
        throw new Error(
            transition.transitionOrderToState.message ?? 'Could not proceed to payment',
        );
    }

    const payment = await adminApi<{
        addManualPaymentToOrder: { __typename: string; code?: string; message?: string };
    }>(
        `mutation($input: ManualPaymentInput!) {
            addManualPaymentToOrder(input: $input) {
                __typename
                ... on Order { code }
                ... on ManualPaymentStateError { errorCode message }
            }
        }`,
        { input: { orderId, method: paymentMethod, metadata: {} } },
    );
    if (payment.addManualPaymentToOrder.__typename !== 'Order') {
        throw new Error(payment.addManualPaymentToOrder.message ?? 'Could not place order');
    }
    return { code: payment.addManualPaymentToOrder.code as string };
}
