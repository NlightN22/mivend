import { adminApi } from './client';
import {
    AddItemToDraftOrderDocument,
    AddManualPaymentToOrderDocument,
    AdjustDraftOrderLineQuantityDocument,
    CreateDraftOrderDocument,
    EligibleShippingMethodsForDraftOrderDocument,
    OrderCreateCounterpartiesDocument,
    OrderCreateCustomersDocument,
    OrderCreateOrderDocument,
    OrderCreateProductSearchDocument,
    RemoveDraftOrderLineDocument,
    RequestPriceAdjustmentDocument,
    SetCustomerForDraftOrderDocument,
    SetDraftOrderShippingAddressDocument,
    SetDraftOrderShippingMethodDocument,
    TransitionOrderToStateDocument,
    type DraftOrderFieldsFragment,
} from './generated/graphql';

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
    const result = await adminApi(OrderCreateCounterpartiesDocument);
    // Counterparty -> Customer is the reverse of Customer.counterparty (see
    // CounterpartyService.getForCustomer) — there's no direct reverse field on Counterparty, so
    // it's resolved via one batched lookup filtered to exactly the counterparty ids just fetched
    // above (not a separate, untracked flat cap — that silently dropped customers from this
    // picker once the customer book passed 200 rows, a real incident, see the
    // backend-plugin-rules skill's Pagination section).
    const counterpartyIds = result.counterparties.items.map(c => c.id);
    // counterpartyId is a customField, filterable as a flat StringOperators field (not
    // IDOperators, even though it holds an id) — see fetchCustomerIdForCounterparty's comment in
    // api/customers.ts for the same gotcha.
    const customersResult = await adminApi(OrderCreateCustomersDocument, {
        counterpartyIds,
        take: counterpartyIds.length,
    });
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
    const result = await adminApi(OrderCreateProductSearchDocument, { term });
    return result.search.items;
}

export type DraftOrderState = DraftOrderFieldsFragment;
export type DraftOrderLine = DraftOrderFieldsFragment['lines'][number];

function assertOrderResult<T extends { __typename: string }>(
    result: T,
): Extract<T, { __typename: 'Order' }> {
    if (result.__typename !== 'Order') {
        const message = 'message' in result ? (result as { message?: string }).message : undefined;
        throw new Error(message ?? 'Order mutation failed');
    }
    return result as Extract<T, { __typename: 'Order' }>;
}

export async function fetchOrder(orderId: string): Promise<DraftOrderState> {
    const result = await adminApi(OrderCreateOrderDocument, { id: orderId });
    if (!result.order) throw new Error('Order not found');
    return result.order;
}

export async function createDraftOrder(): Promise<DraftOrderState> {
    const result = await adminApi(CreateDraftOrderDocument);
    return result.createDraftOrder;
}

export async function setCustomerForDraftOrder(
    orderId: string,
    customerId: string,
): Promise<DraftOrderState> {
    const result = await adminApi(SetCustomerForDraftOrderDocument, { orderId, customerId });
    return assertOrderResult(result.setCustomerForDraftOrder);
}

export async function addItemToDraftOrder(
    orderId: string,
    productVariantId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi(AddItemToDraftOrderDocument, {
        orderId,
        input: { productVariantId, quantity },
    });
    return assertOrderResult(result.addItemToDraftOrder);
}

export async function adjustDraftOrderLineQuantity(
    orderId: string,
    orderLineId: string,
    quantity: number,
): Promise<DraftOrderState> {
    const result = await adminApi(AdjustDraftOrderLineQuantityDocument, {
        orderId,
        input: { orderLineId, quantity },
    });
    return assertOrderResult(result.adjustDraftOrderLine);
}

export async function removeDraftOrderLine(
    orderId: string,
    orderLineId: string,
): Promise<DraftOrderState> {
    const result = await adminApi(RemoveDraftOrderLineDocument, { orderId, orderLineId });
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
    const result = await adminApi(RequestPriceAdjustmentDocument, {
        orderId,
        orderLineId,
        requestedPrice,
        justification,
    });
    return result.requestPriceAdjustment as PriceAdjustmentResult;
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
    await adminApi(SetDraftOrderShippingAddressDocument, {
        orderId,
        input: { streetLine1: tradingPointAddress || 'N/A', countryCode: 'RU' },
    });

    const eligible = await adminApi(EligibleShippingMethodsForDraftOrderDocument, { orderId });
    const shippingMethodId = eligible.eligibleShippingMethodsForDraftOrder[0]?.id;
    if (shippingMethodId) {
        await adminApi(SetDraftOrderShippingMethodDocument, { orderId, id: shippingMethodId });
    }

    const transition = await adminApi(TransitionOrderToStateDocument, { id: orderId });
    if (
        !transition.transitionOrderToState ||
        transition.transitionOrderToState.__typename !== 'Order'
    ) {
        throw new Error(
            transition.transitionOrderToState && 'message' in transition.transitionOrderToState
                ? (transition.transitionOrderToState.message ?? 'Could not proceed to payment')
                : 'Could not proceed to payment',
        );
    }

    const payment = await adminApi(AddManualPaymentToOrderDocument, {
        input: { orderId, method: paymentMethod, metadata: {} },
    });
    if (payment.addManualPaymentToOrder.__typename !== 'Order') {
        throw new Error(payment.addManualPaymentToOrder.message ?? 'Could not place order');
    }
    return { code: payment.addManualPaymentToOrder.code };
}
